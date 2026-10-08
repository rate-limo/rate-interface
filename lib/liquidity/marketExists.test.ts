import { describe, expect, it } from "vitest";
import { canLaunch, marketState } from "./marketExists";

const PAIR = "0xFCAeaAB51b8BE6855F469FBCAC83456EAA800f81";
const POOL = "0x06B23ACa80634A0225B8cc263168A899d7712809";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("marketState", () => {
  /*
   * The bug this exists for: the screen answered before it had looked. A read in
   * flight is a real state, not an excuse to guess "no pool".
   */
  it("is checking until both reads come back", () => {
    expect(marketState(undefined, undefined)).toEqual({ kind: "checking" });
    expect(marketState(PAIR, undefined)).toEqual({ kind: "checking" });
    expect(marketState(undefined, ZERO)).toEqual({ kind: "checking" });
  });

  it("is a real launch when neither exists", () => {
    expect(marketState(ZERO, ZERO)).toEqual({ kind: "none" });
  });

  it("is exists when both are live, and carries both addresses", () => {
    expect(marketState(PAIR, POOL)).toEqual({ kind: "exists", pair: PAIR, pool: POOL });
  });

  /*
   * RISE's ETH/USDC. A wrapped-native leg lists WITHOUT a pool and can never gain
   * one, so this is not a retryable state and must not read as one.
   */
  it("is bookOnly when the pair trades but has no pool", () => {
    expect(marketState(PAIR, ZERO)).toEqual({ kind: "bookOnly", pair: PAIR });
  });

  it("treats a bare 0x and the zero address alike", () => {
    expect(marketState("0x", "0x")).toEqual({ kind: "none" });
    expect(marketState(PAIR, "0x")).toEqual({ kind: "bookOnly", pair: PAIR });
  });

  it("is case-insensitive about the zero address", () => {
    expect(marketState(ZERO.toUpperCase().replace("0X", "0x"), ZERO)).toEqual({ kind: "none" });
  });

  /* A null read is an ANSWER (nothing there), not a pending one. */
  it("treats null as answered-empty rather than in flight", () => {
    expect(marketState(null, null)).toEqual({ kind: "none" });
  });
});

describe("canLaunch", () => {
  it("permits only the state where nothing exists", () => {
    expect(canLaunch({ kind: "none" })).toBe(true);
    expect(canLaunch({ kind: "checking" })).toBe(false);
    expect(canLaunch({ kind: "exists", pair: PAIR, pool: POOL })).toBe(false);
    expect(canLaunch({ kind: "bookOnly", pair: PAIR })).toBe(false);
  });
});
