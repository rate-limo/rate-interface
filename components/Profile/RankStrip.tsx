"use client";

import { cn } from "@/lib/utils";
import { compactNumber } from "@/lib/format/compact";
import { useBoardRanks } from "@/hooks/useBoardRanks";
import type { BoardRank } from "@/queries/server/leaderboard";

/**
 * Where this wallet stands — trader and LP — as two pills under the identity.
 *
 * ## Standing sits with identity, not with the money
 *
 * A rank answers "compared with whom", which is a fact about the person; the
 * stat card below answers "how much", which is a fact about their positions.
 * Putting the rank in that card would make it read as a fourth figure alongside
 * realised and unrealised, and it is not denominated in anything.
 *
 * ## The denominator is not optional
 *
 * "#1" alone is unreadable — first of six is not first of six hundred — so the
 * total ships with the rank. Four characters, and the difference between a
 * standing and a boast.
 *
 * ## Where the numbers come from, and why it matters
 *
 * The AGGREGATOR, via `useBoardRanks`, which is the same merged board the
 * leaderboard rail pages. The gateway also has per-chain rank routes, and using
 * those here would put a number in this card that contradicts the row the reader
 * clicked to open it — a wallet second on the merged rail answering "#1" because
 * it leads one chain. Both numbers visible at once, with nothing to say which is
 * true. See the aggregator route's docstring for why per-chain ranks cannot be
 * combined into a global one.
 */

/** Podium tones. Deliberately only three — a fourth hue implies a tier that the
 *  board does not have, and every rank below the podium is the same KIND of
 *  fact. */
const MEDAL: Record<number, string> = {
  1: "border-[color:var(--m-logo)]/45 text-[color:var(--m-logo)]",
  2: "border-[color:var(--m-text-secondary)]/45 text-[color:var(--m-text-secondary)]",
  3: "border-[color:var(--m-warning-600,#b45309)]/45 text-[color:var(--m-warning-600,#b45309)]",
};

function Pill({ rank, label }: { rank: BoardRank; label: string }) {
  const tone =
    rank.rank !== null
      ? (MEDAL[rank.rank] ?? "border-[color:var(--m-border)] text-[color:var(--m-text-primary)]")
      : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]";

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-[7px] border bg-[color:var(--m-surface-2)] px-2 py-1",
        tone,
      )}
      title={
        rank.rank === null
          ? `Not ranked on the ${label} board yet`
          : `#${rank.rank} of ${rank.totalCount} on the ${label} board`
      }
    >
      {rank.rank === null ? (
        <span className="font-dm-mono text-[11px]">Unranked</span>
      ) : (
        <>
          <span className="font-dm-mono text-[13px] font-medium tabular-nums">#{rank.rank}</span>
          {/* Compact, because a venue with 12,000 traders would otherwise put
              five digits of denominator in a 24px-tall pill. */}
          <span className="font-dm-mono text-[10px] tabular-nums text-[color:var(--m-text-secondary-2)]">
            /{compactNumber(rank.totalCount)}
          </span>
        </>
      )}
      <span className="font-dm-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--m-text-secondary)]">
        {label}
      </span>
    </span>
  );
}

/**
 * True when a rank is worth rendering at all.
 *
 * A null rank is only meaningful when the fan-out actually saw the whole board.
 * `exhaustive: false` means the wallet may simply sit past the window the
 * aggregator fetched, and printing "Unranked" for a trader who is merely 600th
 * is a confident wrong answer — so that case renders nothing.
 */
function showable(rank: BoardRank | null | undefined): rank is BoardRank {
  if (!rank) return false;
  return rank.rank !== null || rank.exhaustive;
}

export function RankStrip({ address, className }: { address: string; className?: string }) {
  const ranks = useBoardRanks(address);

  const pnl = showable(ranks?.pnl) ? ranks.pnl : null;
  // An LP pill is hidden entirely for a wallet that has never provided, rather
  // than shown as "Unranked". Most traders never LP, so a permanent grey badge
  // on nearly every profile would be a column of noise that tells nobody
  // anything — where an unranked TRADER is genuinely notable on a trading venue.
  const lp = showable(ranks?.lp) && ranks.lp.rank !== null ? ranks.lp : null;

  // The whole strip is supplementary: still loading, both reads failed, or a
  // wallet with no standing on either board renders no row at all rather than a
  // placeholder that reserves space for something that may never arrive.
  if (!pnl && !lp) return null;

  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-1.5", className)}>
      {pnl && <Pill rank={pnl} label="Trader" />}
      {lp && <Pill rank={lp} label="LP" />}
    </div>
  );
}
