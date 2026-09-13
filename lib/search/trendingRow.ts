/**
 * The zero-query rows of the search modal, derived from gateway market data.
 *
 * The modal has two sources. Typed results come from `/api/search` across every
 * served chain; the zero-query lists — recents and trending — come from
 * `MarketPageProvider`, which already fetched them for the page, so opening the
 * modal costs no request. Both feed ONE row renderer, one route builder and one
 * recents format, which is why the trending rows are mapped into the search
 * result's shape rather than getting near-identical components that drift.
 *
 * ## `chain` is what draws the badge, and it was missing here
 *
 * `SearchModal`'s row reads `result.chain` twice: `ChainChip` guards on it, and
 * `TokenImageIcon` / `PairImageIcon` only draw a `ChainBadge` when handed a
 * `chainName`. These adapters did not set it, so the modal's OPENING state — the
 * one every user sees before typing — was the one state with no chain marks
 * anywhere, while typed results carried them. `fetchChainSearch` stamps the typed
 * path; this stamps the trending one.
 *
 * Sharing the renderer is exactly why the omission was silent: `chain` is
 * optional on the result types (an older gateway may not send it), so leaving it
 * out degrades a row instead of failing a build.
 *
 * Pure and separate from the component so that rule is testable — the same shape
 * `lib/markets/pickerRow.ts` uses, and for the same reason.
 */
import type { SearchPairResult, SearchTokenResult } from "@/queries/server/search";
import type { SpotPair, SpotToken } from "@/types";

export function tokenToResult(t: SpotToken, chain: string): SearchTokenResult {
    return {
        type: "token",
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        ticker: t.ticker,
        logoURI: t.logoURI,
        verified: t.verified,
        chain,
    };
}

export function pairToResult(p: SpotPair, chain: string): SearchPairResult {
    return {
        type: "pair",
        chain,
        id: p.id,
        symbol: p.symbol,
        ticker: p.ticker,
        base: p.base?.id ?? "",
        quote: p.quote?.id ?? "",
        baseSymbol: p.baseSymbol,
        quoteSymbol: p.quoteSymbol,
        // The zero-query list comes from `/api/pairs/*`, whose rows carry each
        // side as an OBJECT with its logo already on it — unlike `/api/search`,
        // which sends addresses and needed the gateway join. Both paths feed the
        // same row, so both have to supply the artwork or the trending list
        // would render marks that a searched result does not.
        baseLogoURI: p.base?.logoURI ?? null,
        quoteLogoURI: p.quote?.logoURI ?? null,
        // Defaulted to `true` when the gateway omits it, because these pairs come from
        // `/api/pairs/*` — which funnels through `listPairs()` and its `visiblePair()`
        // predicate, so they are listed BY CONSTRUCTION.
        //
        // `isUnlisted()` reads anything other than `true` as unlisted, so leaving this
        // undefined would stamp an "unlisted" chip on every trending row. The badge
        // means something, and putting it on the app's busiest markets teaches people
        // to ignore it.
        verified: p.verified ?? true,
    };
}
