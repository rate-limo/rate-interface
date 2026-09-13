"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { Toaster } from "sonner";
import { indexerData } from "@/lib/portfolio/mock";
import { useWalletBalances } from "@/lib/portfolio/useBalances";
import { usePortfolioLive } from "@/hooks/usePortfolioLive";
import { useCrossChainPositions } from "@/hooks/useCrossChainPositions";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { slugToNetworkName } from "@/consts";
import type { AccountPositions, IndexerData } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";
import { money } from "./parts";
import { AssetsPanel, type DemoState } from "./AssetsPanel";
import { ActivityContent, tabDefs, type SectionKey } from "./ActivityTabs";
import { EarningsModal } from "./EarningsModal";
import { PositionsList } from "./PositionsList";
import { Rewards } from "./Rewards";
import { Referrals } from "./Referrals";
import { Creator } from "./Creator";
import { ProfileHeader } from "./ProfileHeader";

const MOCK_ADDRESS = "0x51a7…c4e9";

function numeric(value: string): number {
  const parsed = Number(value.replaceAll(",", "").replace(/^\$\s*/, "").split(" ")[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Cross-chain portfolio — one view across every chain.
 *
 * That sentence was aspirational until 2026-09-02: `useWalletBalances` returned
 * `chains: [chain]` and `useAccountPositions` read one gateway, while the header
 * printed "Net worth · all chains". Both now fan out, so the heading is a
 * description rather than an intention.
 *
 * Balances read per chain over RPC and positions per chain over HTTP, each
 * degrading independently — a chain that cannot be reached reports `error` and
 * contributes nothing to the totals, so the figure is a floor rather than a
 * confident understatement.
 *
 * Orders / LPs / trades / history / rewards / referrals stay SINGLE chain, and
 * that is correct: they are activity on a specific book, not a wallet-wide
 * fact. `networkName` below is theirs. Data stays behind the mock seam in
 * lib/portfolio.
 */
export function PortfolioView({ networkSlug, initialSection }: { networkSlug: string; initialSection?: SectionKey }) {
  const { address, isConnected } = useAccount();
  const { open } = useWalletConnect();

  // Open orders, order history, trades, LP positions, rewards, creator launches
  // and the referrals SUMMARY come from real routes; only referee rows keep the
  // illustrative data. Merging here rather than inside `indexerData()`
  // keeps the mock a pure fixture — the thing to delete a tab at a time as each
  // gets a source, rather than a module that half-fetches.
  const networkName = slugToNetworkName[networkSlug] ?? networkSlug;
  const balances = useWalletBalances(networkName, address);
  const live = usePortfolioLive(networkName, address);
  /**
   * Positions across EVERY chain, matching the balances above. Its own read
   * rather than a leg of `usePortfolioLive` — see `useCrossChainPositions` for
   * why the sum happens client-side and why a chain that failed contributes
   * absence rather than zero.
   */
  const positions = useCrossChainPositions(address);
  const marketTokens = useLiveSwapTokens(networkName, Boolean(address));
  const mock = useMemo<IndexerData>(() => indexerData(), []);
  const data = useMemo<IndexerData>(
    () => ({
      ...mock,
      orders: live.data.orders,
      stopOrders: live.data.stopOrders,
      stopOrderHistory: live.data.stopOrderHistory,
      history: live.data.history,
      trades: live.data.trades,
      lps: live.data.lps,
      rewards: live.data.rewards,
      creator: live.data.creator,
      // Summary live, rows still illustrative — the referee table wants other
      // people's wallets and volumes, which no route publishes. Merging at this
      // level rather than inside the hook keeps that split visible.
      referrals: { ...mock.referrals, summary: live.data.referralSummary },
    }),
    [mock, live.data],
  );

  const [demo, setDemo] = useState<DemoState>("live");
  const [spinning, setSpinning] = useState(false);
  /**
   * The opening tab, addressable so another surface can send someone to the RIGHT
   * one.
   *
   * It exists because the swap card's "order placed" toast links here, and a stop
   * order does not live in Open orders — it is held by the stop engine until its
   * trigger, and has its own tab. Landing every link on the default would tell a
   * user their stop order is missing.
   *
   * Read from a prop rather than `useSearchParams` so this page keeps rendering
   * without a Suspense boundary, and validated against the tab list rather than
   * cast: a hand-edited URL selects the default instead of a tab that does not
   * exist.
   */
  const [section, setSection] = useState<SectionKey>(initialSection ?? "orders");

  const refresh = () => {
    setDemo("live");
    setSpinning(true);
    balances.refetchAll();
    void live.refetch();
    void positions.refetch();
    void marketTokens.refetch();
    window.setTimeout(() => setSpinning(false), 1100);
  };

  if (!isConnected) {
    return <ConnectGate onConnect={() => open()} />;
  }

  const allChains = balances.chains;
  /**
   * "N chains" beside a net worth reads as "your money is spread across N
   * chains", not "we queried N gateways". So the header counts chains this
   * wallet HOLDS something on — a wallet that has never touched RISE must not
   * be told it is on two chains because the app asked two questions.
   *
   * A chain in `error` is excluded too: its holdings are unknown, and counting
   * it would assert something we could not read.
   */
  const chains = allChains.filter((c) => c.state === "ok" && c.tokens.length > 0);
  const failedChains = allChains.filter((c) => c.state === "error").map((c) => c.network);
  const assetCount = chains.reduce((s, c) => s + c.tokens.length, 0);
  const prices = new Map(
    (marketTokens.data ?? []).map((token) => [token.symbol.toUpperCase(), token.priceUsd]),
  );
  const tokenUsd = (symbol: string) => prices.get(symbol.toUpperCase()) ?? 0;
  const inOrdersUsd = data.orders.reduce((sum, order) => {
    const symbol = order.side === "Buy" ? order.market.quote : order.market.base;
    return sum + numeric(order.amount) * tokenUsd(symbol);
  }, 0);
  const inLpUsd = data.lps.reduce((sum, position) => {
    return sum + position.provided.split(" + ").reduce((positionSum, leg) => {
      const [amount = "0", symbol = ""] = leg.trim().split(/\s+/);
      return positionSum + numeric(amount) * tokenUsd(symbol);
    }, 0);
  }, 0);
  const netWorthUsd = balances.totalUsd + inOrdersUsd + inLpUsd;
  const rewardSummary = data.rewards.summary;
  const measurableAprs = data.lps.flatMap((position) =>
    position.aprPct === null ? [] : [position.aprPct],
  );
  const averageApr = measurableAprs.length
    ? measurableAprs.reduce((sum, apr) => sum + apr, 0) / measurableAprs.length
    : null;
  const summaryLoading = balances.loading || live.isLoading || marketTokens.isLoading;
  // Undefined while the read is in flight, so the badge appears with a number
  // rather than claiming zero positions first.
  const tabs = tabDefs(data, positions.isLoading ? undefined : positions.data.positions.length);
  const desktopSection = section === "assets" ? "orders" : section;

  const [earningsOpen, setEarningsOpen] = useState(false);

  const tiles = [
    {
      k: "Available · wallet",
      v: balances.loading ? "…" : money(balances.totalUsd),
      s: failedChains.length
        ? `${assetCount} assets · ${chains.length} chains · ${failedChains.length} unreachable`
        : `${assetCount} assets · ${chains.length} chains`,
      pts: false,
    },
    {
      k: "In open orders",
      v: summaryLoading ? "…" : money(inOrdersUsd),
      s: `${data.orders.length} orders`,
      pts: false,
    },
    {
      k: "In LP positions",
      v: summaryLoading ? "…" : money(inLpUsd),
      s: `${data.lps.length} · ${averageApr === null ? "—" : `~${averageApr.toFixed(1)}%`} APR`,
      pts: false,
    },
    {
      k: "Rewards · claimable",
      v: live.isLoading ? "…" : `${rewardSummary.claimablePts.toLocaleString("en-US")} pts`,
      s: `${rewardSummary.earnedPts.toLocaleString("en-US")} earned`,
      pts: true,
      // This tile already summarises what the modal details, so it IS the way in —
      // a separate Earnings button beside it would be two doors to one room.
      onClick: () => setEarningsOpen(true),
    },
  ];

  return (
    <div className="mx-auto max-w-[1160px] px-5 pb-24 pt-10 text-[color:var(--m-text-primary)]">
      <Toaster richColors position="bottom-right" />

      <EarningsModal
        data={data}
        open={earningsOpen}
        onOpenChange={setEarningsOpen}
        onOpenRewards={() => setSection("rewards")}
        onOpenReferrals={() => setSection("referrals")}
      />

      {/* profile header */}
      <ProfileHeader
        address={address ?? MOCK_ADDRESS}
        networkName={networkName}
        chains={chains}
        netWorthUsd={netWorthUsd}
        netWorthLoading={summaryLoading}
        onRefresh={refresh}
        spinning={spinning}
        onOpenRewards={() => setSection("rewards")}
      />

      {/* summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.k}
            {...(t.onClick
              ? {
                  role: "button" as const,
                  tabIndex: 0,
                  onClick: t.onClick,
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      t.onClick?.();
                    }
                  },
                }
              : {})}
            className={cn(
              "rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-3.5",
              t.onClick &&
                "cursor-pointer transition-colors hover:border-[color:var(--m-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]",
            )}
          >
            <div className="font-mono text-[10.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {t.k}
            </div>
            <div
              className={cn(
                "mt-1 text-[19px] font-semibold tabular-nums",
                t.pts && "text-[color:var(--m-logo)]"
              )}
            >
              {t.v}
            </div>
            <div className="mt-0.5 text-[11px] text-[color:var(--m-text-secondary)]">{t.s}</div>
          </div>
        ))}
      </div>

      {/* ---- desktop: activity + assets sidebar ---- */}
      {/*
        `minmax(0,1fr)`, NOT `1fr`.

        A bare `1fr` track is `minmax(auto, 1fr)`, and that `auto` minimum is the
        column's MIN-CONTENT width — so a wide child (a table, a long unbroken
        row) pushes the track past its share instead of scrolling inside it. The
        grid then overflows its container and drags the fixed sidebar with it: the
        panel below sat further right than every card above it, which is exactly
        what "assets are a little off on the width to the upper card layout"
        describes. Nothing overflows visibly — the sidebar is simply somewhere
        else than the layout it is meant to line up with.

        `minmax(0,1fr)` lets the track shrink to its share and hands the overflow
        back to the child, which already scrolls. Identical rendering whenever the
        content fits, so it is not a trade.
      */}
      <div className="hidden items-start gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_322px]">
        <div className="rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
          <div className="flex gap-0.5 overflow-x-auto border-b border-[color:var(--m-border)] px-2.5 py-2">
            {tabs.map((t) => (
              <TabButton
                key={t.key}
                on={desktopSection === t.key}
                onClick={() => setSection(t.key)}
                label={t.label}
                count={t.count}
              />
            ))}
          </div>
          <ActivityPanelBody
            view={desktopSection}
            data={data}
            positions={{ address: address ?? "", positions: positions.data.positions, totals: positions.data.totals }}
            positionsLoading={positions.isLoading}
            networkSlug={networkSlug}
            loading={live.isLoading}
          />
        </div>

        <aside className="sticky top-4">
          <AssetsPanel
            balances={balances}
            demo={demo}
            setDemo={setDemo}
            spinning={spinning}
            onRefresh={refresh}
            showDemoControl={false}
          />
        </aside>
      </div>

      {/* ---- mobile: unified scrollable tab bar (Assets + activity) ---- */}
      <div className="lg:hidden">
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {[{ key: "assets" as SectionKey, short: "Assets", count: undefined }, ...tabs].map((t) => (
            <MobileTab
              key={t.key}
              on={section === t.key}
              onClick={() => setSection(t.key)}
              label={t.short}
              count={t.count}
            />
          ))}
        </div>

        {section === "assets" ? (
          <AssetsPanel
            balances={balances}
            demo={demo}
            setDemo={setDemo}
            spinning={spinning}
            onRefresh={refresh}
            showDemoControl={false}
          />
        ) : (
          <div className="rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
            <ActivityPanelBody
              view={section}
              onOpenOrders={() => setSection("orders")}
              onRefresh={refresh}
              data={data}
              positions={{ address: address ?? "", positions: positions.data.positions, totals: positions.data.totals }}
              positionsLoading={positions.isLoading}
              networkSlug={networkSlug}
              loading={live.isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityPanelBody({
  view,
  data,
  positions,
  positionsLoading,
  networkSlug,
  loading,
  onOpenOrders,
  onRefresh,
}: {
  view: SectionKey;
  data: IndexerData;
  positions: AccountPositions;
  positionsLoading: boolean;
  networkSlug: string;
  /** Indexer fan-out still in flight — see ActivityContent's `loading`. */
  loading: boolean;
  /** Passed straight through to the stop-orders table. See ActivityContent. */
  onOpenOrders?: () => void;
  /** The page's own re-read, offered as the fix on a failed stop-order cancel. */
  onRefresh?: () => void;
}) {
  // Handled before the fallthrough: `ActivityContent` ends by rendering History
  // for any view it does not recognise, so an unhandled key here shows the wrong
  // table under the right tab and nothing throws.
  if (view === "positions") return <PositionsList data={positions} isLoading={positionsLoading} />;
  if (view === "rewards") return <Rewards data={data} />;
  if (view === "referrals") return <Referrals data={data} />;
  if (view === "creator") return <Creator data={data} networkSlug={networkSlug} />;
  return <ActivityContent view={view} data={data} networkSlug={networkSlug} loading={loading} onOpenOrders={onOpenOrders} onRefresh={onRefresh} />;
}

function TabButton({
  on,
  onClick,
  label,
  count,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-medium transition-colors",
        on
          ? "bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-text-primary)]"
          : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 font-mono text-[10.5px]",
            on
              ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
              : "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function MobileTab({
  on,
  onClick,
  label,
  count,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        on
          ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-primary)]"
          : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
      )}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-[color:var(--m-surface)] px-1.5 font-mono text-[9.5px]">
          {count}
        </span>
      )}
    </button>
  );
}

function ConnectGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1160px] flex-col items-center justify-center px-5 text-center text-[color:var(--m-text-primary)]">
      <h1 className="mb-2 text-2xl font-medium tracking-tight">
        Connect your wallet to see your portfolio
      </h1>
      <p className="mb-6 max-w-md text-sm text-[color:var(--m-text-secondary)]">
        One cross-chain view of your balances, open orders, LP positions, trades, rewards and
        referrals.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="rounded-[10px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--m-on-primary)] transition-colors hover:bg-[color:var(--m-primary-hover)]"
      >
        Connect wallet
      </button>
    </div>
  );
}
