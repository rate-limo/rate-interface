"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { useEffect, useRef } from "react";
import { WagmiProvider, createConfig, cookieToInitialState, http, useReconnect, type Config } from "wagmi";
import { wagmiChains } from "@/lib/customChains";
import { meraConnector } from "@/lib/wallet/meraConnector";

/**
 * Wallet + data providers.
 *
 * No wallet vendor, and as of 2026-09-07 exactly ONE connector.
 *
 *  - `meraConnector` — the embedded account, derived from a passkey. Every write
 *    in this app is signed by it.
 *
 * ## Why `injected` was removed as a CONNECTOR
 *
 * An injected wallet signs only for the network it currently sits on. This venue
 * merges chains everywhere it reads — Explore, the leaderboards, the tape — so a
 * browser wallet as signer meant a `wallet_switchEthereumChain` prompt in the
 * middle of any trade whose market was not on the wallet's current chain. That is
 * not a rough edge: it is a modal interruption on the app's primary action, and
 * it is why `PlaceOrderButton` and `SwapCard` grew two DIFFERENT switch UXes.
 *
 * The passkey connector names the chain in each transaction (see
 * `meraConnector.ts`), so it has no ambient current network and can never be on
 * the wrong one. With one connector there is nothing to switch, nothing to
 * disagree, and one signing path to test.
 *
 * MetaMask keeps the job it is actually good at — holding money and sending one
 * transaction on one chain — as a FUNDING source in `lib/wallet/externalFunding.ts`.
 * That module talks EIP-1193 directly and is deliberately not a connector: it
 * cannot become `useAccount()`, so no bug there can make the app sign with the
 * wrong wallet.
 *
 * The cost, stated plainly: a passkey provider without the WebAuthn PRF extension
 * cannot hold a wallet (`describeConnectError`'s `PRF_UNAVAILABLE`), and such a
 * visitor now has no signing path at all. That is a deliberate trade, not an
 * oversight.
 *
 * Privy was removed on 2026-08-31, one day after replacing AppKit. What it was
 * still doing by then was OAuth, sessions and account linking — and this repo
 * already owns the first two: `apps/waitlist/app/api/waitlist/x/*` runs a full
 * X OAuth flow, `gateway/src/profileAuth.ts` verifies a signed canonical
 * message, and `admin-service/src/referral.ts` issues single-use nonces and
 * recovers the address from the signature. A passkey account can sign those
 * challenges like any other wallet, so the identity loop closes here.
 *
 * What genuinely left with Privy, and is NOT replaced: email login (there is no
 * mail transport anywhere in this monorepo) and Google/Apple OAuth (only X
 * exists, and only in the waitlist app). Adding either is a route plus a
 * credential, not a vendor.
 *
 * SSR hydration is back: wagmi's own `cookieToInitialState`, which AppKit used
 * and Privy did not need because it restored client-side behind a `ready` flag.
 */
export const wagmiConfig = createConfig({
  chains: wagmiChains,
  connectors: [
    meraConnector({
      // What the authenticator shows when the user picks a passkey later. There
      // is no email in the app now that Privy is gone, so this is deliberately
      // generic rather than a fabricated identifier.
      userName: () => "Rate wallet",
    }),
  ],
  /**
   * OFF, and this is load-bearing rather than tidiness.
   *
   * wagmi defaults it to TRUE, which auto-registers every EIP-6963 wallet the
   * browser announces as a connector — regardless of the `connectors` array
   * above. So "exactly one connector, the passkey" was never true on a machine
   * with MetaMask installed, and two comments in this codebase asserted that it
   * was: this file's, and the deposit panel's claim that an injected wallet
   * "can never become useAccount()".
   *
   * It could. Approving the deposit sheet's `eth_requestAccounts` promoted the
   * discovered connector to the ACTIVE account, so funding the passkey wallet
   * from MetaMask silently swapped the session over to MetaMask — the user is
   * then signing trades from a different address than the one they funded.
   *
   * The mount-time reconnect note below is the other half of the same evidence:
   * it describes an injected extension rejecting during reconnect, which could
   * only happen if injected connectors were in the config at all.
   *
   * Nothing enumerates connectors for a UI — `ConnectWalletDialog` offers the
   * passkey alone, deliberately (an injected wallet signs for one network and
   * interrupts every cross-chain trade with a switch prompt). Browser wallets
   * still work for deposits, through `lib/wallet/externalFunding.ts`, which
   * talks EIP-1193 to the provider directly and never touches wagmi state.
   */
  multiInjectedProviderDiscovery: false,
  transports: Object.fromEntries(wagmiChains.map((c) => [c.id, http()])) as never,
  // Serialisable state for SSR, so a returning session is connected on the
  // first paint rather than flashing "disconnected" on every navigation.
  ssr: true,
});

