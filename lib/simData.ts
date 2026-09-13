import results from "@/docs/research/experiments/results.json";

export const CHART_SERIES = {
  iter: { key: "iter", label: "Iter", color: "var(--m-logo)", emphasize: true },
  // Plum, NOT the orange it used to be (#d95926). Iter's series is --m-logo,
  // which is gold (#B07A08) in light but ember (#E85D2A) in dark — and #d95926
  // is the same orange as that ember, so in dark mode the emphasized series and
  // the headline comparison were indistinguishable on every chart they share.
  // The rule for this palette: every venue colour must separate from BOTH
  // values of --m-logo, because that token is the only mode-dependent one here.
  // Dashed as well as plum. On the impermanent-loss chart v2 and Curve carry
  // IDENTICAL values at every point — the section copy says so — so one line
  // was drawn exactly over the other and v2 was invisible: four legend entries,
  // three visible lines. No hue fixes that. The dash makes both readable where
  // they coincide, and gives the chart a second, non-colour channel.
  v2: { key: "v2", label: "Uniswap v2", color: "#B4628E", dash: "5 4" },
  v3: { key: "v3", label: "Uniswap v3", color: "#199e70" },
  curve: { key: "curve", label: "Curve", color: "#3987e5" },
} as const;

function pctLabel(frac: number) {
  const pct = frac * 100;
  return pct < 1 ? `${pct}%` : `${Math.round(pct)}%`;
}

export const slippageData = results.slippage.map((row) => ({
  x: pctLabel(row.trade_frac_of_depth),
  iter: row.iter_slippage_pct,
  v2: row.v2_slippage_pct,
  v3: row.v3_slippage_pct,
  curve: row.curve_slippage_pct,
}));

export const mevData = results.mev_sandwich.map((row) => ({
  x: pctLabel(row.victim_trade_frac_of_depth),
  iter: row.iter_sandwich_profit_damped,
  v2: row.v2_sandwich_profit,
  v3: row.v3_sandwich_profit,
  curve: row.curve_sandwich_profit,
}));

export const ilData = results.impermanent_loss.map((row) => ({
  x: `${row.price_ratio}×`,
  iter: row.iter_il_pct_widest_tier,
  v2: row.v2_il_pct,
  v3: row.v3_il_pct_10pct_range,
  curve: row.curve_il_pct,
}));

const LP_SCENARIOS = [
  { scenario: "thin_book", label: "Iter, thin market" },
  { scenario: "reference_book", label: "Iter, mid-depth" },
  { scenario: "deep_book", label: "Iter, deepest" },
] as const;

function scenarioRange(scenario: string) {
  const values = results.lp_economics.cap_min_max
    .filter((row) => row.scenario === scenario)
    .map((row) => row.max_take_at_cap);
  return { lo: Math.min(...values), hi: Math.max(...values) };
}

// The whitepaper (§4.6) holds every AMM's fee at 30bps here for an
// apples-to-apples comparison: "Uniswap v2/v3 $3,000 at every depth." This
// chart is gross income only — the real per-fee-tier and net-of-LVR figures
// (which do differ) are in lvrNetData below, sourced from
// lp_economics.uniswap_v3_by_tier / net_of_lvr, not scaled or estimated here.
const CEX = results.lp_economics.cex_market_maker;
// Neutral grey, deliberately outside the four venue colors: a CEX maker is a
// different kind of participant, not a fifth venue in the same comparison.
const CEX_GREY = "#7D809A";

export const lpEconomicsData = [
  ...LP_SCENARIOS.map(({ scenario, label }) => ({
    label,
    color: CHART_SERIES.iter.color,
    ...scenarioRange(scenario),
  })),
  {
    label: "Uniswap v2",
    color: CHART_SERIES.v2.color,
    lo: results.lp_economics.amm.uniswap_v2_gross,
    hi: results.lp_economics.amm.uniswap_v2_gross,
  },
  {
    label: "Uniswap v3 (±10% range)",
    color: CHART_SERIES.v3.color,
    lo: results.lp_economics.amm.uniswap_v3_gross,
    hi: results.lp_economics.amm.uniswap_v3_gross,
  },
  {
    label: "Curve",
    color: CHART_SERIES.curve.color,
    lo: results.lp_economics.amm.curve_gross,
    hi: results.lp_economics.amm.curve_gross,
  },
  {
    label: "CEX maker, top tier",
    color: CEX_GREY,
    lo: CEX.total_range_gross[0],
    hi: CEX.total_range_gross[1],
  },
  {
    label: "CEX maker, retail tier",
    color: CEX_GREY,
    lo: -CEX.retail_maker_fee_cost_range[1],
    hi: -CEX.retail_maker_fee_cost_range[0],
  },
];

