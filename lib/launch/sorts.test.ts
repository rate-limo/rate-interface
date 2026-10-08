import { describe, expect, it } from "vitest";
import {
  applyClientSort,
  DEFAULT_LAUNCH_SORT,
  hoistReorders,
  LAUNCH_SORTS,
  launchSort,
} from "./sorts";

/** The rankings apps/gateway/src/api/tokens.ts actually registers. */
const SERVED_RANKINGS = new Set([
  "",
  "new",
  "top-gainer",
  "top-loser",
  "top-volume",
  "top-marketcap",
  "last-trade",
  "trade-count",
  "price",
  "oldest",
  "trending",
]);

describe("the launch sort catalogue", () => {
  it("offers nothing the gateway cannot rank", () => {
    // The failure this list exists to prevent: a dropdown row that selects, ticks
    // and reorders nothing, because the route behind it was never built. Every
    // entry names a ranking the gateway registers.
    for (const option of LAUNCH_SORTS) {
      expect(SERVED_RANKINGS.has(option.ranking), `${option.key} -> ${option.ranking}`).toBe(true);
    }
  });

  it("does NOT offer Holders", () => {
    // Nothing in the monorepo indexes ERC-20 Transfer, so holder count is a
    // missing indexer, not a missing endpoint. It appears the day that lands.
    expect(LAUNCH_SORTS.some((s) => /holder/i.test(s.label))).toBe(false);
  });

  it("sorts only Progress in the browser, and over a market-cap page", () => {
    // A browser sort orders the rows it happened to GET, and which rows it got
    // was chosen by the ranking — so client-side is wrong unless the ranking
    // already agrees with the order. Progress is cap ÷ a constant, so it does.
    const client = LAUNCH_SORTS.filter((s) => s.client);
    expect(client.map((s) => s.key)).toEqual(["progress"]);
    expect(client[0]!.ranking).toBe("top-marketcap");
  });

  it("falls back to a real option for an unknown key", () => {
    // A stale URL or a renamed key must not render a blank control.
    expect(launchSort("holders").key).toBe(LAUNCH_SORTS[0]!.key);
    expect(launchSort(DEFAULT_LAUNCH_SORT).key).toBe(DEFAULT_LAUNCH_SORT);
  });
});

describe("hoistReorders", () => {
  it("lets a trade move the card ONLY under Last trade", () => {
    // Under that sort the hoist IS the ranking, kept true between fetches.
    expect(hoistReorders("last-trade")).toBe(true);
  });

  it("never moves the card under any other sort", () => {
    // Otherwise the grid is a second ordering fighting the reader's choice:
    // pick Market cap and the page is not sorted by market cap.
    for (const option of LAUNCH_SORTS) {
      if (option.key === "last-trade") continue;
      expect(hoistReorders(option.key), option.key).toBe(false);
    }
  });
});

describe("applyClientSort", () => {
  const rows = [
    { id: "a", marketCap: 500_000 },
    { id: "b", marketCap: 2_000_000 },
    { id: "c", marketCap: null },
    { id: "d", marketCap: 1_000_000 },
  ];

  it("leaves a server-ranked page in the order it arrived", () => {
    // The gateway already ordered these. Re-sorting them here would reorder one
    // page of a ranking by a different rule and call it the ranking.
    expect(applyClientSort(rows, "marketcap").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("orders Progress by market cap, descending", () => {
    expect(applyClientSort(rows, "progress").map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("puts an unknown market cap LAST, not at zero", () => {
    // Same rule as every NULLS LAST on the gateway: no cap means unknown, not
    // worthless, and it must not lead or be mistaken for the bottom of a real
    // range.
    const ordered = applyClientSort(rows, "progress");
    expect(ordered[ordered.length - 1]!.id).toBe("c");
  });

  it("does not mutate its input", () => {
    const before = [...rows];
    applyClientSort(rows, "progress");
    expect(rows).toEqual(before);
  });
});