/**
 * Exported so a test can watch the client the APP actually uses.
 *
 * `useQueryClient()` inside these providers resolves to this instance, never to
 * one a test wraps around `<Providers>` — so spying on an outer client proves
 * nothing about whether the bridge below is wired in at all.
 */
export const queryClient = new QueryClient();

export default function Providers({
  children,
  cookies,
}: {
  children: React.ReactNode;
  /** Forwarded from the server layout for SSR hydration. */
  cookies?: string | null;
}) {
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies ?? undefined);

  return (
    /**
     * `reconnectOnMount={false}`, with the reconnect done below instead.
     *
     * WagmiProvider's own mount-time reconnect leaves its rejection uncaught, and
     * an INJECTED wallet extension is entitled to reject however it likes. One in
     * the wild rejects with a bare EIP-1193 object —
     * `{code: 4001, message: "wallet must has at least one account"}` — which is
     * not an Error, so Next's overlay stringifies it and shows a full-screen
     * runtime error reading exactly "[object Object]": no stack, no page, nothing
     * naming the extension that caused it.
     *
     * Nothing in this app is wrong when that happens, and nothing in this app
     * could fix the extension. What it can do is own the reconnect, so a refusal
     * lands somewhere. `useReconnect` is a mutation, so a rejection becomes state
     * rather than an unhandled rejection — which is the whole difference between
     * a wallet that quietly stayed disconnected and a dev overlay covering the
     * page.
     *
     * Behaviour is otherwise unchanged: it still runs once on mount, still passes
     * `isReconnecting`, and `meraConnector.connect` still refuses it — see the
     * long note there about why being asked is not permission to prompt.
     */
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <ReconnectOnMount />
        <BalanceRefetchBridge />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/**
 * The reconnect WagmiProvider would have run, with its failure caught.
 *
 * Inside the providers because `useReconnect` needs both of them. Renders
 * nothing and runs exactly once — a second reconnect while one is in flight is
 * what produced the "connected then immediately disconnected" bug this file's
 * connector notes describe.
 */
function ReconnectOnMount() {
  const { reconnect } = useReconnect();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // The mutation form: errors land in mutation state, never as an unhandled
    // rejection. There is nothing to show the user — a wallet that declines to
    // restore is simply a disconnected wallet, which the UI already renders.
    reconnect();
  }, [reconnect]);

  return null;
}

/**
 * `spot-balance-refetch` → wagmi's own balance reads.
 *
 * The event's declaration promises that "every balance hook refetches", and for
 * a long time that was true of exactly two: `useTokenlistBalances` and
 * `useERC20BalanceAllowance` each subscribe and call their own `refetch`.
 * Anything reading a balance through wagmi's `useBalance` or `useReadContracts`
 * — which is what the SWAP CARD does for both of its legs — was never told.
 *
 * So a confirmed swap emitted the event at the receipt, two hooks nobody on that
 * screen was using refetched, and the balance rows directly above the amount
 * field went on showing the pre-trade figures until something else happened to
 * remount them.
 *
 * Here rather than in the card, because the next `useBalance` caller would
 * otherwise have to rediscover this. `["balance"]` is wagmi's key for
 * `getBalance` (verified in @wagmi/core's `getBalanceQueryKey`) and
 * `["readContracts"]` is the multicall the portfolio's cross-chain read uses —
 * the same two `WalletTransferModal` invalidates after a confirmed transfer.
 *
 * It deliberately does NOT touch `tokenlistBalances`: that hook already
 * subscribes to this event itself, and invalidating it here as well would issue
 * the same read twice.
 *
 * Invalidate rather than emit a figure. The event carries nothing on purpose —
 * a swap's delivered amount depends on how the route filled, and on a chain
 * whose gas asset is the token being traded the fee comes out of the same
 * balance. See the event's own declaration.
 */
function BalanceRefetchBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    };
    eventBus.on("spot-balance-refetch", handler);
    return () => {
      eventBus.off("spot-balance-refetch", handler);
    };
  }, [queryClient]);

  return null;
}
