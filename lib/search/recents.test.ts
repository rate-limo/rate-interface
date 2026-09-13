import { describe, expect, it } from "vitest";
import type { SearchNavItem } from "@/components/Organisms/SearchBar/searchNav";
import {
    isValidRecent,
    MAX_RECENTS,
    parseRecents,
    pushRecent,
    recentKey,
} from "./recents";

const tokenItem = (id: string, symbol: string): SearchNavItem => ({
    kind: "token",
    result: { type: "token", id, symbol, name: symbol, ticker: symbol, logoURI: "", verified: true },
});

const pairItem = (id: string, base: string, quote: string): SearchNavItem => ({
    kind: "pair",
    result: {
        type: "pair",
        id,
        symbol: `${base}/${quote}`,
        ticker: `${base}/${quote}`,
        base: `b-${id}`,
        quote: `q-${id}`,
        baseSymbol: base,
        quoteSymbol: quote,
        verified: true,
    },
});

const walletItem = (address: string): SearchNavItem => ({
    kind: "wallet",
    result: { type: "wallet", id: address.toLowerCase(), address: address as `0x${string}` },
});

const ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("isValidRecent", () => {
    it("accepts each of the three kinds", () => {
        expect(isValidRecent(tokenItem("t1", "ETH"))).toBe(true);
        expect(isValidRecent(pairItem("p1", "ETH", "USDC"))).toBe(true);
        expect(isValidRecent(walletItem(ADDRESS))).toBe(true);
    });

    it("rejects anything that is not an object with a result", () => {
        expect(isValidRecent(null)).toBe(false);
        expect(isValidRecent("ETH")).toBe(false);
        expect(isValidRecent(42)).toBe(false);
        expect(isValidRecent({ kind: "token" })).toBe(false);
        expect(isValidRecent({ kind: "token", result: null })).toBe(false);
    });

    it("rejects an unknown kind", () => {
        expect(isValidRecent({ kind: "nft", result: { id: "x", symbol: "y" } })).toBe(false);
    });

    // These are the fields the ROUTE is built from — a token entry without a
    // symbol produces `/price/undefined`.
    it("rejects entries missing the fields the destination URL needs", () => {
        expect(isValidRecent({ kind: "token", result: { id: "t1" } })).toBe(false);
        expect(isValidRecent({ kind: "pair", result: { id: "p1", baseSymbol: "ETH" } })).toBe(false);
        expect(isValidRecent({ kind: "wallet", result: { address: "not-an-address" } })).toBe(false);
        expect(isValidRecent({ kind: "wallet", result: { address: `${ADDRESS}00` } })).toBe(false);
    });
});

describe("parseRecents", () => {
    it("round-trips a stored list", () => {
        const list = [tokenItem("t1", "ETH"), pairItem("p1", "ETH", "USDC")];
        expect(parseRecents(JSON.stringify(list))).toEqual(list);
    });

    it("reads missing, empty and unparseable storage as no recents, never throwing", () => {
        expect(parseRecents(null)).toEqual([]);
        expect(parseRecents("")).toEqual([]);
        expect(parseRecents("{ not json")).toEqual([]);
    });

    it("reads a non-array payload as no recents", () => {
        expect(parseRecents(JSON.stringify({ kind: "token" }))).toEqual([]);
        expect(parseRecents(JSON.stringify("ETH"))).toEqual([]);
    });

    // A hand-edited entry drives a router.push, so one bad row must not be
    // trusted — but it must not take the good rows down with it either.
    it("drops malformed entries and keeps the valid ones", () => {
        const raw = JSON.stringify([
            tokenItem("t1", "ETH"),
            { kind: "token", result: { id: "t2" } },
            pairItem("p1", "ETH", "USDC"),
        ]);

        expect(parseRecents(raw).map((i) => i.kind)).toEqual(["token", "pair"]);
    });

    it("caps a storage payload that has grown past the limit", () => {
        const raw = JSON.stringify(
            Array.from({ length: MAX_RECENTS + 4 }, (_, i) => tokenItem(`t${i}`, `T${i}`)),
        );
        expect(parseRecents(raw)).toHaveLength(MAX_RECENTS);
    });
});

describe("recentKey", () => {
    it("keys tokens and pairs by id, and wallets by lowercased address", () => {
        expect(recentKey(tokenItem("t1", "ETH"))).toBe("token:t1");
        expect(recentKey(pairItem("p1", "ETH", "USDC"))).toBe("pair:p1");
        expect(recentKey(walletItem(ADDRESS))).toBe(`wallet:${ADDRESS.toLowerCase()}`);
    });

    it("gives the same wallet one key regardless of the casing it was typed in", () => {
        expect(recentKey(walletItem(ADDRESS))).toBe(recentKey(walletItem(ADDRESS.toLowerCase())));
    });
});

describe("pushRecent", () => {
    it("puts the newest entry first", () => {
        const list = pushRecent([tokenItem("t1", "ETH")], tokenItem("t2", "BTC"));
        expect(list.map((i) => (i.result as { symbol: string }).symbol)).toEqual(["BTC", "ETH"]);
    });

    // A list that can hold the same market three times is a log, not a shortcut.
    it("moves a re-selected entry to the front instead of duplicating it", () => {
        const start = [tokenItem("t1", "ETH"), tokenItem("t2", "BTC"), tokenItem("t3", "SOL")];
        const list = pushRecent(start, tokenItem("t3", "SOL"));

        expect(list).toHaveLength(3);
        expect(list.map((i) => (i.result as { symbol: string }).symbol)).toEqual([
            "SOL",
            "ETH",
            "BTC",
        ]);
    });

    it("de-duplicates a wallet across casing", () => {
        const list = pushRecent([walletItem(ADDRESS)], walletItem(ADDRESS.toLowerCase()));
        expect(list).toHaveLength(1);
    });

    it("caps the list, dropping the oldest", () => {
        const list = Array.from({ length: MAX_RECENTS + 3 }, (_, i) =>
            tokenItem(`t${i}`, `T${i}`),
        ).reduce<SearchNavItem[]>((acc, item) => pushRecent(acc, item), []);

        expect(list).toHaveLength(MAX_RECENTS);
        // Most recently pushed is first; the earliest ones fell off the end.
        expect((list[0].result as { symbol: string }).symbol).toBe(`T${MAX_RECENTS + 2}`);
    });

    it("refuses to store a malformed item, returning the list unchanged", () => {
        const start = [tokenItem("t1", "ETH")];
        expect(pushRecent(start, { kind: "token", result: {} } as unknown as SearchNavItem)).toBe(
            start,
        );
    });
});
