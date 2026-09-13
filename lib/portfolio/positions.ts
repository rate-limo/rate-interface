import type { AccountPositions, PositionTotals, SpotPosition } from "./types";

/**
 * The Positions tab's pure helpers — normalizing
 * `GET /api/account/:address/positions`, classifying the row states, and the
 * filtering/sorting the list applies.
 *
 * Pure and tested here for the same reason `lib/portfolio/live.ts` and
 * `lib/portfolio/profile.ts` are: this repo's vitest runs in the node
 * environment and cannot render a hook, so the mapping and the classifier are
 * what get tested.
 *
 * ## The four states, and why they are flags rather than one enum
 *
 * A position row can be wrong-looking for four independent reasons, and the
 * whole point of this tab is that conflating them is how a portfolio quietly
 * misleads. They are NOT mutually exclusive — a closed position can perfectly
 * well have `untrackedSold > 0`, and that is exactly the row whose realised PnL
 * is most likely to be incomplete — so `positionFlags` returns four booleans and
 * the row wears every marker that applies.
 *
 * Two exclusions are load-bearing and are pinned by tests:
 *
 *  - **unpriced is not dust.** A null `valueUSD` means the value is unknown, not
 *    small. Folding it into the dust filter would hide a position of any size
 *    behind a checkbox that claims to hide trivia.
 *  - **closed is not dust.** `amount == 0` values at zero by arithmetic, not by
 *    being a small holding, and the Open/Closed segment is what that state is
 *    for.
 */

/**
 * What counts as dust, in USD.
 *
 * **Chosen here, not read from anywhere** — neither the endpoint, the schema nor
 * the design fixes a number, so this is the one place it is decided and the one
 * place a future operator-configured threshold would land. A long tail of
 * sub-dollar rows buries the positions that matter; a dollar is the level below
 * which a row cannot change a decision.
 */
export const DUST_USD = 1;

