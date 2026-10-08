import { describe, expect, it } from "vitest";
import { supportedChains } from "@/consts";
import { getMarketTapeData } from "./tape";

/*
 * The running text at the top of every page listed chains the operator had
 * hidden.
 *
 * `useVisibleChains` has filtered the token picker, the deposit panel and the
 * withdraw panel since the overrides shipped, but the rule lived inside a
 * `"use client"` module and the tape renders server-side in the root layout —
 * so it had no way to ask, and went on scrolling a hidden chain's markets past
 * while counting them in the "N markets · N chains" label beside them.
 *
 * Both halves are pinned here: the rows, and the counts, which are separate
 * loops and could drift apart.
 */
describe("getMarketTapeData", () => {
  const all = getMarketTapeData();

  it("serves every supported chain when nobody has said otherwise", () => {
    // Undefined is "no answer available" — an unreachable identity-service
    // must cost a filter, not the row.
    expect(all.pairs.length).toBeGreaterThan(0);
    for (const p of all.pairs) expect(supportedChains).toContain(p.network);
  });

  it("drops a hidden chain's markets from the tape", () => {
    const [first] = all.byChain;
    if (!first) return;
    const kept = supportedChains.filter((c) => c !== first.network);
    const filtered = getMarketTapeData(kept);
    expect(filtered.pairs.some((p) => p.network === first.network)).toBe(false);
  });

  it("drops it from the counts too, not just the rows", () => {
    const [first] = all.byChain;
    if (!first) return;
    const kept = supportedChains.filter((c) => c !== first.network);
    const filtered = getMarketTapeData(kept);
    expect(filtered.counts.chains).toBe(all.counts.chains - 1);
    expect(filtered.counts.markets).toBe(all.counts.markets - first.markets);
    expect(filtered.byChain.some((c) => c.network === first.network)).toBe(false);
  });

  it("hides that chain's tokens from the token count", () => {
    // A separate loop from the pair one, so it can drift independently.
    const [first] = all.byChain;
    if (!first) return;
    const kept = supportedChains.filter((c) => c !== first.network);
    expect(getMarketTapeData(kept).counts.tokens).toBeLessThan(all.counts.tokens);
  });

  it("renders an empty tape when every chain is hidden, rather than ignoring the list", () => {
    // `resolveTradingRow` returns null on an empty pair list, so the row
    // disappears — which is what an operator hiding everything asked for.
    const none = getMarketTapeData([]);
    expect(none.pairs).toHaveLength(0);
    expect(none.counts.chains).toBe(0);
    expect(none.counts.markets).toBe(0);
  });

  it("carries each token's artwork so the row can draw the pair", () => {
    const withArt = all.pairs.find((p) => p.baseLogoURI);
    expect(withArt).toBeTruthy();
  });
});
