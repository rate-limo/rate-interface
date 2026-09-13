"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { supportedNetworkName } from "@/lib/routing/chainParams";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useProfile } from "@/hooks/useProfile";
import { useCrossChainPositions } from "@/hooks/useCrossChainPositions";
import { useCreatedCoins } from "@/hooks/useCreatedCoins";
import { money } from "@/components/Portfolio/parts";
import { UNTRACKED_TITLE } from "@/lib/portfolio/positions";
import { compactNumber } from "@/lib/format/compact";
import type { ProfileSection } from "./section";
import { IdentityCard } from "./IdentityCard";
import { CoinList } from "./CoinList";
import { ValueCard } from "./ValueCard";
import { ActivityPanel } from "./ActivityPanel";
import { RepliesPanel } from "./RepliesPanel";
import { RewardsPanel } from "./RewardsPanel";

/**
 * A wallet's PUBLIC profile — `/[locale]/profile/[address]`.
 *
 * ## It is a component, not a page
 *
 * Everything here lives inside a **550px column** and the component owns no page
 * chrome: it stretches to its wrapper below that width and centres above it, so
 * one tree serves mobile and desktop with no breakpoint of its own. The route
 * file supplies the shell.
 *
 * ## What this is NOT
 *
 * `/portfolio` stays the owner's surface and keeps everything that only makes
 * sense for the connected wallet: editing, the rewards drawer, refresh, open
 * orders, LP positions and referrals. This page is a read of any address, so it
 * carries only what is true about a wallet regardless of who is looking. Where
 * an owner-only action belongs, it links to `/portfolio` rather than growing a
 * second copy of it behind an `isSelf` flag.
 *
 * ## Tabs
 *
 * Open and Closed are two views of ONE read — `/api/account/:address/positions`
 * returns both, because a position closed to zero keeps its realised PnL and
 * dropping it would make a wallet's lifetime PnL silently shrink as it closed
 * trades. Splitting them client-side means one request, not two.
 */
/** Re-exported for consumers of this component. The FUNCTION that parses it
 * lives in `./section` and must not be imported from here — see that file. */
export type { ProfileSection } from "./section";

export function ProfileView({
  address,
  networkSlug,
  initialSection,
  compact = false,
}: {
  address: string;
  networkSlug: string;
  initialSection?: ProfileSection;
  /**
   * Identity and performance only — no tabs, no tables, no page chrome.
   *
   * For the leaderboard's preview modal. It renders the SAME two cards this page opens
   * with, from the same hooks and the same derived totals, rather than a second summary
   * beside them: a modal that recomputes "followers" or "realised PnL" its own way is how
   * the two end up disagreeing about one wallet.
   *
   * What it drops is everything a dialog cannot hold honestly — five tab panels and a
   * scrolling coin table, which is what put a scrollbar through the middle of the
   * preview. Those live on the page, and the modal links to it.
   */
  compact?: boolean;
}) {
  /**
   * `supportedNetworkName`, not a raw map lookup.
   *
   * `readDisplaySlug` returns the slug verbatim — it does not validate, by
   * design, and every chain-scoped page pairs it with this helper (see
   * /launch). The ad-hoc `slugToNetworkName[slug] ?? slug` this replaced let
   * `?chain=nonsense` through as a network NAME, which has no PonderLinks entry,
   * so every per-chain read silently failed instead of falling back to the
   * default chain the rest of the app would have used.
   */
  const networkName = supportedNetworkName(networkSlug);
  const { address: viewer } = useAccount();

  // `viewer` is the CONNECTED wallet, not the one being viewed — it is what
  // makes the response carry `social.viewerFollows`.
  const account = useAccountProfile(networkName, address, viewer);
  const profile = useProfile(networkName, address);
  /**
   * Positions are read across EVERY chain, not just the one whose slug is in
   * the URL. A wallet is the same wallet everywhere, so a profile showing one
   * chain's PnL is showing a fraction of the answer while looking complete —
   * and `spotPositions` cannot be merged server-side (see lib/portfolio/crossChain).
   */
  const positions = useCrossChainPositions(address);

  const [section, setSection] = useState<ProfileSection>(initialSection ?? "coins");
  const [coinPage, setCoinPage] = useState(1);
  const coins = useCreatedCoins(networkName, address, 10, coinPage);


  const open = useMemo(
    () => positions.data.positions.filter((p) => (p.amount ?? 0) > 0),
    [positions.data.positions],
  );
  const closed = useMemo(
    () => positions.data.positions.filter((p) => (p.amount ?? 0) <= 0),
    [positions.data.positions],
  );

  const totals = positions.data.totals;
  const { failedChains } = positions.data;

  const tabs: { key: ProfileSection; label: string; count?: number }[] = [
    { key: "open", label: "Open", count: positions.isLoading ? undefined : open.length },
    { key: "closed", label: "Closed", count: positions.isLoading ? undefined : closed.length },
    { key: "coins", label: "Coins", count: coins.isLoading ? undefined : coins.data.totalCount },
    { key: "rewards", label: "Rewards" },
    { key: "replies", label: "Replies" },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-3 text-[color:var(--m-text-primary)]",
        // The page needs its own measure and a tail of scroll room; inside a dialog both
        // are the dialog's job, and `pb-24` there is 96px of dead space under the fold.
        compact ? "max-w-none" : "max-w-[550px] px-4 pb-24 pt-5",
      )}
    >
      {/* One Toaster per screen. The shell already mounts one, and a second inside a
          modal renders every toast twice for as long as it is open. */}
      {!compact && <Toaster richColors position="bottom-right" />}

      <IdentityCard
        address={address}
        networkName={networkName}
        networkSlug={networkSlug}
        account={account.data}
        profile={profile.data}
        isLoading={account.isLoading}
        viewerFollows={account.data.social.viewerFollows}
        // Seeds the shared `wallet-profile` query rather than a copy local to the card,
        // so the name and avatar the save returned reach every consumer on this page at
        // once instead of only the surface that opened the modal.
        onProfileSaved={profile.setProfile}
      />

      <ValueCard
        address={address}
        networkName={networkName}
        valueUsd={totals.valueUSD}
        unpricedCount={totals.unpricedCount}
        failedChains={failedChains}
        isLoading={positions.isLoading}
        realizedPnlUsd={totals.realizedPnlUSD}
        unrealizedPnlUsd={totals.unrealizedPnlUSD}
        volumeUsd={account.data.stats.volumeUsd}
        statsLoading={account.isLoading}
      />

      {compact ? null : (
        <>
      <div className="flex gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSection(tab.key)}
            aria-selected={section === tab.key}
            role="tab"
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-bold transition-colors",
              section === tab.key
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-selected)] text-[color:var(--m-primary)]"
                : "border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-[10px]",
                  section === tab.key
                    ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                    : "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]",
                )}
              >
                {/* The badge is a `px-1.5` pill at 10px. A raw count of
                    12,847 coins rendered as `12847` and stretched the pill
                    past the tab label it belongs to. */}
                {compactNumber(tab.count)}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === "coins" && (
        <CoinList
          coins={coins.data.coins}
          isLoading={coins.isLoading}
          page={coinPage}
          totalPages={coins.data.totalPages}
          onPage={setCoinPage}
          networkSlug={networkSlug}
          emptyLabel="This wallet hasn't created any coins."
          failed={coins.failed}
        />
      )}

      {section === "open" && (
        <PositionTable rows={open} isLoading={positions.isLoading} kind="open" />
      )}
      {section === "closed" && (
        <PositionTable rows={closed} isLoading={positions.isLoading} kind="closed" />
      )}

      {section === "rewards" && (
        <RewardsPanel address={address} networkName={networkName} />
      )}
      {section === "replies" && (
        <RepliesPanel address={address} networkName={networkName} networkSlug={networkSlug} />
      )}
      {section === "activity" && (
        <ActivityPanel address={address} networkName={networkName} networkSlug={networkSlug} />
      )}
        </>
      )}
    </div>
  );
}

