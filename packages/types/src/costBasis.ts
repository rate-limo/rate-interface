/**
 * Cost basis: the arithmetic behind realised PnL, in ONE place.
 *
 * ## Why this is a shared package and not broker-local
 *
 * `packages/db`'s `spotPositions` docstring is unusually blunt about the hazard:
 * the rest of `broker.*` is additive and commutes, but **cost basis does not**.
 * A weighted average depends on the order fills arrive in, so a second
 * implementation does not produce an obviously-wrong number — it produces a
 * plausible one, permanently.
 *
 * The broker folds these over live events. `apps/gateway` needs the same fold
 * REPLAYED, to answer "what did this wallet's realised PnL look like over time"
 * — a question `spotPositions` cannot answer, because it stores a lifetime
 * accumulator with no time axis (see leaderboard.ts, which refuses windowed PnL
 * for exactly this reason).
 *
 * Two callers, one definition. This is the same call `./earn` makes for the
 * accrual constants, and for the same reason.
 *
 * Everything here is PURE and takes no store — that is what makes it movable,
 * and what lets `apps/broker`'s `position.test.ts` keep testing it unchanged.
 */

/**
 * A price (or a USD value derived from one) of ZERO means UNKNOWN, never zero.
 *
 * `spotTokens.priceUSD` is `0` for a token nothing has priced yet, so every USD
 * figure downstream of it inherits the ambiguity. This predicate is the one
 * place that decides what counts as a real number.
 */
