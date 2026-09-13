"use client";

/**
 * A wagmi connector backed by a mera passkey account.
 *
 * ## Why a connector rather than a side channel
 *
 * 48 call sites in this app gate on wagmi's `isConnected`, and every write goes
 * through `useWriteContract`. A signer the connector layer does not know about
 * is a signer none of that can see — the app would show "connect wallet" to
 * someone holding a funded account. Wrapping mera as a connector is what makes
 * the passkey account a first-class wallet everywhere, with no call site
 * changed.
 *
 * ## The account is LOCAL, which is the whole advantage
 *
 * `toViemAccount` gives a viem `LocalAccount`: we hold the key, so signing is a
 * pure computation. There is no wallet to be "on the wrong chain" — a
 * transaction names its chain and is signed for it. `switchChain` therefore
 * cannot fail and never prompts, which is precisely the class of bug that cost
 * a day under AppKit (see lib/launch/execution.ts).
 *
 * ## Reload ends the session, and that is not a bug to paper over
 *
 * The key exists only inside a live mera session, in memory. A hard reload
 * destroys it, so `isAuthorized` answers false and wagmi does not silently
 * reconnect — the user taps their passkey again. That is the honest cost of not
 * having a custodian hold the key for them: the alternative is persisting key
 * material, which is the thing this architecture exists to avoid.
 */

import { createConnector } from "wagmi";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  type Address,
  type EIP1193RequestFn,
  type Hex,
  type LocalAccount,
} from "viem";
import { wagmiChains } from "@/lib/customChains";
import { createMeraSigner, hasMeraCredential, unlockMeraSigner, type MeraSigner } from "./mera";

export const MERA_CONNECTOR_ID = "mera";

type Provider = { request: EIP1193RequestFn };

function chainById(id: number) {
  const chain = wagmiChains.find((c) => c.id === id);
  if (!chain) throw new Error(`Chain ${id} is not configured — see lib/customChains.ts`);
  return chain;
}

export function meraConnector(params: {
  /** Shown by the authenticator when the user picks a passkey. */
  userName: () => string;
}) {
  let signer: MeraSigner | null = null;
  let chainId: number = wagmiChains[0].id;

  return createConnector<Provider>((config) => ({
    id: MERA_CONNECTOR_ID,
    name: "Passkey",
    type: "mera" as const,

    async setup() {
      // Nothing: setup runs on page load and a passkey prompt without a user
      // gesture is refused by the browser anyway.
    },

    async connect<withCapabilities extends boolean = false>(
      parameters?: { chainId?: number; isReconnecting?: boolean; withCapabilities?: withCapabilities | boolean },
    ) {
      const requested = parameters?.chainId;

      // RECONNECT MUST NOT PROMPT, and this is the whole of two bugs.
      //
      // `WagmiProvider` runs `reconnect` on every mount, which calls this with
      // `isReconnecting: true`. Once a credential pointer exists in localStorage
      // `hasMeraCredential()` is true, so the line below would call
      // `unlockMeraSigner()` — a WebAuthn prompt — from a page load with no user
      // gesture. The browser refuses it, this throws, and wagmi responds by
      // clearing the connection.
      //
      // Symptoms that produced: a second sign-in prompt appearing on its own,
      // and a wallet that connected and then went straight back to disconnected
      // because the mount-time reconnect landed after the click-time connect and
      // failed.
      //
      // Refusing here is not a limitation, it is the design this file already
      // documents: the key lives only in a live session, so a reload genuinely
      // ends it and the user taps their passkey again. `isAuthorized()` returns
      // false for the same reason. What was missing is that wagmi asks anyway,
      // and being asked is not permission to prompt.
      if (parameters?.isReconnecting) {
        throw new Error(
          "The passkey session ended with the page. Connect again to unlock it — " +
            "restoring it needs a tap, which a page load cannot ask for.",
        );
      }

      // An existing pointer means "unlock"; its absence means "create". Both
      // prompt, and both must be reached from a click — wagmi's connect() is,
      // so this is safe here and would not be from setup().
      signer = hasMeraCredential()
        ? await unlockMeraSigner()
        : await createMeraSigner({ name: params.userName() });

      if (!signer) {
        // A stored pointer that no longer resolves: the passkey was deleted, or
        // this is a different origin. Falling back to creation silently would
        // mint a SECOND account and strand the first, so this fails loudly.
        throw new Error("That passkey is no longer available on this device.");
      }

      if (requested) chainId = requested;
      // wagmi lets a caller ask for capability-annotated accounts. A local key
      // advertises none, so the shape is satisfied with an empty record rather
      // than claiming support this connector does not have.
      const accounts = parameters?.withCapabilities
        ? [{ address: signer.account.address, capabilities: {} }]
        : [signer.account.address];
      // The cast goes through `unknown`: the union built above cannot be proven
      // to match the conditional return type, because the branch was chosen at
      // RUNTIME from `withCapabilities` while the type is resolved statically.
      // This is the one place the two views meet, and it is why the branch and
      // the type sit two lines apart rather than in separate helpers.
      return { accounts, chainId } as unknown as {
        accounts: withCapabilities extends true
          ? readonly { address: Address; capabilities: Record<string, unknown> }[]
          : readonly Address[];
        chainId: number;
      };
    },

    async disconnect() {
      // Zeroes the in-memory key. Signing afterwards throws SESSION_ENDED,
      // which is the correct outcome — a disconnected wallet must not sign.
      signer?.end();
      signer = null;
    },

    async getAccounts() {
      return signer ? ([signer.account.address] as readonly Address[]) : [];
    },

    async getChainId() {
      return chainId;
    },

    async isAuthorized() {
      // Only a LIVE session counts. A stored credential means the user *can*
      // reconnect, not that they are connected — answering true here would make
      // wagmi report a connected account with no key behind it.
      return signer !== null;
    },

    async switchChain({ chainId: next }) {
      const chain = chainById(next);
      // No prompt and nothing can refuse: a local key signs for whichever chain
      // the transaction names.
      chainId = next;
      config.emitter.emit("change", { chainId: next });
      return chain;
    },

    async getProvider() {
      const account = signer?.account;
      if (!account) throw new Error("Passkey wallet is locked.");
      return { request: makeRequest(account, () => chainId) } as Provider;
    },

    onAccountsChanged() {
      // A local account cannot change underneath us; there is no wallet UI to
      // change it from.
    },
    onChainChanged() {},
    onDisconnect() {
      signer?.end();
      signer = null;
    },
  }));
}

