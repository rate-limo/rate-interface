"use client";

import { useState } from "react";
import { TraderProfileModal } from "./TraderProfileModal";
import { UserPlus, UserCheck, ChevronDown } from "lucide-react";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { slugToNetworkName } from "@/consts";
import { profileImageUrl } from "@/lib/portfolio/profile";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { useFollow } from "@/hooks/useFollow";
import { useLeaderboard, type LeaderboardBoard } from "@/hooks/useLeaderboard";
import type { LeaderboardRow, PnlMetric, PnlWindow } from "@/queries/server/leaderboard";
import { signedMoney } from "./PositionMiniCard";
import { formatUsd } from "@/utils/number";

/**
 * Ranked traders — the LEFT column of the social layout.
 *
 * ## One component, two surfaces
 *
 * Shared by `/home` and `/profile/[address]` unchanged: the board is global, so
 * unlike `TopTrades` it takes no subject address. It reads the CONNECTED wallet
 * only to resolve each row's follow state, which is why `viewer` comes from
 * `useAccount()` here rather than being passed in — there is no surface where
 * the follow button should act as anybody but the person clicking it.
 *
 * ## The board is GLOBAL, and says when it isn't
 *
 * Rows come from `apps/aggregator`, which fans out to every chain and re-ranks —
 * a single gateway can only answer "who is winning HERE", because market data is
 * partitioned one database per chain. When a chain cannot be reached the ranking
 * is still real but no longer complete, so `chainsMissing` is surfaced rather
 * than left to look like a shorter leaderboard.
 *
 * `null` and `[]` are kept apart: "we could not read" and "nobody has traded
 * yet" are different facts and get different copy. Neither renders placeholder
 * standings — on a leaderboard, invented rows are indistinguishable from real
 * ones, and someone would screenshot them.
 */

const RANK_TONE = [
  "text-[color:var(--m-warning-600)]",
  "text-[color:var(--m-text-secondary-2)]",
  "text-[color:var(--m-warning-700)]",
] as const;

/**
 * Only `all` is served, and the rest are shown DISABLED rather than hidden.
 *
 * `spotPositions.realizedPnlUSD` is a lifetime accumulator and fills carry no
 * cost basis, so a windowed figure cannot be derived without replaying the
 * ledger — the gateway rejects one with a 400 that says so
 * (`apps/gateway/src/api/leaderboard.ts`). Leaving the options visible and
 * inert is the honest shape: it tells the reader the axis exists and is not
 * available, where hiding them would imply the board is inherently all-time.
 */
const WINDOWS: { id: PnlWindow; label: string; available: boolean }[] = [
  { id: "1d", label: "1D", available: false },
  { id: "1w", label: "1W", available: false },
  { id: "1m", label: "1M", available: false },
  { id: "all", label: "All", available: true },
];

const UNAVAILABLE_WINDOW = "Needs a per-epoch PnL rollup — realised PnL is stored as a lifetime total";

/** Shortened address for a wallet with no claimed profile. */
function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * One row. A component of its own because each needs its own `useFollow` — a
 * single hook cannot hold per-row state for a list, and hooks cannot be called
 * in a loop from the parent.
 */
