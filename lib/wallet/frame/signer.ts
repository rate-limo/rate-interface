"use client";

/**
 * Signing, on the wallet origin, one request at a time.
 *
 * This runs ONLY inside the wallet frame (`app/wallet-frame/*`). It is the one
 * place in the app that turns stored bytes into a viem account, and it holds
 * that account for exactly as long as one request takes.
 *
 * ## Decrypt per signature
 *
 * `meraSession.ts` wraps the key under a non-extractable browser key and the
 * connector used to decrypt it once, on resume, and keep the plaintext in a
 * mera signing session for the life of the tab. Here every request restores,
 * signs, and ends: the plaintext exists for the microseconds AES-GCM and
 * secp256k1 take, and a heap snapshot between requests finds a `CryptoKey`
 * handle and ciphertext. AES on 32 bytes is not a cost worth measuring.
 *
 * ## The address is checked every time
 *
 * The stored record names the address it was filed under, and the key is
 * re-derived on every restore. A mismatch ends the session rather than
 * signing: nothing should ever be signed by a key that does not derive the
 * account the caller believes it is talking to.
 *
 * ## The request shapes are the connector's old `makeRequest`
 *
 * Moved here whole — `personal_sign`, `eth_signTypedData_v4`,
 * `eth_sendTransaction` (with EIP-7702 `authorizationList` forwarded, see the
 * note inline) and `mera_sendBatch`. What changed is where it runs, not what
 * it does. Reads that need no key (`eth_accounts`, `eth_chainId`, everything
 * unknown) never arrive here; the connector answers those on the app side.
 */

import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { wagmiChains } from "@/lib/customChains";
import {
  endMeraSession,
  meraSessionAddress,
  meraSessionExpiry,
  restoreMeraSession,
  saveMeraSession,
} from "../meraSession";
import { sendWithNonce } from "./nonce";
import { ERR, WalletFrameError, type StatusResult, type WalletRpc } from "./protocol";

/**
 * Just `execute`. The full artifact is not imported because this is the only
 * function the frame ever calls and a drifted copy of the rest would be worse
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

function chainById(id: number) {
  const chain = wagmiChains.find((c) => c.id === id);
  if (!chain) throw new WalletFrameError({ code: ERR.INVALID_PARAMS, message: `Chain ${id} is not configured.` });
  return chain;
}

const locked = () =>
  new WalletFrameError({
    code: ERR.LOCKED,
    message: "The passkey session has expired. Connect again to unlock it.",
  });

/** What a stored session says, without decrypting anything. */
export function sessionStatus(): StatusResult {
  return {
    address: (meraSessionAddress() as Address | null) ?? null,
    expiresAt: meraSessionExpiry(),
  };
}

/**
 * Run `fn` with the account for as long as it takes, then zero the key.
 *
 * `restored.privateKey` is the decrypted copy; mera's `session.end()` zeroes
 * its own, and the buffer handed in is zeroed here too so neither survives.
 */
async function withAccount<T>(fn: (account: LocalAccount) => Promise<T>): Promise<T> {
  const restored = await restoreMeraSession();
  if (!restored) throw locked();

  const session = createSecp256k1SigningSession({ privateKey: restored.privateKey });
  try {
    const account = toViemAccount(session);
    if (account.address.toLowerCase() !== restored.address.toLowerCase()) {
      endMeraSession();
      throw locked();
    }
    return await fn(account);
  } finally {
    session.end();
    restored.privateKey.fill(0);
  }
}

/** Confirm a stored session still decrypts, and say whose it is. */
export async function resumeSession(): Promise<Address> {
  return withAccount(async (account) => account.address);
}

/**
 * Take the PRF output from a ceremony the APP ran, and make it this origin's
 * session.
 *
 * The bytes arrive over `postMessage` and are the account: derive the address,
 * persist under the wrapping key, zero the copy. The clock starts now — at the
 * tap — which is what `saveMeraSession` documents.
 */
export async function unlockSession(prfOutput: Uint8Array): Promise<Address> {
  const session = createSecp256k1SigningSession({ privateKey: prfOutput });
  try {
    const address = toViemAccount(session).address;
    await saveMeraSession(prfOutput, address);
    return address;
  } finally {
    session.end();
    prfOutput.fill(0);
  }
}

export function endSession(): void {
  endMeraSession();
}

