/**
 * Whose trade is it, and which way did THEY go.
 *
 * A fill has two sides and one `isBid`, and `isBid` belongs to the taker: it is
 * the direction of the order that crossed the book. So a maker whose resting
 * sell was hit by a buy comes back with `isBid: true` and has, in fact, sold.
 *
 * This mattered the day `/api/tradehistory/:address` started matching on
 * `spotTrades.maker` as well as `taker` (apps/gateway/src/api/orders.ts). Before
 * that the maker branch was unreachable — the endpoint only ever returned fills
 * the wallet had taken, so reading `isBid` raw happened to be right — and every
 * surface built on it inherited an assumption nobody had to state. Two of them
 * were wrong the moment the OR landed: the Side column and the Role column of
 * `Organisms/Tables/TradeHistory`.
 *
 * One module rather than the rule written out per surface, because there are
 * three of them now (the portfolio Trades tab, the Pro terminal table, and the
 * CSV they export) and the failure is silent in all three: a wrong side renders
 * as a perfectly plausible trade.
 */

/** Addresses arrive checksummed from the gateway and mixed-case from wagmi. */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Was `viewer` the taker of this fill?
 *
 * With no viewer to compare against, this answers **true** — i.e. report `isBid`
 * as it stands. That is the honest default for a surface with no wallet in
 * context (the public tape), where `isBid` really is the trade's own direction
 * and there is no "you" to be on the other side of it. The caller passing no
 * address is what selects it.
 */
export function wasTaker(taker: string | undefined | null, viewer?: string | null): boolean {
  return viewer ? sameAddress(taker, viewer) : true;
}

/** True when `viewer` ended up long the base asset — `isBid` seen from their side. */
export function viewerBought(
  isBid: boolean,
  taker: string | undefined | null,
  viewer?: string | null,
): boolean {
  return wasTaker(taker, viewer) ? isBid : !isBid;
}

/** `Buy` / `Sell` from the viewer's side, ready to render. */
export function viewerSide(
  isBid: boolean,
  taker: string | undefined | null,
  viewer?: string | null,
): "Buy" | "Sell" {
  return viewerBought(isBid, taker, viewer) ? "Buy" : "Sell";
}

/**
 * Taker or maker, from the viewer's side.
 *
 * The Role column used to compare `account` against `taker`, and `account` is
 * resynthesized FROM `taker` by the gateway — so it read "Taker" on every row
 * ever rendered, including, once maker rows arrived, the ones where it is
 * exactly wrong. Compare against the wallet being viewed instead; with none,
 * there is no role to report.
 */
export function viewerRole(
  taker: string | undefined | null,
  viewer?: string | null,
): "Taker" | "Maker" | "--" {
  if (!viewer) return "--";
  return sameAddress(taker, viewer) ? "Taker" : "Maker";
}