function PositionTable({
  rows,
  isLoading,
  kind,
}: {
  rows: ReturnType<typeof useCrossChainPositions>["data"]["positions"];
  isLoading: boolean;
  kind: "open" | "closed";
}) {
  return (
    <div className="overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr>
              <Th>Token</Th>
              <Th right>{kind === "open" ? "Value" : "Trades"}</Th>
              <Th right>{kind === "open" ? "Unrealized" : "Realized"}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <Td colSpan={3} muted>
                  Loading…
                </Td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <Td colSpan={3} muted>
                  {kind === "open" ? "No open positions." : "No closed positions."}
                </Td>
              </tr>
            ) : (
              rows.map((row) => {
                const pnl = kind === "open" ? row.unrealizedPnlUSD : row.realizedPnlUSD;
                return (
                  <tr key={row.token} className="hover:bg-[color:var(--m-surface-2)]">
                    <Td>
                      <span className="font-bold">{row.symbol ?? "—"}</span>
                      {/* Which chain. Two chains can hold the same token
                          address, so the symbol alone does not identify a row
                          once these are merged. */}
                      <span className="ml-1.5 font-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
                        {row.networkName.replace(" Testnet", "")}
                      </span>
                      {/* Said out loud, never folded into PnL: the wallet sold
                          more than it was seen buying, so part arrived at a cost
                          nobody can know.

                          It read "untracked" until 2026-09-07, which is the name
                          of the database column and not a fact about anyone's
                          money — it was read as a MARK ON THE TOKEN (a coin from
                          the asset generator, say) rather than a gap in our
                          record of it. `UNTRACKED_TITLE` carries the rest, and
                          is shared so the three surfaces that raise this flag
                          cannot phrase it three different ways again. */}
                      {row.untrackedSold ? (
                        <span
                          title={UNTRACKED_TITLE}
                          className="ml-1.5 rounded-[4px] border border-dashed border-[color:var(--m-logo)]/50 bg-[color:var(--m-logo)]/10 px-1 py-0.5 font-mono text-[9px] text-[color:var(--m-logo)]"
                        >
                          cost unknown
                        </span>
                      ) : null}
                    </Td>
                    <Td right muted>
                      {kind === "open"
                        ? row.valueUSD === null
                          ? "—"
                          : money(row.valueUSD)
                        : // Compacted like the money beside it. Raw, this was the
                          // one figure in the row with no separators at all.
                          compactNumber(row.tradeCount ?? 0)}
                    </Td>
                    <Td
                      right
                      className={
                        pnl === null || pnl === 0
                          ? undefined
                          : pnl > 0
                            ? "text-[color:var(--m-success-fg)]"
                            : "text-[color:var(--m-error-fg)]"
                      }
                    >
                      {pnl === null ? "—" : `${pnl > 0 ? "+" : ""}${money(pnl)}`}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[color:var(--m-border)] px-4 py-2.5 font-mono text-[9.5px] font-normal uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  muted,
  colSpan,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  muted?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-[color:var(--m-border)] px-4 py-3 text-[13px] last:border-b-0",
        right ? "text-right" : "text-left",
        muted && "text-[color:var(--m-text-secondary)]",
        colSpan && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
