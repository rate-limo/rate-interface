import { describe, expect, it } from "vitest";
import { createSoundGate } from "./gate";

function clock() {
  let t = 1_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createSoundGate", () => {
  it("plays one sound per key: a 20-fill sweep is one fill", () => {
    const c = clock();
    const gate = createSoundGate({ now: c.now });
    const played = Array.from({ length: 20 }, () => {
      c.advance(100);
      return gate.allow({ cue: "fill", key: "fill:0xabc" });
    }).filter(Boolean);
    expect(played).toHaveLength(1);
  });

  it("lets the same key sound again once its TTL has passed", () => {
    const c = clock();
    const gate = createSoundGate({ now: c.now, keyTtlMs: 1_000 });
    expect(gate.allow({ cue: "fill", key: "k" })).toBe(true);
    c.advance(1_001);
    expect(gate.allow({ cue: "fill", key: "k" })).toBe(true);
  });

  it("spaces repeats of one cue, but not different cues", () => {
    const c = clock();
    const gate = createSoundGate({ now: c.now });
    expect(gate.allow({ cue: "sliderTick" })).toBe(true);
    c.advance(10);
    expect(gate.allow({ cue: "sliderTick" })).toBe(false);
    expect(gate.allow({ cue: "tap" })).toBe(true);
    c.advance(40);
    expect(gate.allow({ cue: "sliderTick" })).toBe(true);
  });

  it("a rejected play does not burn its key", () => {
    const c = clock();
    const gate = createSoundGate({ now: c.now });
    expect(gate.allow({ cue: "success" })).toBe(true);
    c.advance(10);
    expect(gate.allow({ cue: "success", key: "tx" })).toBe(false);
    c.advance(100);
    expect(gate.allow({ cue: "success", key: "tx" })).toBe(true);
  });

  it("a hidden tab hears outcomes of your transactions, never presses", () => {
    const gate = createSoundGate({ now: clock().now });
    expect(gate.allow({ cue: "tap", hidden: true })).toBe(false);
    expect(gate.allow({ cue: "open", hidden: true })).toBe(false);
    expect(gate.allow({ cue: "rateHit", hidden: true })).toBe(true);
    expect(gate.allow({ cue: "fill", hidden: true })).toBe(true);
  });
});
