/**
 * LP positions, v2: ONE token = ONE position = the whole band ladder.
 *
 * apps/web/CLAUDE.md, "ONE LP NFT = ONE POSITION = THE WHOLE BAND LADDER", is the rule
 * this module implements. A position is a token; its bands are INSIDE it. Nothing here
 * ever returns a band as a position, and nothing groups several tokens into one card.
 *
 * Two sources, each the authority for what it knows:
 *
 * - The gateway's `/api/account/:address/lp-positions` says WHICH tokens a wallet
 *   holds, what each cost and has returned (the event-sourced ledger), and what each
 *   band is worth at the last reserve snapshot.
 * - `BandPositionManager.portfolio(tokenIds)` on chain says what is CLAIMABLE and
 *   VESTING right now, per band. Vesting moves every block and this gates buttons that
 *   spend gas, so it is never taken from a snapshot.
 *
 * `mergeLpPositions` is pure, so the whole shaping is unit-tested without a chain.
 */

/** DENOM of every fraction on the pool: tolerances, spread fractions, vesting, fee multipliers. */
export const LP_DENOM = 100_000_000;

/** One band as the gateway reports it for one token. */
export interface GatewayLpBand {
  band: number;
  sharesBN: string | number | null;
  spreadFrac: number | null;
  tolerance: number | null;
  toleranceSell: number | null;
  feeMultiplier: number | null;
  open: boolean | null;
  baseOwnedBN: string | number | null;
  quoteOwnedBN: string | number | null;
  valueUSD: number;
  snapshotAt: number | null;
}

/** One token as the gateway reports it. */
export interface GatewayLpPosition {
  tokenId: string | number;
  pool: string | null;
  active: boolean;
  bandMask: number;
  costUSD: number | null;
  feesUSD: number | null;
  forfeitedUSD: number | null;
  realizedPnlUSD: number | null;
  mintedAt: number | null;
  firstSeenAt: number | null;
  closedAt: number | null;
  base: string | null;
  quote: string | null;
  maturity: string | number | null;
  baseSymbol: string | null;
  quoteSymbol: string | null;
  baseDecimals: number | null;
  quoteDecimals: number | null;
  bands: GatewayLpBand[];
  valueUSD: number;
  unrealizedPnlUSD: number | null;
  snapshotAt: number | null;
}

/** One band of `BandPositionManager.portfolio`'s `PositionView.bands`. */
export interface ChainBandView {
  band: number;
  spreadFrac: number;
  toleranceBuy: number;
  toleranceSell: number;
  feeMultiplier: number;
  open: boolean;
  shares: bigint;
  bandShares: bigint;
  createdAt: bigint;
  baseOwned: bigint;
  quoteOwned: bigint;
  pendingBase: bigint;
  pendingQuote: bigint;
  vestedBase: bigint;
  vestedQuote: bigint;
  vestedNum: number;
}

/** `BandPositionManager.PositionView`, as viem decodes it. */
export interface ChainPositionView {
  tokenId: bigint;
  pool: `0x${string}`;
  base: `0x${string}`;
  quote: `0x${string}`;
  holder: `0x${string}`;
  mintedAt: bigint;
  bandMask: number;
  bands: readonly ChainBandView[];
  owedBase: bigint;
  owedQuote: bigint;
}

export interface LpBand {
  band: number;
  /** The band's fraction of the pair limit, 0..1. */
  spreadFrac: number | null;
  /** Live half-width per side, as a fraction (0.001 = 0.1%). Zero = idle on that side. */
  toleranceBuy: number | null;
  toleranceSell: number | null;
  /** Fee premium over the engine's taker fee: 1 = 1x. */
  feeMultiplier: number | null;
  open: boolean | null;
  shares: bigint;
  /** This band's share of the POSITION's value, 0..100. Value, never share counts. */
  sharePct: number;
  valueUSD: number;
  baseOwned: bigint;
  quoteOwned: bigint;
  /** Vesting ramp of this band's capital, 0..100. */
  vestedPct: number | null;
}

