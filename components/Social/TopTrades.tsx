"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useAccountPositions } from "@/hooks/useAccountPositions";
import { useTopTrades } from "@/hooks/useTopTrades";
import { slugToNetworkName } from "@/consts";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { TokenAvatar, money } from "@/components/Portfolio/parts";
import type { TopTradeRow } from "@/queries/server/positions";
import { netPnl, PositionMiniCard, signedMoney } from "./PositionMiniCard";

/**
 * Best trades — the RIGHT column of the social layout.
 *
 * ## Two modes, and the difference is WHOSE trades
 *
 * With an `address` it ranks that wallet's positions — the profile page, where
 * the subject is the wallet in the URL. Without one it ranks the VENUE's best
 * trades across every chain, which is what `/home` wants.
 *
 * It used to fall back to the CONNECTED wallet when no address was given, so
 * `/home` showed you your own trades under a heading that reads as the venue's.
 * That fallback is gone rather than made optional: "the best trades" and "your
 * best trades" are different lists, and a flag deciding which one a heading
 * means is how they get confused again.
 *
 * ## Why global mode does not reuse PositionMiniCard
 *
 * That card describes a position on a page that already establishes whose it is.
 * A global row has to answer "whose?" and "on which chain?" first — the trader
 * is the most important field, and a card that omits it would read as the
 * viewer's own trades, which is the bug this fixes.
 */
const PAGE = 10;

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Rank pip. #1 gets the warm tone; the rest stay quiet so the list reads as a
 *  ranking rather than a row of badges. */
function rankClass(i: number): string {
  return i === 0
    ? "border-[color:var(--m-warning)] bg-[color:var(--m-warning-100)] text-[color:var(--m-warning-600)]"
    : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]";
}

/** One of the venue's best trades: who, what, where, how much. */
function GlobalTradeRow({ row, rank }: { row: TopTradeRow; rank: number }) {
  const shown = row.displayName ?? row.handle ?? shortAddress(row.account);
  const up = row.value >= 0;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-1.5 -top-1.5 z-10 inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full border px-1.5 text-[11px] font-bold tabular-nums",
          rankClass(rank),
        )}
      >
        #{rank + 1}
      </span>

      <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3">
        {/* The trader comes first: on a global rail this is the field that stops
            the row reading as the viewer's own trade. */}
        <Link
          href={`/profile/${row.account}`}
          className="flex min-w-0 items-center gap-2"
        >
          {/* `ProfileAvatar` — see its note in LeaderboardColumn. This drew a
              LINEAR gradient and no initial, so the same wallet was a blank
              smear here and a lettered disc in the callout beside it. */}
          <ProfileAvatar address={row.account} name={shown} size={20} />
          <span className="truncate text-xs font-semibold text-[color:var(--m-text-primary)] hover:underline">
            {shown}
          </span>
          <span className="ml-auto shrink-0 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-2 py-0.5 text-[10px] text-[color:var(--m-text-secondary)]">
            {row.chain}
          </span>
        </Link>

        <div className="flex w-full items-center gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <TokenAvatar symbol={row.symbol ?? "—"} logoURI={row.logoURI ?? undefined} />
            <span className="flex min-w-0 flex-col gap-0.5 leading-4">
              <span className="truncate text-xs font-bold text-[color:var(--m-text-primary)]">
                {row.symbol ?? shortAddress(row.token)}
              </span>
              <span className="truncate text-[11px] text-[color:var(--m-text-secondary)]">
                {row.closed ? "Closed" : row.valueUSD === null ? "Unpriced" : money(row.valueUSD)}
              </span>
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-0.5 leading-4">
            <span className="text-[11px] text-[color:var(--m-text-secondary)]">
              {/* An unpriced open position is ranked on realised alone, so the
                  label has to say which figure this is. */}
              {row.unrealizedPnlUSD === null && !row.closed ? "Realised" : "Net PNL"}
            </span>
            <span
              className={cn(
                "text-xs tabular-nums",
                up ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]",
              )}
            >
              {signedMoney(row.value)}
            </span>
          </span>
        </div>
      </div>
    </li>
  );
}

export function TopTrades({
  address,
  networkSlug,
  title = "Top trades",
  className,
}: {
  /** The wallet to rank. Omit for the VENUE-wide ranking across chains. */
  address?: string;
  networkSlug: string;
  title?: string;
  className?: string;
}) {
  const networkName = slugToNetworkName[networkSlug] ?? networkSlug;
  const { address: viewer } = useAccount();
  const global = !address;

  // Exactly one of these does work: `enabled` gates the global read, and
  // `useAccountPositions` no-ops without an address.
  const wallet = useAccountPositions(networkName, address);
  const venue = useTopTrades({ pageSize: 25, viewer, enabled: global });

  const [shown, setShown] = useState(PAGE);

  const walletRanked = useMemo(
    () => [...wallet.data.positions].sort((a, b) => netPnl(b).value - netPnl(a).value),
    [wallet.data.positions],
  );

  const total = global ? venue.rows.length : walletRanked.length;
  const isLoading = global ? venue.isLoading : wallet.isLoading;

  return (
    <section aria-label={title} className={cn("flex w-full min-w-0 flex-col", className)}>
      <header className="flex min-h-[60px] items-center justify-between gap-2 py-4">
        <span className="whitespace-nowrap text-xl font-bold leading-6 tracking-[-0.2px] text-[color:var(--m-text-primary)]">
          {title}
        </span>
      </header>

      {isLoading ? (
        <ul className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-[86px] animate-pulse rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]"
            />
          ))}
        </ul>
      ) : global && venue.failed ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          Couldn&rsquo;t reach the trades service.
        </p>
      ) : total === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-4 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          {global ? "No trades on the venue yet." : "No trades on this wallet yet."}
        </p>
      ) : (
        <>
          {global && venue.chainsMissing.length > 0 && (
            // Real rows, incomplete ranking — same rule as the leaderboard.
            <p className="mb-2 text-[11px] leading-4 text-[color:var(--m-warning-600)]">
              {venue.chainsMissing.join(", ")} didn&rsquo;t answer — this ranking is partial.
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {global
              ? venue.rows
                  .slice(0, shown)
                  .map((row, i) => (
                    <GlobalTradeRow key={`${row.chain}:${row.account}:${row.token}`} row={row} rank={i} />
                  ))
              : walletRanked.slice(0, shown).map((p, i) => (
                  <li key={p.token} className="relative">
                    {/* The rank badge overlaps the card's top-left corner, so it
                        reads as a label ON the card rather than a column beside
                        it — which keeps the card identical to the feed's. */}
                    <span
                      className={cn(
                        "absolute -left-1.5 -top-1.5 z-10 inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full border px-1.5 text-[11px] font-bold tabular-nums",
                        rankClass(i),
                      )}
                    >
                      #{i + 1}
                    </span>
                    <PositionMiniCard position={p} networkSlug={networkSlug} />
                  </li>
                ))}
          </ul>

          {shown < total && (
            <div className="relative flex justify-center pt-4">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
              >
                Load {Math.min(PAGE, total - shown)} more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