export function isKnownPrice(price: number | null | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/** The fee-bearing subset of a fill the net calculation needs. Structural, so
 *  the broker's `TradeLegs` and the gateway's `spotTrades` row both satisfy it
 *  without either having to know about the other. */
export interface FillFees {
  baseAmount: number;
  quoteAmount: number;
  valueUSD: number;
  baseFee: number;
  quoteFee: number;
}

export interface Applied {
  amount: number;
  costUSD: number;
  /** Quantity realised against minted supply, so the allowance can be spent
   *  down. Zero on every path that does not touch it. */
  mintedDelta?: number;
  realizedDelta: number;
  untrackedDelta: number;
  /** Quantity moved by a fill whose USD value was unknown — see spotPositions.unpricedQty. */
  unpricedDelta: number;
}

/** Weighted average: a buy adds to both sides and moves the average. */
export function applyBuy(
  amount: number,
  costUSD: number,
  qty: number,
  valueUSD: number,
): Applied {
  // An unknown value must not be spent as though it were zero. Adding 0 cost
  // for real quantity DILUTES the average — the position looks cheaper than it
  // was and every later gain is overstated. Carrying the existing average
  // forward leaves `avgEntryUSD` exactly where it was and records the quantity
  // as assumed rather than observed.
  if (!isKnownPrice(valueUSD)) {
    const avgCost = amount > 0 ? costUSD / amount : 0;
    return {
      amount: amount + qty,
      costUSD: costUSD + avgCost * qty,
      realizedDelta: 0,
      untrackedDelta: 0,
      unpricedDelta: qty,
    };
  }
  return {
    amount: amount + qty,
    costUSD: costUSD + valueUSD,
    realizedDelta: 0,
    untrackedDelta: 0,
    unpricedDelta: 0,
  };
}

/**
 * A sell realises against the average, and only for the part we have a basis
 * for.
 *
 * The `qty > amount` branch is the whole reason `untrackedSold` exists. Selling
 * more of a token than the ledger ever saw bought means the rest arrived some
 * other way — a transfer, an airdrop, an LP withdrawal. Its true basis is
 * unknown, NOT zero, so its proceeds are excluded from realised PnL rather than
 * booked as pure profit. Booking it is the standard way a portfolio tracker
 * invents gains that never happened.
 *
 * ## Except for MINTED supply, whose basis is known to be zero (2026-09-06)
 *
 * That rule conflated two different things, and only one of them is unknown.
 * Tokens transferred in were bought at a price this venue never saw. Tokens
 * MINTED to the account were not bought at all — the account created them — so
 * zero is not a guess standing in for a missing number, it is the number.
 *
 * The effect was that a launch creator selling their own supply reported
 * `realizedPnlUSD: 0` forever, with the entire proceeds parked in
 * `untrackedSold`. Measured on Arc before this: every seeded creator wallet
 * showed `tradeCount: 4`, `untrackedSold: 0.2`, `realizedPnlUSD: 0` — trades
 * that demonstrably happened and a PnL that refused to describe them.
 *
 * `mintedAvailable` is the ceiling, from `tokenBalances.mintedIn` minus what
 * previous fills already realised against. Without that subtraction a creator
 * selling across ten fills would realise the whole mint ten times.
 *
 * Anything beyond the mint allowance stays untracked, unchanged. The original
 * rule still governs every case it was written for.
 */
export function applySell(
  amount: number,
  costUSD: number,
  qty: number,
  valueUSD: number,
  /** Minted supply this account has not yet realised against. See the note. */
  mintedAvailable = 0,
): Applied {
  const tracked = Math.min(qty, Math.max(amount, 0));
  const untrackedRaw = qty - tracked;

  // The mint slice is realised at a basis of zero; the remainder keeps the old
  // treatment. `valueUSD` is pro-rated by quantity, the same way the tracked
  // slice's proceeds are, so a fill that is part tracked and part minted splits
  // its value rather than counting it twice.
  //
  // The allowance is only spent against a fill we can PRICE. An unpriced fill
  // is the normal state for a launched coin's first trades (`valueUSD` is
  // `price * amount` and the price is 0 until the first NewMarketPrice), and
  // consuming the mint there would burn it for zero proceeds — the creator's
  // real gain would then be unrealisable forever, on the very fills this change
  // exists to describe.
  const priced = isKnownPrice(valueUSD) && qty > 0;
  const fromMint = priced ? Math.min(untrackedRaw, Math.max(mintedAvailable, 0)) : 0;
  const untracked = untrackedRaw - fromMint;
  const mintProceeds = fromMint > 0 ? valueUSD * (fromMint / qty) : 0;

  if (tracked <= 0) {
    return {
      amount: 0,
      costUSD: 0,
      // Basis zero, so the proceeds ARE the gain.
      realizedDelta: mintProceeds,
      untrackedDelta: untracked,
      unpricedDelta: 0,
      mintedDelta: fromMint,
    };
  }

  // An unknown sale value realises NOTHING. The old code computed
  // `proceeds - basis` with proceeds pinned at 0, which books a loss of the
  // entire basis — a number the trader never took, written permanently into a
  // running total. Retire the quantity at the position's own average instead,
  // so the average survives and the ledger stays silent about a P&L it cannot
  // compute.
  if (!isKnownPrice(valueUSD)) {
    const avgCostU = amount > 0 ? costUSD / amount : 0;
    const remainingU = amount - tracked;
    return {
      amount: remainingU,
      costUSD: remainingU > 0 ? avgCostU * remainingU : 0,
      // An unknown fill value cannot price the mint slice either, so it stays
      // unrealised — and unspent, so a later priced fill can still claim it.
      realizedDelta: 0,
      untrackedDelta: untracked,
      unpricedDelta: tracked,
      mintedDelta: 0,
    };
  }

  const avgCost = amount > 0 ? costUSD / amount : 0;
  // Proceeds for the tracked slice only, pro-rated from the fill's own value.
  const proceeds = valueUSD * (tracked / qty);
  const basis = avgCost * tracked;
  const remaining = amount - tracked;

  return {
    amount: remaining,
    // Rebuild from the average rather than subtracting `basis`, so float drift
    // cannot leave a residual cost on a position closed to exactly zero — the
    // "dust cost basis on an empty position" bug.
    costUSD: remaining > 0 ? avgCost * remaining : 0,
    // Tracked slice against its average, plus the mint slice at zero basis.
    realizedDelta: proceeds - basis + mintProceeds,
    untrackedDelta: untracked,
    unpricedDelta: 0,
    mintedDelta: fromMint,
  };
}


/**
 * What the taker actually received, and what that fill was worth to them.
 *
 * Buying: they hand over the full quote leg and receive base minus the fee, so
 * the USD they gave up is unchanged (`valueUSD`) while the quantity is smaller —
 * the fee shows up as a higher average entry, which is where it belongs.
 *
 * Selling: they hand over the full base leg and receive quote minus the fee, so
 * the fill is worth proportionally LESS to them than its notional. Scaling
 * `valueUSD` by the same ratio keeps one number describing both the base sale's
 * proceeds and the quote purchase's cost, so the two legs cannot disagree.
 */
export function takerNet(
  legs: FillFees,
  takerBuysBase: boolean,
): { receivedQty: number; usd: number } {
  if (takerBuysBase) {
    const fee = Math.min(Math.max(legs.baseFee, 0), legs.baseAmount);
    return { receivedQty: legs.baseAmount - fee, usd: legs.valueUSD };
  }
  const fee = Math.min(Math.max(legs.quoteFee, 0), legs.quoteAmount);
  const receivedQty = legs.quoteAmount - fee;
  return {
    receivedQty,
    usd: legs.quoteAmount > 0 ? legs.valueUSD * (receivedQty / legs.quoteAmount) : 0,
  };
}


/** One fill, from whichever ledger the caller has. Structural for the same
 *  reason `FillFees` is. */
export interface ReplayFill extends FillFees {
  base: string;
  quote: string;
  /** Describes the INCOMING order — see the broker's derivation. */
  isBid: boolean;
  taker: string;
  maker: string;
  timestamp: number;
}

/** What one account did to one token in one fill. */
export interface AccountMove {
  token: string;
  qty: number;
  buy: boolean;
  usd: number;
}

/**
 * The legs ONE account moved in a fill — the account-scoped half of the
 * broker's four-move table.
 *
 * The broker applies all four (both sides of both accounts) because it is
 * maintaining every position. A replay for a single wallet needs only that
 * wallet's, and a self-match legitimately yields all four — the wallet was both
 * counterparties, and dropping either side would lose a real basis move.
 *
 * The asymmetry is not incidental and is why this cannot be simplified: the
 * TAKER's received leg is net of fee while everything they gave is gross, and
 * their `usd` is the net value, so the fee lands in their average entry where it
 * belongs. The maker is gross on both legs at notional. See `takerNet`.
 */
export function movesForAccount(fill: ReplayFill, account: string): AccountMove[] {
  // A zero-value fill has no basis to move and would divide by zero in the fold.
  if (!(fill.baseAmount > 0) || !(fill.quoteAmount > 0)) return [];

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const net = takerNet(fill, fill.isBid);
  const moves: AccountMove[] = [];

  if (same(fill.taker, account)) {
    moves.push(
      fill.isBid
        ? { token: fill.base, qty: net.receivedQty, buy: true, usd: fill.valueUSD }
        : { token: fill.base, qty: fill.baseAmount, buy: false, usd: net.usd },
      fill.isBid
        ? { token: fill.quote, qty: fill.quoteAmount, buy: false, usd: fill.valueUSD }
        : { token: fill.quote, qty: net.receivedQty, buy: true, usd: net.usd },
    );
  }
  if (same(fill.maker, account)) {
    moves.push(
      { token: fill.base, qty: fill.baseAmount, buy: !fill.isBid, usd: fill.valueUSD },
      { token: fill.quote, qty: fill.quoteAmount, buy: fill.isBid, usd: fill.valueUSD },
    );
  }
  return moves;
}

/** A wallet's running realised PnL, one point per fill that moved it. */
export interface PnlPoint {
  /** Unix seconds. */
  t: number;
  /** Cumulative realised PnL in USD at that moment. */
  usd: number;
}

export interface PnlReplay {
  points: PnlPoint[];
  /** Cumulative realised PnL after the last fill. */
  total: number;
}

/**
 * Replay an account's fills into a cumulative realised-PnL series.
 *
 * ## Why a replay rather than a stored column
 *
 * `spotPositions.realizedPnlUSD` is a LIFETIME ACCUMULATOR with no time axis —
 * `leaderboard.ts` refuses windowed PnL for precisely this reason. The series
 * has to come from the fills, in order, or not at all.
 *
 * ## It is checkable, which is what makes it safe to ship
 *
 * Replaying the same fills through the same `applyBuy`/`applySell` the broker
 * folded live must land on the same number the broker stored. A caller can
 * compare `total` against `sum(spotPositions.realizedPnlUSD)` and say so — so a
 * divergence surfaces as a flag rather than as a plausible wrong chart, which is
 * the failure mode the shared-module note at the top of this file is about.
 *
 * `mintedIn` seeds the mint allowance per token, exactly as `applyMove` reads it
 * from `tokenBalances`; absent reads as zero, which is the no-coin-transfer-
 * indexing case and is unaffected rather than silently different.
 *
 * Fills MUST arrive oldest-first. A weighted average does not commute, so an
 * unordered input yields a plausible wrong answer rather than an error.
 */
export function replayRealizedPnl(
  fills: readonly ReplayFill[],
  account: string,
  mintedIn: ReadonlyMap<string, number> = new Map(),
): PnlReplay {
  const amount = new Map<string, number>();
  const cost = new Map<string, number>();
  const mintedSold = new Map<string, number>();
  const points: PnlPoint[] = [];
  let running = 0;

  for (const fill of fills) {
    for (const move of movesForAccount(fill, account)) {
      const key = move.token.toLowerCase();
      const a = amount.get(key) ?? 0;
      const c = cost.get(key) ?? 0;

      let next: Applied;
      if (move.buy) {
        next = applyBuy(a, c, move.qty, move.usd);
      } else {
        const sold = mintedSold.get(key) ?? 0;
        const available = Math.max((mintedIn.get(key) ?? 0) - sold, 0);
        next = applySell(a, c, move.qty, move.usd, available);
        mintedSold.set(key, sold + (next.mintedDelta ?? 0));
      }

      amount.set(key, next.amount);
      cost.set(key, next.costUSD);
      running += next.realizedDelta;
    }
    // One point per FILL, not per move: both legs of a fill happen at the same
    // instant, and emitting two points at one timestamp draws a vertical step
    // through a value the wallet never held.
    points.push({ t: fill.timestamp, usd: running });
  }

  return { points, total: running };
}
