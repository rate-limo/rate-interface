import { describe, expect, it } from "vitest";
import { meshStops, prettySupply, toHsl } from "./preview";

describe("toHsl", () => {
  it("round-trips the primaries", () => {
    expect(toHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(toHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 });
    expect(toHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("reports greys as unsaturated rather than as an arbitrary hue", () => {
    expect(toHsl("#808080").s).toBe(0);
  });

  // The card renders whatever tokenColor hands back. If that ramp ever gains a
  // shorthand or a named colour, this must degrade to a drawable value instead
  // of taking down a page whose entire job is a preview.
  it("falls back instead of throwing on anything it cannot parse", () => {
    for (const bad of ["", "#abc", "rebeccapurple", "var(--m-primary)", "#gggggg"]) {
      const out = toHsl(bad);
      expect(Number.isFinite(out.h)).toBe(true);
      expect(Number.isFinite(out.s)).toBe(true);
      expect(Number.isFinite(out.l)).toBe(true);
    }
  });
});

describe("meshStops", () => {
  it("is deterministic — the same symbol always draws the same coin", () => {
    expect(meshStops("NOVA")).toEqual(meshStops("NOVA"));
  });

  it("separates symbols, so two unbranded coins do not look identical", () => {
    expect(meshStops("NOVA").ground).not.toBe(meshStops("ZORA").ground);
  });

  it("stays inside the muted saturation band the card is designed for", () => {
    for (const sym of ["", "A", "NOVA", "VF15CK", "USDC", "LONGERSYMBOL"]) {
      for (const stop of Object.values(meshStops(sym))) {
        const sat = Number(/\s(\d+)%\s/.exec(stop)?.[1]);
        expect(sat).toBeGreaterThanOrEqual(18);
        expect(sat).toBeLessThanOrEqual(38);
      }
    }
  });

  it("keeps every stop light enough to be artwork rather than a dark slab", () => {
    // The stops ran 24%-42%, which on a light card read as a black hole low and
    // centre. A floor here is what stops that coming back.
    for (const sym of ["", "A", "NOVA", "VF15CK", "USDC", "LONGERSYMBOL"]) {
      for (const stop of Object.values(meshStops(sym))) {
        const light = Number(/\s(\d+)%\)$/.exec(stop)?.[1]);
        expect(light).toBeGreaterThanOrEqual(55);
        expect(light).toBeLessThanOrEqual(85);
      }
    }
  });

  it("stays in one hue family, so the blur cannot mix to mud", () => {
    // `b` used to sit at +302 — a near-complement. Blurred against the ground
    // it cancelled toward grey and the darkness turned that grey brown.
    for (const sym of ["", "A", "NOVA", "VF15CK"]) {
      const stops = meshStops(sym);
      const base = Number(/^hsl\((\d+)\s/.exec(stops.ground)?.[1]);
      for (const stop of Object.values(stops)) {
        const hue = Number(/^hsl\((\d+)\s/.exec(stop)?.[1]);
        const apart = Math.min(Math.abs(hue - base), 360 - Math.abs(hue - base));
        expect(apart).toBeLessThanOrEqual(90);
      }
    }
  });

  it("emits a hue in range for every symbol, including the negative offset", () => {
    for (const sym of ["", "A", "NOVA", "VF15CK", "ETH"]) {
      for (const stop of Object.values(meshStops(sym))) {
        const hue = Number(/^hsl\((\d+)\s/.exec(stop)?.[1]);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
      }
    }
  });
});

describe("prettySupply", () => {
  it("groups digits and tolerates the commas the field already allows", () => {
    expect(prettySupply("1000000000")).toBe("1,000,000,000");
    expect(prettySupply("1,000,000,000")).toBe("1,000,000,000");
  });

  // Zero supply is a value the contract refuses (`SupplyIsZero`), so it must
  // never be what an unfinished draft looks like.
  it("is an em-dash when nothing has been entered, never a zero", () => {
    expect(prettySupply("")).toBe("—");
    expect(prettySupply("   ")).toBe("—");
    expect(prettySupply("abc")).toBe("—");
  });

  it("still prints a real zero the creator actually typed", () => {
    expect(prettySupply("0")).toBe("0");
  });
});
