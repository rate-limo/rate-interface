import { describe, expect, it } from "vitest";
import { candleColors, resolveCandleColors } from "./candleColors";

const sheet = (tokens: Record<string, string>) => (t: string) => tokens[t];

describe("resolveCandleColors", () => {
  it("takes the tokens when the stylesheet has them", () => {
    const read = sheet({ "--m-candle-bull-fill": "#006B3C", "--m-candle-bear-fill": "#0047AB" });
    expect(resolveCandleColors(read, false)).toEqual({ up: "#006b3c", down: "#0047ab" });
  });

  it("falls back to the literals that shipped before, per theme", () => {
    // A price chart must never lose its candles. The fallback is the exact
    // appearance that shipped before the tokens were wired, so a missing token
    // is a cosmetic regression rather than an unreadable chart.
    expect(resolveCandleColors(sheet({}), true)).toEqual({ up: "#52C48A", down: "#E36A75" });
    expect(resolveCandleColors(sheet({}), false)).toEqual({ up: "#178A5B", down: "#C84452" });
  });

  it("falls back per COLOUR, not all-or-nothing", () => {
    // Half a themed chart beats none: a token retuned to a form this cannot
    // read must not drag the other one down with it.
    const read = sheet({ "--m-candle-bull-fill": "#006B3C", "--m-candle-bear-fill": "oklch(.6 .2 260)" });
    expect(resolveCandleColors(read, false)).toEqual({ up: "#006b3c", down: "#C84452" });
  });

  it("uses the same two hues as the generated graphics", () => {
    // The point of the change: dollar green rising, cobalt falling, matching
    // --m-graphic-bid / --m-graphic-ask so the app has ONE up/down language.
    const light = resolveCandleColors(
      sheet({ "--m-candle-bull-fill": "#006B3C", "--m-candle-bear-fill": "#0047AB" }), false);
    expect(light.up.toLowerCase()).toBe("#006b3c");
    expect(light.down.toLowerCase()).toBe("#0047ab");
  });

  it("returns a theme's fallback without a document, for server rendering", () => {
    expect(candleColors(true)).toEqual({ up: "#52C48A", down: "#E36A75" });
  });
});