function Row({
  row,
  rank,
  networkName,
  format,
  onOpen,
}: {
  row: LeaderboardRow;
  rank: number;
  networkName: string;
  format: (n: number) => string;
  /** Opens the preview. The row no longer navigates — see the note on it. */
  onOpen: (address: string) => void;
}) {
  const { following, pending, isSelf, toggle } = useFollow({
    networkName,
    address: row.account,
    initialFollowing: row.followedByViewer,
    // The board does not carry follower counts and does not show them; the
    // count useFollow keeps is simply unused here.
    initialFollowers: 0,
  });

  const avatarSrc = profileImageUrl(networkName, row.avatarUrl);
  const shown = row.displayName ?? row.handle ?? shortAddress(row.account);
  /** Realised plus unrealised — what the POSITION did, with fees kept separate. */
  const pnlUSD = (row.realizedPnlUSD ?? 0) + (row.unrealizedPnlUSD ?? 0);

  return (
    /*
      Two lines, not one — because the metrics do not fit beside the name.

      The rail is a 261px content box (see this file's header note), of which
      rank, avatar, follow and the gaps take a fixed 96px. Everything left is
      split between the nickname and the value block, and the value block is
      `shrink-0`: it takes what it needs and the name gets the remainder.

      "provided · +$0.0₂5722 pnl · $0 fees" measures ~210px, so the remainder was
      MINUS 45px. The name rendered, clamped to zero width, and `truncate` hid
      the ellipsis with it — reported as "top LP does not show nickname", which
      it did not, because there was nowhere to put it. Top PNL rows kept theirs
      only because that board has no second line competing for the space.

      Dropping the labels would have bought 150px, and the words are worth more
      than that: `+$0.0₂5722 · $126` names neither figure, and colour alone
      cannot tell a reader which is P&L and which is fees. So the figures move to
      their own line, where 197px is available for 156px of text and the name
      gets 121px back.
    */
    <li className="flex flex-col gap-1 border-b border-[color:var(--m-border)] py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-6 shrink-0 text-xs font-semibold tabular-nums",
            RANK_TONE[rank - 1] ?? "text-[color:var(--m-text-secondary)]",
          )}
        >
          {rank}
        </span>

        {/* A button, not a Link. Ranking is a BROWSING surface — the reader is
            comparing rows — and navigating away to answer "who is #3" costs them
            their place in the list and their scroll position. The modal previews;
            it carries the link out for anything more. */}
        <button
          type="button"
          onClick={() => onOpen(row.account)}
          data-testid="leaderboard-trader"
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {/*
            `ProfileAvatar`, not a disc painted here.

            This row has now been fixed twice for the same complaint — "the
            leaderboard and the modal show the same person differently" — because
            the first fix corrected the PALETTE and left everything else. The hues
            matched after it; the picture still did not. `ProfileAvatar` paints a
            RADIAL gradient carrying the name's first letter, and this painted a
            LINEAR one carrying nothing, so JollyFrostyPanther was a lettered
            purple disc in the callout beside it and a blank pink smear here.

            Copying two of a component's three decisions is how that happens, and
            the only fix that holds is to stop copying any of them. That is the
            fifth surface to be folded into this component.
          */}
          <ProfileAvatar
            address={row.account}
            name={shown}
            src={avatarSrc}
            size={24}
          />
          <span className="truncate text-sm font-semibold text-[color:var(--m-text-primary)] hover:underline">
            {shown}
          </span>
        </button>

        <span
          className={cn(
            "ml-auto shrink-0 text-sm font-semibold tabular-nums",
              // Capital is not a gain: the LP headline stays in neutral ink, or a
              // wallet that has only ever deposited reads as being up. Detected
              // from the row's own shape, the same signal the return line uses —
              // the board name is not in scope here and threading it would give
              // two ways to ask one question.
            row.feesUSD !== undefined
              ? "text-[color:var(--m-text-primary)]"
              : row.value >= 0
                ? "text-[color:var(--m-success-fg)]"
                : "text-[color:var(--m-error-fg)]",
          )}
        >
          {format(row.value)}
        </span>

        {/* Hidden rather than disabled for your own row: "follow yourself" is not
            an action that exists, so offering it greyed out is noise. */}
        {!isSelf && (
          <button
            type="button"
            onClick={toggle}
            // Not disabled when disconnected: the click asks for a wallet.
            disabled={pending}
            aria-pressed={following === true}
            aria-label={following ? `Unfollow ${shown}` : `Follow ${shown}`}
            title={following ? "Unfollow" : "Follow"}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
              following
                ? "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
                : "border-transparent bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)] hover:bg-[color:var(--m-surface-selected)]",
            )}
          >
            {following ? <UserCheck className="size-3" /> : <UserPlus className="size-3" />}
          </button>
        )}
      </div>

      {/* The LP board's total is realised PLUS fees, and those are different
          facts — one is what the price did, the other what the pool paid. The
          split is what makes the total readable, so it is shown rather than left
          to be assumed. `undefined` means this board has no fee concept at all,
          which is not the same as a wallet having earned none — so this line is
          absent on the other boards rather than reading two zeros at them.

          Indented past the rank and the avatar so it reads as belonging to the
          person on the line above rather than starting a column of its own.

          Colour AND the word. Green/red is only legible as P&L to a reader who
          already knows that is what it is, and fees take a THIRD hue precisely
          because they can never be negative: rendered green they would make
          every LP look up and collapse the distinction this line exists to
          draw. */}
      {row.feesUSD !== undefined && (
        <div className="flex items-baseline gap-1.5 pl-8 font-dm-mono text-[10px] tabular-nums">
          <span
            className={
              pnlUSD >= 0
                ? "text-[color:var(--m-success-fg)]"
                : "text-[color:var(--m-error-fg)]"
            }
          >
            {signedMoney(pnlUSD)} pnl
          </span>
          <span className="text-[color:var(--m-text-secondary-2)]">·</span>
          {/* Never signed: there is no such thing as earning a negative fee, so
              a "+" in front of every one of them is a sign that never varies. */}
          <span className="text-[color:var(--m-logo)]">{formatUsd(row.feesUSD)} fees</span>
        </div>
      )}
    </li>
  );
}