/**
 * A minimal EIP-1193 surface over the local account.
 *
 * Only the methods this app actually issues are implemented, and anything else
 * is forwarded to the chain's own RPC rather than silently returning undefined
 * — a method answered with nothing is far harder to diagnose than one that
 * reports it is unsupported.
 */
/**
 * Just `execute`. The full artifact is not imported because this is the only
 * function the app ever calls and a drifted copy of the rest would be worse
 * than no copy — see `components/abis/exchange` for why a fragment that is not
 * shipped cannot be decoded.
 */
const BATCH_EXECUTOR_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

function makeRequest(account: LocalAccount, getChainId: () => number): EIP1193RequestFn {
  return (async ({ method, params }: { method: string; params?: unknown }) => {
    const chain = chainById(getChainId());

    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account.address];

      case "eth_chainId":
        return `0x${getChainId().toString(16)}`;

      case "personal_sign": {
        const [data] = params as [Hex, Address];
        return account.signMessage({ message: { raw: data } });
      }

      case "eth_signTypedData_v4": {
        const [, json] = params as [Address, string];
        return account.signTypedData(JSON.parse(json));
      }

      case "eth_sendTransaction": {
        const [tx] = params as [Record<string, Hex> & { authorizationList?: unknown }];
        // Signed locally, then broadcast through the chain's own RPC. The chain
        // comes from the connector's state, never from the wallet — there is no
        // wallet to disagree with.
        const wallet = createWalletClient({ account, chain, transport: http() });
        return wallet.sendTransaction({
          to: tx.to as Address,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          // EIP-7702. Forwarded rather than dropped, which is what lets this
          // account BATCH: the authorization names a delegate whose code the
          // account then runs for this transaction, so several transfers land
          // atomically instead of as a sequence that can half-apply.
          //
          // Passing it through is the whole change — viem builds the type-4
          // transaction once the field is present, and every other method here
          // is unaffected. Dropping it silently was the previous behaviour, and
          // that is the failure worth naming: `signAuthorization` succeeds, the
          // transaction broadcasts, and it simply is not a batch. Nothing
          // errors; the second transfer never happens.
          ...(tx.authorizationList
            ? { authorizationList: tx.authorizationList as never }
            : {}),
          chain,
        });
      }

      /**
       * EIP-7702 batch. NON-STANDARD, and namespaced so it can never collide
       * with a real RPC method.
       *
       * The account has to sign the authorization AND send the transaction, and
       * only this closure holds the account — so both happen here. The
       * alternative is exposing the `LocalAccount` to callers, which would hand
       * every one of them the key rather than the one capability they need.
       *
       * wagmi's `sendTransaction` cannot carry this: `@wagmi/core`'s action has
       * no `authorizationList` in its parameters, so the field is dropped before
       * viem ever sees it and the result is an ordinary transaction that
       * executes the first call and nothing else. Callers go through
       * `lib/wallet/sendBatch.ts`, which requests this method on the provider
       * directly.
       *
       * `executor` is the delegate whose code the account runs for this
       * transaction — `contracts/src/wallet/BatchExecutor.sol`. Its `execute`
       * is gated on `msg.sender == address(this)`, so the authorization is what
       * makes the call legal and nothing else can use it.
       */
      case "mera_sendBatch": {
        const [batch] = params as [
          { executor: Address; calls: { to: Address; value: Hex; data: Hex }[] },
        ];
        const wallet = createWalletClient({ account, chain, transport: http() });

        // Signed for THIS chain only. An authorization with chainId 0 is valid
        // on every chain, which is a standing delegation the user did not ask
        // for — this account's whole design is that it carries no contract.
        const authorization = await wallet.signAuthorization({
          account,
          contractAddress: batch.executor,
          executor: "self",
        });

        return wallet.sendTransaction({
          // To ITSELF: under 7702 the account runs the delegate's code, so the
          // call has to land on the account for `msg.sender == address(this)`
          // to hold. Sending to the executor instead calls the bare
          // implementation, which reverts `NotSelf` — correctly.
          to: account.address,
          data: encodeFunctionData({
            abi: BATCH_EXECUTOR_ABI,
            functionName: "execute",
            args: [
              batch.calls.map((c) => ({
                to: c.to,
                value: BigInt(c.value),
                data: c.data,
              })),
            ],
          }),
          authorizationList: [authorization],
          chain,
        });
      }

      default: {
        const rpc = createWalletClient({ chain, transport: http() });
        return rpc.request({ method, params } as never);
      }
    }
  }) as EIP1193RequestFn;
}

/** Unused today; kept so the import surface reads as intended. */
export type { Provider as MeraProvider };
export { custom as _custom };
