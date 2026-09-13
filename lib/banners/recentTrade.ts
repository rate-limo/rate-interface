import type { SpotTrade } from "@/types";
import type { SpotTradeEvent } from "@/types";

/**
 * Maps the newest trade the gateway returned into the event shape the pump
 * banner renders — or null when there is nothing renderable.
 *
 * ## Why this is a function and not four lines inside the effect
 *
 * It used to be inline, and it took every app page down with it.
 *
 * `PumpNotificationBanner` rides `AppShell`, so it renders on EVERY page that
 * has a sidebar. Its effect awaited `getSpotRecentOverallTrades` — a `"use
 * server"` action that throws on any non-ok response — with no `.catch()`, then
 * read `overallTrade.trades[0].base.symbol` with no check that a trade came
 * back. So two ordinary, expected conditions became an unhandled rejection that
 * replaced the whole tree with Next's "This page couldn't load":
 *
 *  - **The gateway rate-limits.** `/api/trades/all` answers 429 under load, and
 *    the gateway's own limiter is designed to. Observed doing exactly this.
 *  - **The chain has no trades yet.** `trades[0]` is undefined on a fresh or
 *    quiet network, and `.base.symbol` on undefined is a TypeError.
 *
 * The symptom is nastier than a missing banner: the sidebar is gone too, so the
 * page reads as "links don't work" rather than "a banner failed". A decorative
 * strip must never be able to do that.
 *
 * AppShell's comment already promised this behaviour — "self-hides when there's
 * no recent trade to show, so it costs nothing when the indexer is unreachable".
 * The render path honoured it (`if (!transactionData) return null`); the fetch
 * path never did. This closes the gap, and being pure means the repo's
 * node-environment vitest can hold it to that.
 */
export function toTradeEvent(trade: SpotTrade | undefined | null): SpotTradeEvent | null {
    if (!trade) return null;
    // The fields the banner dereferences. A row missing any of them is not
    // renderable, and guessing values would put invented numbers on screen.
    if (!trade.base?.symbol || !trade.quote?.symbol || typeof trade.account !== "string") {
        return null;
    }

    return {
        ...trade,
        eventId: "spotTrade",
        // Required on the wire type, optional on the REST row. Zero rather than a guess:
        // a fee this banner never displays should not invent a number.
        baseFee: trade.baseFee ?? 0,
        quoteFee: trade.quoteFee ?? 0,
        base: trade.base.symbol,
        quote: trade.quote.symbol,
        baseLogoURI: trade.base.logoURI,
        quoteLogoURI: trade.quote.logoURI,
        account: trade.account,
        isBid: trade.isBid,
        price: trade.price,
        quoteAmount: trade.quoteAmount,
        asset: trade.base.symbol,
        assetSymbol: trade.base.symbol,
        updatedAt: Date.now(),
    } as SpotTradeEvent;
}