export function LeaderboardColumn({
  networkSlug,
  className,
}: {
  networkSlug: string;
  className?: string;
}) {
  const [openTrader, setOpenTrader] = useState<string | null>(null);
  const networkName = slugToNetworkName[networkSlug] ?? networkSlug;
  const { address: viewer } = useAccount();

  const [board, setBoard] = useState<LeaderboardBoard>("pnl");
  /**
   * NET by default, not realised.
   *
   * Realised PnL only moves when a position is CLOSED, and on this venue nothing has been
   * sold yet — measured 2026-09-05: every fill in both broker databases is a bid, so
   * `realizedPnlUSD` is exactly 0 for every account. Defaulting to it ranked a column of
   * `$0`, which reads as "nobody made money" rather than "nobody has sold", and sat
   * directly beside Top trades — which ranks on `value` (realised + unrealised) and was
   * therefore showing the same wallets in profit at the same moment. Two boards on one
   * screen contradicting each other.
   *
   * Net is also the honest default for a venue whose positions are mostly open. The
   * toggle keeps realised one click away, labelled "banked, exact", for anyone who wants
   * the figure that excludes live prices.
   */
  const [metric, setMetric] = useState<PnlMetric>("net");
  // `all` is the only window the gateway serves — see WINDOWS above.
  const [window, setWindow] = useState<PnlWindow>("all");
  const [windowOpen, setWindowOpen] = useState(false);

  const { data, rows, isLoading } = useLeaderboard({
    board,
    window,
    metric,
    viewer,
  });

  // Points are a count, dollars are a currency — one board cannot format both.
  // The LP headline is CAPITAL PROVIDED, not profit, so it takes plain money
  // formatting rather than the signed kind: a "+" in front of what someone has
  // deployed reads as a gain they have not made. The signed treatment moves to
  // the return line beneath it, where it belongs.
  const format =
    board === "pnl"
      ? signedMoney
      : board === "lps"
        ? formatUsd
        : (n: number) => n.toLocaleString("en-US");

  return (
    <section aria-label="Leaderboard" className={cn("flex flex-col", className)}>
      <header className="flex min-h-[60px] items-center pb-2 pt-4">
        {/*
          * `min-w-0` + scroll, because this row DID spill out of its column.
          *
          * The rail is 292px with 31px of right padding — a 261px content box —
          * and three `text-xl` labels plus two 20px gaps measured 296px, so
          * "Top earners" ended 34.7px past the divider and was clipped by it.
          * Nothing reported the overflow: an unconstrained flex child grows to
          * its content, so `scrollWidth === clientWidth` and the row simply sat
          * wider than its parent.
          *
          * `min-w-0` is what lets it shrink to the column instead, and the
          * overflow then has somewhere to go. `text-base`/`gap-4` is what makes
          * scrolling unnecessary at this width (measured 236px in 261px);
          * `text-lg` was tried and lands at ~262px, which does not fit.
          */}
        <div
          role="tablist"
          aria-label="Leaderboard tabs"
          className="flex min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              { id: "pnl", label: "Top PNL" },
              { id: "lps", label: "Top LPs" },
              { id: "earners", label: "Top earners" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={board === t.id}
              onClick={() => setBoard(t.id)}
              className={cn(
                "shrink-0 whitespace-nowrap text-base font-bold leading-6 tracking-[-0.2px] transition-colors",
                board === t.id
                  ? "text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Both controls are PnL-only: the earners board ranks a season's points,
          which has neither a metric choice nor a rolling window. */}
      {board === "pnl" && (
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            aria-label="Ranking metric"
            onClick={() => setMetric((m) => (m === "realized" ? "net" : "realized"))}
            title={
              metric === "realized"
                ? "Realised only — banked, exact"
                : "Net — includes open positions at live prices"
            }
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent bg-[color:var(--m-surface-2)] px-2.5 py-1 text-xs font-semibold text-[color:var(--m-text-primary)] transition-colors"
          >
            {metric === "realized" ? "Realised" : "Net PNL"}
            <ChevronDown className="h-3 w-3" />
          </button>

          <div className="relative">
            <button
              type="button"
              aria-label="Time window"
              aria-expanded={windowOpen}
              onClick={() => setWindowOpen((v) => !v)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent bg-[color:var(--m-surface-2)] px-2.5 py-1 text-xs font-semibold text-[color:var(--m-text-primary)] transition-colors"
            >
              {WINDOWS.find((w) => w.id === window)?.label}
              <ChevronDown className="h-3 w-3" />
            </button>
            {windowOpen && (
              <ul className="absolute left-0 top-full z-20 mt-1 flex min-w-[5rem] flex-col overflow-hidden rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface)] py-1 shadow-md">
                {WINDOWS.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      disabled={!w.available}
                      title={w.available ? undefined : UNAVAILABLE_WINDOW}
                      onClick={() => {
                        setWindow(w.id);
                        setWindowOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs font-semibold transition-colors enabled:hover:bg-[color:var(--m-surface-2)] disabled:cursor-not-allowed disabled:opacity-40",
                        window === w.id
                          ? "text-[color:var(--m-text-primary)]"
                          : "text-[color:var(--m-text-secondary)]",
                      )}
                    >
                      {w.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <ul aria-busy="true" className="flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <span className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-[color:var(--m-surface-2)]" />
              <span className="h-3 w-28 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
              <span className="ml-auto h-3 w-16 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
            </li>
          ))}
        </ul>
      ) : data === null ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-3 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          Couldn&rsquo;t reach the leaderboard service. Nothing is being shown rather
          than a ranking built from whatever happened to answer.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--m-border)] p-3 text-xs leading-5 text-[color:var(--m-text-secondary)]">
          No ranked traders in this window yet.
        </p>
      ) : (
        <>
        {(data?.chainsMissing?.length ?? 0) > 0 && (
          // Real rows, incomplete ranking. Saying nothing would present a board
          // missing a whole chain's traders as the global one.
          <p className="mb-1 text-[11px] leading-4 text-[color:var(--m-warning-600)]">
            {data?.chainsMissing?.join(", ")} didn&rsquo;t answer — this ranking is partial.
          </p>
        )}
        {board === "pnl" && rows.length > 0 && rows.every((r) => r.value === 0) && (
          // A ranking of zeros is not a ranking. It happens whenever the selected metric
          // has nothing to measure — realised PnL before anyone has closed a position —
          // and printing the rows anyway teaches a reader to ignore this column.
          <p className="mb-1 text-[11px] leading-4 text-[color:var(--m-text-secondary-2)]">
            {metric === "realized"
              ? "No one has closed a position yet, so realised PnL is $0 for everyone. Switch to Net PNL to include open positions."
              : "No PnL to rank yet."}
          </p>
        )}
        <ol className="flex flex-col" aria-label="Ranked traders">
          {rows.map((row, i) => (
            <Row
              key={row.account}
              row={row}
              rank={i + 1}
              networkName={networkName}
              format={format}
              onOpen={setOpenTrader}
            />
          ))}
        </ol>

      <TraderProfileModal
        address={openTrader}
        networkName={networkName}
        networkSlug={networkSlug}
        open={openTrader !== null}
        // Cleared on close rather than left set: the next open would otherwise
        // paint the previous trader for a frame before its query resolves.
        onOpenChange={(next) => { if (!next) setOpenTrader(null); }}
      />
        </>
      )}
    </section>
  );
}