// Every gross figure above (Iter included) is gross of the position's own
// price-risk channel — LVR for the AMMs, the bounded tolerance cost for
// Iter. This nets that out at a representative +25% price move, using the
// same iter_il_bound / il_standard / v3_il_approx formulas that already
// back the impermanent-loss chart above (see results.json
// lp_economics.net_of_lvr and whitepaper §4.6, "Net of adverse selection").
const NET_LVR = results.lp_economics.net_of_lvr.find((r) => r.price_ratio === 1.25)!;
const ogRow = (scenario: string, tier: string) =>
  NET_LVR.iter_by_scenario.find((r) => r.scenario === scenario && r.tier === tier)!;

function lvrRow(label: string, color: string, gross: number, ilCost: number, net: number) {
  return { label, color, lo: net, hi: net, gross, ilCost };
}

// A CEX market maker's cost channel is NOT LVR. LVR (Milionis et al.) is
// defined against an AMM's mechanical rebalancing rule; a CEX maker quotes
// actively and carries inventory risk instead, which whitepaper §4.6
// explicitly declines to model.
//
// The zero-cost carry-across that follows from that is now decided in the
// simulation (sim.py emits net_of_lvr[*].cex_* with il_cost null and
// cost_unmodeled set), not here -- so this file renders the decision rather
// than making it, and the paper and the page cannot drift apart on it.
type CexNetRow = { net_lo: number; net_hi: number; cost_unmodeled: boolean };
function cexRow(label: string, row: CexNetRow) {
  return {
    label,
    color: CEX_GREY,
    lo: row.net_lo,
    hi: row.net_hi,
    costUnmodeled: row.cost_unmodeled,
  };
}

export const lvrNetData = [
  lvrRow(
    "Iter, thin market",
    CHART_SERIES.iter.color,
    ogRow("thin_book", "s_cap").gross,
    ogRow("thin_book", "s_cap").il_cost,
    ogRow("thin_book", "s_cap").net,
  ),
  lvrRow(
    "Iter, mid-depth",
    CHART_SERIES.iter.color,
    ogRow("reference_book", "s_cap").gross,
    ogRow("reference_book", "s_cap").il_cost,
    ogRow("reference_book", "s_cap").net,
  ),
  lvrRow(
    "Iter, deepest",
    CHART_SERIES.iter.color,
    ogRow("deep_book", "s_cap").gross,
    ogRow("deep_book", "s_cap").il_cost,
    ogRow("deep_book", "s_cap").net,
  ),
  lvrRow(
    "Iter, s = 0 (any depth)",
    CHART_SERIES.iter.color,
    ogRow("thin_book", "s0").gross,
    ogRow("thin_book", "s0").il_cost,
    ogRow("thin_book", "s0").net,
  ),
  lvrRow(
    "Uniswap v2",
    CHART_SERIES.v2.color,
    NET_LVR.uniswap_v2.gross,
    NET_LVR.uniswap_v2.il_cost,
    NET_LVR.uniswap_v2.net,
  ),
  lvrRow(
    "Uniswap v3 (0.30% tier)",
    CHART_SERIES.v3.color,
    NET_LVR.uniswap_v3_030pct.gross,
    NET_LVR.uniswap_v3_030pct.il_cost,
    NET_LVR.uniswap_v3_030pct.net,
  ),
  lvrRow(
    "Curve",
    CHART_SERIES.curve.color,
    NET_LVR.curve.gross,
    NET_LVR.curve.il_cost,
    NET_LVR.curve.net,
  ),
  cexRow("CEX maker, top tier", NET_LVR.cex_market_maker_top_tier),
  cexRow("CEX maker, retail tier", NET_LVR.cex_maker_retail),
];