export interface LpToken {
  tokenId: string;
  networkName: string;
  pool: string;
  base: string;
  quote: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  active: boolean;
  bands: LpBand[];
  valueUSD: number;
  costUSD: number;
  unrealizedPnlUSD: number | null;
  realizedPnlUSD: number;
  /** Fees already collected, in USD. */
  feesUSD: number;
  forfeitedUSD: number;
  /** Payable by `collect` now: owed + the vested part of every band's pending. */
  claimableBase: bigint;
  claimableQuote: bigint;
  /** Accrued and still vesting. Collect leaves it; a withdrawal forfeits its share. */
  vestingBase: bigint;
  vestingQuote: bigint;
  /** Value-weighted vesting across the bands, 0..100; null when nothing is known. */
  vestedPct: number | null;
  /** True when the chain read answered for this token; claimable/vesting are zero otherwise. */
  live: boolean;
  mintedAt: number | null;
  snapshotAt: number | null;
}

const ZERO = BigInt(0);

function big(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return ZERO;
  try {
    return BigInt(typeof value === "number" ? Math.trunc(value) : value);
  } catch {
    return ZERO;
  }
}

function frac(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value / LP_DENOM;
}

/**
 * Merge the gateway's ledger with the chain's live view, one `LpToken` per token.
 *
 * The chain row, when present, wins for anything it knows (shares, widths, what each
 * band owns now, fees); the gateway row supplies identity, the ledger and USD values.
 * A token the chain did not answer for is still listed -- it exists -- with its fees
 * unknown (`live: false`), never zero-filled into looking settled.
 */
export function mergeLpPositions(
  networkName: string,
  gateway: GatewayLpPosition[],
  chain: Map<string, ChainPositionView>,
): LpToken[] {
  return gateway.map((g) => {
    const tokenId = String(g.tokenId);
    const view = chain.get(tokenId);
    const gwBands = new Map(g.bands.map((b) => [b.band, b]));
    const bandIds = view ? view.bands.map((b) => b.band) : g.bands.map((b) => b.band);

    const totalValue = g.bands.reduce((sum, b) => sum + (b.valueUSD || 0), 0);
    const bands: LpBand[] = bandIds
      .slice()
      .sort((a, b) => a - b)
      .map((band) => {
        const gw = gwBands.get(band);
        const live = view?.bands.find((b) => b.band === band);
        const valueUSD = gw?.valueUSD ?? 0;
        return {
          band,
          spreadFrac: frac(live?.spreadFrac ?? gw?.spreadFrac),
          toleranceBuy: frac(live?.toleranceBuy ?? gw?.tolerance),
          toleranceSell: frac(live?.toleranceSell ?? gw?.toleranceSell),
          feeMultiplier: frac(live?.feeMultiplier ?? gw?.feeMultiplier),
          open: live?.open ?? gw?.open ?? null,
          shares: live ? live.shares : big(gw?.sharesBN),
          // By VALUE: share counts are per-band pools and cannot be compared or summed.
          // With nothing valued yet the split is even rather than invented.
          sharePct: totalValue > 0 ? (valueUSD / totalValue) * 100 : 100 / Math.max(1, bandIds.length),
          valueUSD,
          baseOwned: live ? live.baseOwned : big(gw?.baseOwnedBN),
          quoteOwned: live ? live.quoteOwned : big(gw?.quoteOwnedBN),
          vestedPct: live ? Math.min(100, (live.vestedNum / LP_DENOM) * 100) : null,
        };
      });

    let claimableBase = ZERO;
    let claimableQuote = ZERO;
    let vestingBase = ZERO;
    let vestingQuote = ZERO;
    if (view) {
      claimableBase = view.owedBase;
      claimableQuote = view.owedQuote;
      for (const b of view.bands) {
        claimableBase += b.vestedBase;
        claimableQuote += b.vestedQuote;
        vestingBase += b.pendingBase - b.vestedBase;
        vestingQuote += b.pendingQuote - b.vestedQuote;
      }
    }

    // Value-weighted, so a large mature band is not averaged down by a small fresh one.
    const weighted = bands.filter((b) => b.vestedPct !== null);
    const weight = weighted.reduce((sum, b) => sum + b.valueUSD, 0);
    const vestedPct =
      weighted.length === 0
        ? null
        : weight > 0
          ? weighted.reduce((sum, b) => sum + (b.vestedPct as number) * b.valueUSD, 0) / weight
          : weighted.reduce((sum, b) => sum + (b.vestedPct as number), 0) / weighted.length;

    return {
      tokenId,
      networkName,
      pool: g.pool ?? view?.pool ?? "",
      base: g.base ?? view?.base ?? "",
      quote: g.quote ?? view?.quote ?? "",
      baseSymbol: g.baseSymbol ?? "?",
      quoteSymbol: g.quoteSymbol ?? "?",
      baseDecimals: g.baseDecimals ?? 18,
      quoteDecimals: g.quoteDecimals ?? 18,
      active: g.active,
      bands,
      valueUSD: g.valueUSD ?? totalValue,
      costUSD: g.costUSD ?? 0,
      unrealizedPnlUSD: g.unrealizedPnlUSD,
      realizedPnlUSD: g.realizedPnlUSD ?? 0,
      feesUSD: g.feesUSD ?? 0,
      forfeitedUSD: g.forfeitedUSD ?? 0,
      claimableBase,
      claimableQuote,
      vestingBase,
      vestingQuote,
      vestedPct,
      live: !!view,
      mintedAt: g.mintedAt ?? (view ? Number(view.mintedAt) : null),
      snapshotAt: g.snapshotAt,
    };
  });
}

