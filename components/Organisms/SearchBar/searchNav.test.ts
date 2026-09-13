import { describe, expect, it } from "vitest";
import type { SearchPairResult, SearchTokenResult } from "@/queries/server/search";
import {
    buildResultPath,
    buildResultTarget,
    buildWalletTarget,
    clampHighlightIndex,
    filterByTab,
    flattenSearchResults,
    tabCounts,
    walletTargetLabel,
    type SearchWalletResult,
} from "./searchNav";

const token = (id: string, symbol: string, verified = true): SearchTokenResult => ({
    type: "token",
    id,
    symbol,
    name: `${symbol} Name`,
    ticker: symbol,
    logoURI: "",
    verified,
});

const pair = (id: string, symbol: string, verified = true): SearchPairResult => ({
    type: "pair",
    id,
    symbol,
    ticker: symbol,
    base: `base-${id}`,
    quote: `quote-${id}`,
    baseSymbol: symbol.split("/")[0],
    quoteSymbol: symbol.split("/")[1],
    verified,
});

const ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const OTHER = "0x1111111111111111111111111111111111111111" as const;
const EXPLORER = "https://explorer.example.xyz";

const wallet = (address: `0x${string}` = ADDRESS): SearchWalletResult => ({
    type: "wallet",
    id: address.toLowerCase(),
    address,
});

describe("flattenSearchResults", () => {
    it("orders tokens before pairs, matching the panel's Tokens-then-Pools group layout", () => {
        const tokens = [token("t1", "ETH"), token("t2", "BTC")];
        const pairs = [pair("p1", "ETH/USDC")];

        const items = flattenSearchResults(tokens, pairs);

        expect(items.map((i) => i.kind)).toEqual(["token", "token", "pair"]);
        expect(items[0]).toEqual({ kind: "token", result: tokens[0] });
        expect(items[2]).toEqual({ kind: "pair", result: pairs[0] });
    });

    // A 42-hex-character query is an unambiguous statement of intent; the fuzzy
    // ilike matches on the same string are the speculative ones.
    it("puts a wallet hit first, ahead of every token and pair match", () => {
        const items = flattenSearchResults([token("t1", "ETH")], [pair("p1", "ETH/USDC")], wallet());

        expect(items.map((i) => i.kind)).toEqual(["wallet", "token", "pair"]);
    });

    it("omits the wallet row entirely when the query is not an address", () => {
        expect(flattenSearchResults([token("t1", "ETH")], [], null).map((i) => i.kind)).toEqual([
            "token",
        ]);
        expect(flattenSearchResults([token("t1", "ETH")], []).map((i) => i.kind)).toEqual(["token"]);
    });

    it("keeps listed hits ahead of unlisted ones so Enter never takes an unreviewed market", () => {
        const items = flattenSearchResults(
            [token("t1", "SCAM", false), token("t2", "USDC", true)],
            [],
        );

        expect(items.map((i) => (i.result as SearchTokenResult).symbol)).toEqual(["USDC", "SCAM"]);
    });

    it("returns an empty list when there are no tokens or pairs", () => {
        expect(flattenSearchResults([], [])).toEqual([]);
    });
});

describe("filterByTab", () => {
    const items = flattenSearchResults(
        [token("t1", "ETH"), token("t2", "BTC")],
        [pair("p1", "ETH/USDC")],
        wallet(),
    );

    it("passes everything through on the All tab, in flatten order", () => {
        expect(filterByTab(items, "all")).toEqual(items);
    });

    it("narrows to one kind per tab", () => {
        expect(filterByTab(items, "tokens").map((i) => i.kind)).toEqual(["token", "token"]);
        expect(filterByTab(items, "pools").map((i) => i.kind)).toEqual(["pair"]);
        expect(filterByTab(items, "wallets").map((i) => i.kind)).toEqual(["wallet"]);
    });

    it("returns an empty list for a tab with no hits rather than falling back to all", () => {
        const tokensOnly = flattenSearchResults([token("t1", "ETH")], []);
        expect(filterByTab(tokensOnly, "pools")).toEqual([]);
        expect(filterByTab(tokensOnly, "wallets")).toEqual([]);
    });
});

describe("tabCounts", () => {
    it("counts each kind, with all as the total", () => {
        const items = flattenSearchResults(
            [token("t1", "ETH"), token("t2", "BTC")],
            [pair("p1", "ETH/USDC")],
            wallet(),
        );

        expect(tabCounts(items)).toEqual({ all: 4, tokens: 2, pools: 1, wallets: 1 });
    });

    it("is all zeroes for an empty result set", () => {
        expect(tabCounts([])).toEqual({ all: 0, tokens: 0, pools: 0, wallets: 0 });
    });
});