// How each venue's LP fee is actually computed, as a rate on the LP's own
// deposited liquidity — so a user can type in a USDC amount and see the
// fee each venue's formula produces. AMMs charge a fixed protocol fee rate.
// Iter's LP pays no fee at all and instead earns the spread they
// themselves quoted, plus the trader's own tier fee; the rate below is that
// formula at the top slippageLimit tier under the §3.4 cap on a thin book
// (results.json lp_economics.cap_min_max).
//
// This treats "USDC deposited" and "USDC matched" as the same number — a 1:1
// turnover assumption, the same simplifying parameter the net-of-LVR figures
// above already use. Real per-capital yield depends on volume/TVL turnover,
// which is venue-specific and deliberately not modeled (whitepaper §4.6,
// Observation 3).
const VOL = results.lp_economics.per_matched_volume_usd;
const THIN_TOP_TIER = results.lp_economics.cap_min_max.find(
  (r) => r.scenario === "thin_book" && r.trader_taker_fee === results.lp_economics.iter_tiers[0].trader_taker_fee,
)!;

export const feeRates = [
  {
    venue: "Uniswap v2 / v3",
    formula: "fee rate × your liquidity",
    detail: "0.30% flat",
    rate: results.lp_economics.amm.uniswap_v2_gross / VOL,
  },
  {
    venue: "Curve",
    formula: "fee rate × your liquidity",
    detail: "0.04% flat",
    rate: results.lp_economics.amm.curve_gross / VOL,
  },
  {
    venue: "Iter",
    formula: "(spread margin + trader's taker fee) × your liquidity — you pay no fee",
    detail: `${(THIN_TOP_TIER.max_slippage_cap * 100).toFixed(0)}% + ${(THIN_TOP_TIER.trader_taker_fee * 100).toFixed(2)}%, thin market, top tier`,
    rate: THIN_TOP_TIER.max_take_at_cap / VOL,
  },
];

// --- Trader side: total cost (protocol fee + price impact) of a single
// trade, as a function of trade size. Fee rates are flat like the LP side;
// price impact isn't, so it's linearly interpolated off the same slippage
// grid the "Slippage by trade size" chart above already plots
// (results.slippage), on the same $1M pool-depth basis.
export const traderFeeRates = {
  v2: results.lp_economics.amm.uniswap_v2_gross / VOL,
  v3: results.lp_economics.amm.uniswap_v2_gross / VOL, // same 30bps tier, per §4.6's apples-to-apples convention
  curve: results.lp_economics.amm.curve_gross / VOL,
  iter: results.lp_economics.iter_tiers[0].trader_taker_fee, // base (10bps) membership tier
};

const SLIPPAGE_CURVE = results.slippage.map((row) => ({
  frac: row.trade_frac_of_depth,
  iter: row.iter_slippage_pct,
  v2: row.v2_slippage_pct,
  v3: row.v3_slippage_pct,
  curve: row.curve_slippage_pct,
}));

function interpolateSlippagePct(venue: "iter" | "v2" | "v3" | "curve", frac: number) {
  const pts = SLIPPAGE_CURVE;
  if (frac <= pts[0].frac) return pts[0][venue];
  const last = pts[pts.length - 1];
  if (frac >= last.frac) return last[venue];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (frac >= a.frac && frac <= b.frac) {
      const t = (frac - a.frac) / (b.frac - a.frac);
      return a[venue] + t * (b[venue] - a[venue]);
    }
  }
  return last[venue];
}

export function traderTotalCost(venue: "iter" | "v2" | "v3" | "curve", tradeUsd: number) {
  const frac = tradeUsd / VOL;
  const slippagePct = interpolateSlippagePct(venue, frac);
  return tradeUsd * (traderFeeRates[venue] + slippagePct / 100);
}

function fmtTradeSize(usd: number) {
  return usd >= 1000
    ? `$${(usd / 1000) % 1 === 0 ? (usd / 1000).toFixed(0) : (usd / 1000).toFixed(1)}K`
    : `$${usd.toFixed(0)}`;
}

// Total cost (fee + price impact) at the same trade sizes already plotted
// on the "Slippage by trade size" chart, so the two charts are directly
// comparable.
export const tradeCostData = results.slippage.map((row) => {
  const tradeUsd = row.trade_frac_of_depth * VOL;
  return {
    x: fmtTradeSize(tradeUsd),
    v2: tradeUsd * (traderFeeRates.v2 + row.v2_slippage_pct / 100),
    v3: tradeUsd * (traderFeeRates.v3 + row.v3_slippage_pct / 100),
    curve: tradeUsd * (traderFeeRates.curve + row.curve_slippage_pct / 100),
    iter: tradeUsd * (traderFeeRates.iter + row.iter_slippage_pct / 100),
  };
});