/**
 * Sign — and where the request is a transaction, broadcast — on `chainId`.
 *
 * Returns what an EIP-1193 provider would: a signature hex for the two sign
 * methods, a transaction hash for the two send methods. Signed transaction
 * bytes never leave this function: the frame broadcasts to the chain's RPC
 * itself and hands back the hash, so the app origin never holds anything it
 * could re-broadcast.
 */
/** The RPC's pending transaction count, read fresh for every attempt. */
function pendingCount(chain: ReturnType<typeof chainById>, address: Address) {
  const client = createPublicClient({ chain, transport: http() });
  return () => client.getTransactionCount({ address, blockTag: "pending" });
}

export async function executeSigned(chainId: number, rpc: WalletRpc): Promise<Hex> {
  const chain = chainById(chainId);

  return withAccount(async (account) => {
    switch (rpc.method) {
      case "personal_sign": {
        const [data] = rpc.params as [Hex | string, Address];
        return account.signMessage({
          message: typeof data === "string" && data.startsWith("0x") ? { raw: data as Hex } : String(data),
        });
      }

      case "eth_signTypedData_v4":
      case "eth_signTypedData": {
        const [, json] = rpc.params as [Address, string | object];
        return account.signTypedData(typeof json === "string" ? JSON.parse(json) : json);
      }

      case "eth_sendTransaction": {
        const [tx] = rpc.params as [Record<string, Hex> & { authorizationList?: unknown }];
        const wallet = createWalletClient({ account, chain, transport: http() });
        // The nonce is chosen here, not by viem: see `nonce.ts` for the order
        // that reused its approval's nonce on a lagging RPC.
        return sendWithNonce({
          chainId,
          address: account.address,
          pending: pendingCount(chain, account.address),
          send: (nonce) =>
            wallet.sendTransaction({
              to: tx.to as Address,
              data: tx.data,
              value: tx.value ? BigInt(tx.value) : undefined,
              gas: tx.gas ? BigInt(tx.gas) : undefined,
              nonce,
              // EIP-7702. Forwarded rather than dropped, which is what lets this
              // account BATCH. Dropping it silently was an earlier behaviour and
              // the failure worth naming: `signAuthorization` succeeds, the
              // transaction broadcasts, and it simply is not a batch.
              ...(tx.authorizationList ? { authorizationList: tx.authorizationList as never } : {}),
              chain,
            }),
        });
      }

      /**
       * EIP-7702 batch. NON-STANDARD, and namespaced so it can never collide
       * with a real RPC method. The account signs the authorization AND sends
       * the transaction, and only this closure holds the account — so both
       * happen here. `executor` is `contracts/src/wallet/BatchExecutor.sol`,
       * whose `execute` is gated on `msg.sender == address(this)`.
       */
      case "mera_sendBatch": {
        const [batch] = rpc.params as [
          { executor: Address; calls: { to: Address; value: Hex; data: Hex }[] },
        ];
        const wallet = createWalletClient({ account, chain, transport: http() });

        // Signed for THIS chain only. An authorization with chainId 0 is valid
        // on every chain, which is a standing delegation the user did not ask
        // for — this account's whole design is that it carries no contract.
        return sendWithNonce({
          chainId,
          address: account.address,
          pending: pendingCount(chain, account.address),
          send: async (nonce) => {
            // A self-executed authorization is consumed AFTER the transaction
            // bumps the nonce, so it carries nonce + 1. That is what
            // `executor: "self"` computes from its own read; given the nonce
            // explicitly, the two can no longer come from different reads.
            const authorization = await wallet.signAuthorization({
              account,
              contractAddress: batch.executor,
              nonce: nonce + 1,
            });

            return wallet.sendTransaction({
              nonce,
              // To ITSELF: under 7702 the account runs the delegate's code, so the
              // call has to land on the account for `msg.sender == address(this)`
              // to hold.
              to: account.address,
              data: encodeFunctionData({
                abi: BATCH_EXECUTOR_ABI,
                functionName: "execute",
                args: [batch.calls.map((c) => ({ to: c.to, value: BigInt(c.value), data: c.data }))],
              }),
              authorizationList: [authorization],
              chain,
            });
          },
        });
      }

      default:
        throw new WalletFrameError({ code: ERR.UNSUPPORTED, message: `The wallet does not sign ${rpc.method}.` });
    }
  });
}
