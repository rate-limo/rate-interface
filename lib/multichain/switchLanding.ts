import { buildPageUrl, stripLocale } from "@/lib/routing/chainParams";

/**
 * The base symbol of the market currently being viewed, or null when the route
 * is not pair-bound.
 *
 * ## It matched the wrong route for months
 *
 * This lived inside `useChainSwitch` as `pathname !== "/trade"` — written when
 * `/trade` WAS the order-book terminal. The Basic/Pro split moved that to
 * `/trade/pro` and left `/trade` as the convert card, which
 * `apps/web/CLAUDE.md` is explicit is "never pair-bound". So the check ended up
 * reading a symbol only from the page that never has one, and never from the
 * page that always does.
 *
 * The effect was silent and total: `resolveSwitchTarget` — whose own comment
 * says "carrying a specific market across the switch, so this is the Pro gear"
 * — could not receive a symbol from Pro, so every chain switch from the
 * terminal fell through to the cross-chain fallback and threw the trader out to
 * `/explore`. `resolveSwitchTarget` had tests; the parsing that feeds it did
 * not, which is the whole reason this survived. It lives here now, beside the
 * function it feeds and inside the same test file.
 *
 * `stripLocale` rather than a bare comparison: `/ko/trade/pro` is the same page,
 * and reading the first path segment directly is the trap `chainParams.ts`
 * warns about — it silently returns null for every non-default locale.
 */
export function currentMarketSymbolFromPath(
  pathname: string,
  search: string,
): string | null {
  const { rest } = stripLocale(pathname);
  // Pro only. Basic takes tokens and may route across several books, so it has
  // no single market to carry across a chain switch.
  if (rest !== "/trade/pro") return null;
  return new URLSearchParams(search).get("base");
}


export interface ResolveSwitchTargetInput {
  /** The base symbol of the market the trader is currently viewing (e.g. "WETH"), or
   * null/undefined/"" when there is no current market — e.g. switching chains from a
   * non-trade page (markets overview, portfolio, ...). */
  fromMarketSymbol: string | null | undefined;
  /** Human-readable name of the chain being switched to (e.g. "Monad Testnet"). Not used
   * in path construction (routes are slug-keyed) but kept in the interface so callers don't
   * need to separately track name vs slug. */
  toNetworkName: string;
  /** Route slug of the chain being switched to (e.g. "monad-testnet"). */
  toSlug: string;
  /** Whether `fromMarketSymbol` is a listed market on the target chain. Computed by the
   * caller (a targeted per-network query) — this function does no I/O. */
  isListed: boolean;
}

/**
 * Pure: resolves where a chain switch should land. Preserves the current market on the
 * target chain if it's listed there; otherwise falls back to the markets overview.
 * Never produces a path that could 404 or show an empty book.
 *
 * The fallback used to be `/explore?chain=<target>`, i.e. that chain's own market
 * list. Explore became cross-chain on 2026-09-04 and its URL now names no chain
 * (see SCHEME.explore), so the fallback is the union instead. That strengthens
 * the invariant rather than weakening it: the old target could legitimately be a
 * chain with nothing listed, which is exactly the empty list this function
 * exists to avoid, and the union cannot be empty while any chain has a market.
 *
 * `toSlug` is still taken, and is still used on the listed branch. The switch
 * also moves the provider's connected chain, so the choice is not lost by the
 * URL dropping it.
 */
export function resolveSwitchTarget({
  fromMarketSymbol,
  toSlug,
  isListed,
}: ResolveSwitchTargetInput): string {
  if (fromMarketSymbol && isListed) {
    // Carrying a specific market across the switch, so this is the Pro gear —
    // Basic isn't pair-bound and would drop the symbol.
    return buildPageUrl("trade", { pro: true, slug: toSlug, base: fromMarketSymbol });
  }
  // Cross-chain, so no slug — see the note above.
  return buildPageUrl("explore");
}
