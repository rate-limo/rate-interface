import { NextResponse } from "next/server";

/**
 * ETH/USD for the status bar, from Coinbase.
 *
 * ## Why this is not read from our own indexer
 *
 * The chip beside it used to be a `PriceChip` over `defaultTokenData` — the
 * first page of 20 tokens from the chain's indexer — so it showed a price only
 * when ETH happened to appear in that page and an em-dash otherwise. On Arc it
 * dashed permanently: the gas asset there is USDC and there is no ETH market at
 * all, so no page of that list could ever contain one. ETH/USD is a fact about
 * the world rather than about this venue's book, and it should not depend on
 * which chain the app is pointed at.
 *
 * ## Why a route handler and not a fetch from the component
 *
 * Coinbase serves `access-control-allow-origin: *`, so the browser COULD call
 * it directly. Going through here instead buys two things: every visitor shares
 * one upstream response through the cache below rather than each opening their
 * own connection to a third party from the page, and the status bar renders on
 * every route in the app — so "one request per client per minute" is a lot of
 * requests against a public rate limit nobody controls.
 *
 * ## `/stats`, not `/v2/prices/ETH-USD/spot`
 *
 * The spot endpoint answers the price and nothing else, and the chip renders a
 * 24h change beside it. Recovering that from spot means a SECOND call to
 * `spot?date=…`, which returns a daily close — so the delta would be "since
 * yesterday's close" while the label says 24h. `/products/ETH-USD/stats`
 * carries `open` and `last` together, `open` is a rolling 24-hour open, and it
 * is one request. Same public API, and the number matches the label.
 */
const COINBASE_STATS = "https://api.exchange.coinbase.com/products/ETH-USD/stats";

/**
 * Cached for a minute, and the chip polls on roughly the same cadence.
 *
 * A status-bar price is ambient: nobody trades off it, and it sits on every
 * page in the app. A minute is well inside what that reading is worth and keeps
 * one upstream request serving every visitor in the window.
 */
export const revalidate = 60;

/** Coinbase returns its numbers as STRINGS; `Number("")` is 0, which would
 *  print a $0.00 ETH. Anything not finite and positive is treated as absent. */
function price(value: unknown): number | null {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET() {
  try {
    const response = await fetch(COINBASE_STATS, {
      // Coinbase rejects a request with no UA from some egress ranges.
      headers: { accept: "application/json", "user-agent": "iter-status-bar" },
      next: { revalidate },
    });
    if (!response.ok) {
      return NextResponse.json({ usd: null, changePct: null }, { status: 200 });
    }
    const body = (await response.json()) as { last?: unknown; open?: unknown };
    const usd = price(body.last);
    const open = price(body.open);
    return NextResponse.json({
      usd,
      // Null rather than 0 when the open is missing: "we cannot compute the
      // change" and "it has not moved" are different claims, and the chip
      // renders them differently.
      changePct: usd !== null && open !== null ? ((usd - open) / open) * 100 : null,
    });
  } catch {
    // Never throws to the client. The status bar is chrome on every page in the
    // app — a 500 here would surface as a page-level error boundary for a
    // number nobody is trading on. The chip shows a dash instead.
    return NextResponse.json({ usd: null, changePct: null }, { status: 200 });
  }
}
