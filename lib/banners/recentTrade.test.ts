import { describe, expect, it } from "vitest";
import type { SpotTrade } from "@/types";
import { toTradeEvent } from "./recentTrade";

const token = (symbol: string) =>
    ({
        id: `0x${symbol}`,
        symbol,
        name: `${symbol} Name`,
        ticker: symbol,
        logoURI: `https://example.test/${symbol}.png`,
    }) as SpotTrade["base"];

const trade = (over: Partial<SpotTrade> = {}): SpotTrade =>
    ({
        orderId: 1,
        base: token("SMKB"),
        quote: token("SMKQ"),
        baseSymbol: "SMKB",
        quoteSymbol: "SMKQ",
        pair: "0xpair",
        pairSymbol: "SMKB/SMKQ",
        isBid: true,
        price: 3025,
        account: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        asset: token("SMKB"),
        assetSymbol: "SMKB",
        amount: 1,
        valueUSD: 10,
        baseAmount: 1,
        quoteAmount: 2,
        timestamp: 1,
        taker: "0xtaker",
        maker: "0xmaker",
        txHash: "0xhash",
        ...over,
    }) as SpotTrade;

describe("toTradeEvent", () => {
    it("maps a complete trade into the event the banner renders", () => {
        const event = toTradeEvent(trade());

        expect(event).not.toBeNull();
        expect(event!.base).toBe("SMKB");
        expect(event!.quote).toBe("SMKQ");
        expect(event!.account).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
        expect(event!.isBid).toBe(true);
    });

    it("defaults the optional per-leg fees to zero rather than undefined", () => {
        const event = toTradeEvent(trade());
        expect(event!.baseFee).toBe(0);
        expect(event!.quoteFee).toBe(0);
    });

    it("keeps fees the gateway did send", () => {
        const event = toTradeEvent(trade({ baseFee: 3, quoteFee: 4 }));
        expect(event!.baseFee).toBe(3);
        expect(event!.quoteFee).toBe(4);
    });

    /**
     * The regression this module exists for.
     *
     * `trades[0]` is undefined on a chain with no trades yet, and the effect used
     * to read `.base.symbol` straight off it. That TypeError propagated out of an
     * uncaught promise in a component AppShell renders on every page — so a quiet
     * network replaced the entire app, sidebar included, with "This page couldn't
     * load". A banner must degrade to nothing, never to that.
     */
    it("returns null for a missing trade instead of throwing", () => {
        expect(() => toTradeEvent(undefined)).not.toThrow();
        expect(() => toTradeEvent(null)).not.toThrow();
        expect(toTradeEvent(undefined)).toBeNull();
        expect(toTradeEvent(null)).toBeNull();
    });

    it("returns null for a row missing the fields it would dereference", () => {
        expect(toTradeEvent(trade({ base: undefined as unknown as SpotTrade["base"] }))).toBeNull();
        expect(toTradeEvent(trade({ quote: undefined as unknown as SpotTrade["quote"] }))).toBeNull();
        expect(toTradeEvent(trade({ account: undefined as unknown as string }))).toBeNull();
    });

    it("never throws on a malformed row, whatever is missing", () => {
        expect(() => toTradeEvent({} as SpotTrade)).not.toThrow();
        expect(toTradeEvent({} as SpotTrade)).toBeNull();
    });
});
