import { describe, expect, it } from "vitest";
import { findChain } from "@iter/deployments";
import { supportedChains } from "@/consts";
import {
  applyChainOverrides,
  applyServedChains,
  resolveAggregatorChains,
} from "./useVisibleChains";

/**
 * The filtering rule. The fetch is not tested here — the part worth pinning is
 * what happens to the list, and every branch of that is pure.
 */

const RISE = "RISE Testnet";
const riseId = String(findChain(RISE)?.chainId);

describe("applyChainOverrides", () => {
  it("returns the build's list untouched when there are no overrides", () => {
    // The degraded path: admin-service down, malformed body, nothing configured.
    // The app must render exactly what it shipped with.
    expect(applyChainOverrides(supportedChains, {})).toEqual([...supportedChains]);
  });

  it("removes a chain an operator switched off", () => {
    const result = applyChainOverrides(supportedChains, { [riseId]: false });
    expect(result).not.toContain(RISE);
    expect(result.length).toBe(supportedChains.length - 1);
  });

  it("keeps a chain explicitly switched on", () => {
    expect(applyChainOverrides(supportedChains, { [riseId]: true })).toContain(RISE);
  });

  it("can never ADD a chain the build does not carry", () => {
    // The whole safety property: the override map only ever filters. A flag for
    // a chain with no gateway link cannot put it in the switcher.
    const result = applyChainOverrides(supportedChains, { "999999": true });
    expect(result).toEqual([...supportedChains]);
  });

  it("leaves a name the registry cannot resolve alone rather than dropping it", () => {
    // It shipped in supportedChains; removing it here would hide a chain for a
    // reason no operator chose.
    expect(applyChainOverrides(["Not A Real Chain"], { [riseId]: false })).toEqual([
      "Not A Real Chain",
    ]);
  });

  it("ignores a non-boolean override rather than coercing it", () => {
    const result = applyChainOverrides(supportedChains, {
      [riseId]: undefined as unknown as boolean,
    });
    expect(result).toContain(RISE);
  });
});

/**
 * The aggregator layer. Same shape of rule as the overrides — it may only take
 * chains away — with one extra escape hatch: an answer that overlaps with
 * nothing is a misconfiguration, not a platform serving no chains.
 */
describe("applyServedChains", () => {
  it("leaves the list alone when the aggregator could not be asked", () => {
    expect(applyServedChains(supportedChains, null)).toEqual([...supportedChains]);
    expect(applyServedChains(supportedChains, undefined)).toEqual([...supportedChains]);
    expect(applyServedChains(supportedChains, [])).toEqual([...supportedChains]);
  });

  it("drops a shipped chain the aggregator does not fan out to", () => {
    const result = applyServedChains(supportedChains, [RISE]);
    expect(result).toEqual([RISE]);
  });

  it("can never ADD a chain the build does not carry", () => {
    // The safety property: gateway and websocket URLs are compiled in, so a
    // name over the wire must not become a switcher entry.
    const result = applyServedChains(supportedChains, [...supportedChains, "Ghost Chain"]);
    expect(result).toEqual([...supportedChains]);
    expect(result).not.toContain("Ghost Chain");
  });

  it("matches forgivingly on case and space", () => {
    // The names are hand-typed into a Railway variable; a stray capital must not
    // hide a chain.
    expect(applyServedChains([RISE], [` ${RISE.toUpperCase()} `])).toEqual([RISE]);
  });

  it("keeps the build's order rather than the aggregator's", () => {
    const reversed = [...supportedChains].reverse();
    expect(applyServedChains(supportedChains, reversed)).toEqual([...supportedChains]);
  });

  it("falls back to the shipped list when nothing overlaps", () => {
    // Total mismatch means one side is misconfigured. An empty switcher would
    // report that as "there are no chains", which is the one thing it is not.
    expect(applyServedChains(supportedChains, ["Ghost Chain"])).toEqual([...supportedChains]);
  });
});

describe("resolveAggregatorChains", () => {
  const VISIBLE = ["Arc Testnet"];
  const ALL = ["Arc Testnet", "RISE Testnet"];

  it("falls back to the VISIBLE chains, not every served one", () => {
    // The bug: hiding RISE removed it from the switcher and left its tokens
    // ranking in Popular, because the fan-out defaulted to everything served.
    expect(resolveAggregatorChains(undefined, VISIBLE)).toEqual(["Arc Testnet"]);
    expect(resolveAggregatorChains(undefined, VISIBLE)).not.toContain("RISE Testnet");
  });

  it("an explicit choice wins — the scope control asked for one chain", () => {
    expect(resolveAggregatorChains(["RISE Testnet"], VISIBLE)).toEqual(["RISE Testnet"]);
  });

  it("an EMPTY explicit array means 'you decide', not 'no chains'", () => {
    // Honouring it literally would request zero chains and render an empty page.
    expect(resolveAggregatorChains([], VISIBLE)).toEqual(VISIBLE);
  });

  it("passes the full list through when nothing is hidden", () => {
    expect(resolveAggregatorChains(undefined, ALL)).toEqual(ALL);
  });
});
