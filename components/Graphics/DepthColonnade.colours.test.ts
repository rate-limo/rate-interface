import { describe, expect, it } from "vitest";
import { firstColour } from "./DepthColonnade";
import { parseHex, type Rgb } from "@/lib/graphics/dither";

/** A stylesheet stand-in: only the listed tokens resolve. */
const sheet = (tokens: Record<string, string>) =>
  (token: string): Rgb | null => parseHex(tokens[token] ?? "");

describe("firstColour", () => {
  it("prefers the bespoke graphic token when it is there", () => {
    const read = sheet({ "--m-graphic-bid": "#006B3C", "--m-chart-buy": "#5E8764" });
    expect(firstColour(read, "--m-graphic-bid", "--m-chart-buy")).toEqual([0x00, 0x6b, 0x3c]);
  });

  it("falls back to the Monet token rather than erasing the graphic", () => {
    // This is the failure that actually happened: --m-graphic-* are referenced
    // only from JS, so a stale CSS build dropped them silently and the strict
    // guard blanked the whole colonnade in both themes.
    const read = sheet({ "--m-chart-buy": "#5E8764" });
    expect(firstColour(read, "--m-graphic-bid", "--m-chart-buy")).toEqual([0x5e, 0x87, 0x64]);
  });

  it("skips a token that resolves to something other than a hex literal", () => {
    // A token retuned to oklch() or color-mix() is unreadable here, and must
    // not be treated as present.
    const read = sheet({ "--m-graphic-bid": "oklch(.7 .1 240)", "--m-chart-buy": "#5E8764" });
    expect(firstColour(read, "--m-graphic-bid", "--m-chart-buy")).toEqual([0x5e, 0x87, 0x64]);
  });

  it("returns null only when nothing in the chain resolves", () => {
    // Then the theme itself did not load, and drawing nothing is correct —
    // a hardcoded literal would ship a wrong colour unnoticed.
    expect(firstColour(sheet({}), "--m-graphic-bid", "--m-chart-buy")).toBeNull();
  });
});