function finite(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** An account with nothing resolved yet — the fallback for a failed or missing read. */
export function emptyAccountPositions(address: string): AccountPositions {
  return {
    address,
    positions: [],
    totals: {
      valueUSD: 0,
      costUSD: 0,
      unrealizedPnlUSD: 0,
      realizedPnlUSD: 0,
      unpricedCount: 0,
    },
  };
}

/**
 * Normalizes the raw payload, degrading field by field rather than failing the
 * whole tab on one bad value.
 *
 * `valueUSD` / `unrealizedPnlUSD` stay nullable all the way through. The
 * endpoint returns null when it has no price, and `?? 0` anywhere on this path
 * would turn "we do not know" into "$0.00" — the single most misleading thing
 * this tab could render. `priced` is read from the payload rather than inferred
 * from `valueUSD !== null`, because the endpoint sends it precisely so a caller
 * does not have to make that inference.
 */
export function toAccountPositions(
  raw: Record<string, unknown> | null,
  address: string,
): AccountPositions {
  if (!raw) return emptyAccountPositions(address);
  const rows = Array.isArray(raw.positions) ? (raw.positions as Record<string, unknown>[]) : [];
  const totals = (raw.totals ?? {}) as Record<string, unknown>;
  return {
    address: optionalString(raw.address) ?? address,
    positions: sortPositions(rows.map(toSpotPosition)),
    totals: {
      valueUSD: finite(totals.valueUSD),
      costUSD: finite(totals.costUSD),
      unrealizedPnlUSD: finite(totals.unrealizedPnlUSD),
      realizedPnlUSD: finite(totals.realizedPnlUSD),
      unpricedCount: finite(totals.unpricedCount),
    } satisfies PositionTotals,
  };
}

function toSpotPosition(row: Record<string, unknown>): SpotPosition {
  const token = String(row.token ?? "");
  const amount = finite(row.amount);
  return {
    token,
    // The symbol is denormalised onto the position row by the broker, but a
    // token indexed before that column existed has none. The address is a worse
    // label than a symbol and a better one than an empty cell.
    symbol: optionalString(row.symbol) ?? shortToken(token),
    logoURI: optionalString(row.logoURI),
    amount,
    costUSD: finite(row.costUSD),
    // Derived server-side as `costUSD / amount`, which the endpoint reports as a
    // hard 0 for a closed row. Carried as-is; `positionFlags().closed` is what
    // stops the UI printing an average entry of $0.00 for a position whose basis
    // left with the last sale. See `PositionsList`.
    avgEntryUSD: finite(row.avgEntryUSD),
    valueUSD: optionalFinite(row.valueUSD),
    unrealizedPnlUSD: optionalFinite(row.unrealizedPnlUSD),
    realizedPnlUSD: finite(row.realizedPnlUSD),
    untrackedSold: finite(row.untrackedSold),
    tradeCount: finite(row.tradeCount),
    firstTradeAt: optionalFinite(row.firstTradeAt),
    lastTradeAt: optionalFinite(row.lastTradeAt),
    priced: row.priced === true,
  };
}

function shortToken(token: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(token) ? `${token.slice(0, 6)}…${token.slice(-4)}` : token || "?";
}

/**
 * The one phrasing of the partial-basis flag, for every surface that raises it.
 *
 * There were three, and they disagreed: a badge reading "untracked", a second
 * badge reading "partial basis", and a sentence reading "Sold more than the
 * ledger saw bought — cost basis is partial." Same condition, three vocabularies,
 * none of which names what a trader actually lost track of.
 *
 * "Untracked" was the worst of them because it is the column's name, not a fact
 * about anyone's money: read as a label ON THE TOKEN it suggests a category of
 * coin — one from the asset generator, say — rather than a hole in our record of
 * what it cost. (Generator supply is `mintedSold`, has a basis of exactly zero,
 * is counted IN realised PnL, and raises no flag at all.)
 */
export const UNTRACKED_LABEL = "cost unknown";

/** The long form, as a tooltip or a line under the number. */
export const UNTRACKED_TITLE =
  "Part of this arrived without a purchase we could see — wrapped, transferred in, " +
  "airdropped, or withdrawn from a pool. Realised PnL only covers the part bought on Iter.";

export interface PositionFlags {
  /** No live price, so the value is unknown — never zero. */
  unpriced: boolean;
  /** `untrackedSold > 0`: part of this token arrived at a cost nobody can know. */
  partialBasis: boolean;
  /** `amount == 0`. Realised PnL survives, which is why the row does too. */
  closed: boolean;
  /** Priced, open, and worth less than the threshold. */
  dust: boolean;
}

export function positionFlags(position: SpotPosition, dustUsd: number = DUST_USD): PositionFlags {
  const closed = position.amount <= 0;
  return {
    // Deliberately NOT `!priced` alone. A closed row's value is zero by
    // arithmetic whatever the price does, so badging it "unpriced" would flag a
    // number that is not in doubt. Note this diverges from the endpoint's
    // `totals.unpricedCount`, which counts every unpriced row — that count
    // qualifies the SUMS (which exclude those rows either way), and the footer
    // reports it as the server computed it rather than recomputing a second,
    // drift-prone answer here.
    unpriced: !position.priced && !closed,
    partialBasis: position.untrackedSold > 0,
    closed,
    // Unknown is not small, and zero-by-closure is not small either.
    dust: position.priced && !closed && (position.valueUSD ?? 0) < dustUsd,
  };
}

/**
 * The percentage move on the position, or null when it cannot honestly be
 * computed.
 *
 * Withheld rather than approximated for three separate reasons: no price (no
 * numerator), no basis (`costUSD <= 0` — dividing by it yields Infinity, and a
 * zero basis usually means the tokens arrived untracked), and partial basis,
 * where a real cost exists but is known to be incomplete, so the percentage
 * would be computed against a basis that is missing rather than zero.
 */
export function unrealizedPct(position: SpotPosition): number | null {
  const flags = positionFlags(position);
  if (flags.closed || flags.unpriced || flags.partialBasis) return null;
  if (position.unrealizedPnlUSD === null || position.costUSD <= 0) return null;
  return (position.unrealizedPnlUSD / position.costUSD) * 100;
}

/**
 * Biggest holdings first.
 *
 * Unpriced rows sort after every priced one — they cannot be ranked by a value
 * nobody has, and putting them at the top on a null would hand the most
 * prominent rows to the least certain data. Closed rows sink below both: they
 * are history, and the Closed segment is where they are actually read.
 */
export function sortPositions(positions: SpotPosition[]): SpotPosition[] {
  return [...positions].sort((a, b) => {
    const fa = positionFlags(a);
    const fb = positionFlags(b);
    const rank = (f: PositionFlags) => (f.closed ? 2 : f.unpriced ? 1 : 0);
    if (rank(fa) !== rank(fb)) return rank(fa) - rank(fb);
    if (fa.closed) return Math.abs(b.realizedPnlUSD) - Math.abs(a.realizedPnlUSD);
    const av = a.valueUSD ?? 0;
    const bv = b.valueUSD ?? 0;
    if (av !== bv) return bv - av;
    return a.symbol.localeCompare(b.symbol);
  });
}

export type PositionView = "open" | "closed";

/**
 * The rows the list actually renders.
 *
 * Dust is hidden, never dropped — `visiblePositions` is a view over the full
 * array, so the counts and the totals beside it still describe everything the
 * account holds.
 */
export function visiblePositions(
  positions: SpotPosition[],
  view: PositionView,
  showDust: boolean,
  dustUsd: number = DUST_USD,
): SpotPosition[] {
  return positions.filter((position) => {
    const flags = positionFlags(position, dustUsd);
    if (flags.closed !== (view === "closed")) return false;
    return showDust || !flags.dust;
  });
}

/**
 * How many rows the dust checkbox is currently hiding in this view.
 *
 * The count needs no open/closed predicate of its own because `dust` is false
 * for every closed row by construction — that exclusion is the load-bearing part
 * and lives in `positionFlags`. The early return for the closed view is a
 * statement of intent, not what makes the number right.
 */
export function hiddenDustCount(
  positions: SpotPosition[],
  view: PositionView,
  dustUsd: number = DUST_USD,
): number {
  if (view === "closed") return 0;
  return positions.filter((position) => positionFlags(position, dustUsd).dust).length;
}