/** Default slippage floor for a withdrawal's `minBase`/`minQuote`: 0.5%. */
export const WITHDRAW_SLIPPAGE_BPS = 50;

/**
 * What withdrawing `bps` of a position pays and forfeits, from the live view.
 *
 * Principal is `owned x bps` per band, floored the way the pool floors a payout. The
 * forfeit is the unvested fee attached to the shares leaving -- `vesting x bps`,
 * rounded UP as the pool rounds it -- and it is the only fee a withdrawal loses; the
 * vested fees are paid out with it.
 */
export function withdrawPreview(token: LpToken, bps: number) {
  const b = BigInt(Math.max(0, Math.min(10_000, Math.round(bps))));
  const full = BigInt(10_000);
  const up = (x: bigint) => (x * b + full - BigInt(1)) / full;
  let baseOut = ZERO;
  let quoteOut = ZERO;
  for (const band of token.bands) {
    baseOut += (band.baseOwned * b) / full;
    quoteOut += (band.quoteOwned * b) / full;
  }
  const floor = (x: bigint) => (x * BigInt(10_000 - WITHDRAW_SLIPPAGE_BPS)) / full;
  return {
    baseOut,
    quoteOut,
    minBase: floor(baseOut),
    minQuote: floor(quoteOut),
    forfeitBase: token.vestingBase === ZERO ? ZERO : up(token.vestingBase),
    forfeitQuote: token.vestingQuote === ZERO ? ZERO : up(token.vestingQuote),
    feesPaidBase: token.claimableBase,
    feesPaidQuote: token.claimableQuote,
  };
}

/**
 * Integer target bps per band from percentages, summing to EXACTLY 10,000 -- the
 * contract reverts `TargetsNotWhole` otherwise. Rounding drift lands on the largest
 * target, where it matters least. Bands with a 0% target are omitted, which
 * `redistribute` reads as "empty this band".
 */
export function targetBps(targets: { band: number; pct: number }[]): { bands: number[]; bps: number[] } {
  const kept = targets.filter((t) => t.pct > 0).sort((a, b) => a.band - b.band);
  const total = kept.reduce((sum, t) => sum + t.pct, 0);
  if (kept.length === 0 || total <= 0) return { bands: [], bps: [] };
  const bps = kept.map((t) => Math.floor((t.pct / total) * 10_000));
  const drift = 10_000 - bps.reduce((sum, v) => sum + v, 0);
  let largest = 0;
  for (let i = 1; i < bps.length; i++) if (bps[i]! > bps[largest]!) largest = i;
  bps[largest] = (bps[largest] ?? 0) + drift;
  return { bands: kept.map((t) => t.band), bps };
}

/**
 * Which position an OPEN dialog should render: the live row, or the one it
 * opened with.
 *
 * `PositionsPage` re-resolves the dialog's position out of the live list on
 * every render, and that list moves under an open dialog — a withdrawal
 * refetches it, the receipt invalidates it again, a full exit flips `active` to
 * false, and a `pair:` key stops matching the moment the wallet holds a second
 * position in that pair. When the lookup missed, the dialog UNMOUNTED and took
 * the success screen with it: the confirmation the withdrawal had just rendered
 * vanished, and a full withdrawal could never show one at all, because closing
 * the position is precisely what removes it from the list.
 *
 * The live row wins whenever it exists, so an open dialog keeps showing fresh
 * numbers; the remembered one only stops it disappearing.
 */
export function pinnedPosition(
  live: LpToken | undefined,
  remembered: LpToken | undefined,
): LpToken | undefined {
  return live ?? remembered;
}