describe("clampHighlightIndex", () => {
    it("always returns -1 (no highlight) when the list is empty", () => {
        expect(clampHighlightIndex(-1, 1, 0)).toBe(-1);
        expect(clampHighlightIndex(3, -1, 0)).toBe(-1);
    });

    it("moves forward from an unselected (-1) state to the first item", () => {
        expect(clampHighlightIndex(-1, 1, 3)).toBe(0);
    });

    it("wraps from the last item to the first on ArrowDown", () => {
        expect(clampHighlightIndex(2, 1, 3)).toBe(0);
    });

    it("wraps from the first item to the last on ArrowUp", () => {
        expect(clampHighlightIndex(0, -1, 3)).toBe(2);
    });

    it("moves backward from an unselected (-1) state to the last item", () => {
        expect(clampHighlightIndex(-1, -1, 3)).toBe(2);
    });

    it("moves within bounds without wrapping when there's room", () => {
        expect(clampHighlightIndex(1, 1, 4)).toBe(2);
        expect(clampHighlightIndex(2, -1, 4)).toBe(1);
    });
});

describe("buildResultTarget", () => {
    it("builds the token price-page path exactly like TokenTableRow's Link href", () => {
        const item = { kind: "token" as const, result: token("t1", "ETH") };
        expect(buildResultTarget("monad", item)).toEqual({
            href: "/token/ETH?chain=monad",
            external: false,
        });
    });

    /**
     * The profile, not the terminal — searching a market is a reading intent.
     *
     * This pointed at `/trade/pro` for one commit because the profile resolved from
     * the listing-GATED pairs list while `/api/search` is ungated, so every
     * pre-graduation hit dead-ended on "No market data". `/pair` resolves through
     * the ungated detail route now. If this expectation is ever flipped back, the
     * lookup in `app/[locale]/pair/page.tsx` is what to check first.
     */
    it("opens a pair's PROFILE, not the Pro terminal", () => {
        const item = { kind: "pair" as const, result: pair("p1", "ETH/USDC") };
        expect(buildResultTarget("monad", item)).toEqual({
            href: "/pair?chain=monad&base=ETH&quote=USDC",
            external: false,
        });
    });

    it("uses the active network slug passed in, not a hardcoded one", () => {
        const item = { kind: "token" as const, result: token("t1", "BTC") };
        expect(buildResultTarget("rise", item)?.href).toBe("/token/BTC?chain=rise");
    });

    it("routes a wallet hit through the wallet rules", () => {
        const item = { kind: "wallet" as const, result: wallet() };
        expect(buildResultTarget("monad", item, { connectedAddress: ADDRESS })).toEqual({
            href: "/portfolio",
            external: false,
        });
    });
});

describe("buildWalletTarget", () => {
    it("sends the user's OWN address to the portfolio, the one real internal destination", () => {
        expect(buildWalletTarget(ADDRESS, { connectedAddress: ADDRESS })).toEqual({
            href: "/portfolio",
            external: false,
        });
    });

    // wagmi's address is checksummed; a pasted one may not be. A === here fails to
    // recognise the user's own wallet and silently sends them to an explorer.
    it("recognises the connected wallet across casing", () => {
        expect(
            buildWalletTarget(ADDRESS.toLowerCase(), { connectedAddress: ADDRESS })?.href,
        ).toBe("/portfolio");
    });

    it("sends any OTHER address to the explorer, flagged as leaving the app", () => {
        expect(buildWalletTarget(OTHER, { connectedAddress: ADDRESS, explorerUrl: EXPLORER })).toEqual(
            { href: `${EXPLORER}/address/${OTHER}`, external: true },
        );
    });

    it("does not double the slash when the explorer url has a trailing one", () => {
        expect(buildWalletTarget(OTHER, { explorerUrl: `${EXPLORER}/` })?.href).toBe(
            `${EXPLORER}/address/${OTHER}`,
        );
    });

    // Rather than a dead row that looks clickable and does nothing.
    it("returns null when the chain has no explorer and it isn't the user's own wallet", () => {
        expect(buildWalletTarget(OTHER, { connectedAddress: ADDRESS })).toBeNull();
        expect(buildWalletTarget(OTHER, {})).toBeNull();
    });

    it("still resolves the user's own wallet when there is no explorer configured", () => {
        expect(buildWalletTarget(ADDRESS, { connectedAddress: ADDRESS })?.href).toBe("/portfolio");
    });
});

describe("walletTargetLabel", () => {
    it("names the destination the row will actually take", () => {
        expect(walletTargetLabel(ADDRESS, { connectedAddress: ADDRESS })).toBe("Your portfolio");
        expect(walletTargetLabel(OTHER, { explorerUrl: EXPLORER })).toBe("View on explorer");
        expect(walletTargetLabel(OTHER, {})).toBe("No explorer for this chain");
    });
});

describe("buildResultPath", () => {
    it("returns the internal href for tokens and pairs", () => {
        expect(buildResultPath("monad", { kind: "token", result: token("t1", "ETH") })).toBe(
            "/token/ETH?chain=monad",
        );
        expect(buildResultPath("monad", { kind: "pair", result: pair("p1", "ETH/USDC") })).toBe(
            "/pair?chain=monad&base=ETH&quote=USDC",
        );
    });

    // Prefetch reads this. An explorer URL is not a route and warming it would
    // throw inside next/navigation.
    it("returns an empty string for a wallet hit, which has no route to prefetch", () => {
        expect(buildResultPath("monad", { kind: "wallet", result: wallet() })).toBe("");
    });
});
