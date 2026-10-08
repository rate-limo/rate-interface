import { describe, expect, it } from "vitest";
import { hoistRecentlyTraded, noteTrade, TRADED_CAP, TRADED_WINDOW_MS } from "./traded";

const token = (id: string) => ({ id });
const NOW = 1_800_000_000_000;

describe("hoistRecentlyTraded", () => {
  const list = [token("0xA"), token("0xB"), token("0xC"), token("0xD")];

  it("leaves the ranking alone when nothing has traded", () => {
    const { ordered, lifted } = hoistRecentlyTraded(list, new Map(), NOW);
    expect(ordered.map((t) => t.id)).toEqual(["0xA", "0xB", "0xC", "0xD"]);
    expect(lifted.size).toBe(0);
  });

  it("lifts a traded coin to the front and keeps the rest in order", () => {
    const { ordered, lifted } = hoistRecentlyTraded(list, new Map([["0xc", NOW - 1_000]]), NOW);
    expect(ordered.map((t) => t.id)).toEqual(["0xC", "0xA", "0xB", "0xD"]);
    expect([...lifted]).toEqual(["0xC"]);
  });

  /* Newest first among themselves — the reader's question is "what just moved". */
  it("orders several lifted coins by how recently they traded", () => {
    const { ordered } = hoistRecentlyTraded(
      list,
      new Map([["0xb", NOW - 9_000], ["0xd", NOW - 1_000]]),
      NOW,
    );
    expect(ordered.map((t) => t.id)).toEqual(["0xD", "0xB", "0xA", "0xC"]);
  });

  /* Matching is case-insensitive: ids come from the gateway checksummed and
     from the socket lower-cased, and a hoist that silently never fires is the
     hardest kind of bug to see. */
  it("matches a checksummed id against a lower-cased trade", () => {
    const mixed = [token("0xAbCd"), token("0xZZ")];
    const { lifted } = hoistRecentlyTraded(mixed, new Map([["0xabcd", NOW]]), NOW);
    expect([...lifted]).toEqual(["0xAbCd"]);
  });

  it("gives a coin back to the ranking once its trade ages out", () => {
    const stale = new Map([["0xc", NOW - TRADED_WINDOW_MS - 1]]);
    expect(hoistRecentlyTraded(list, stale, NOW).ordered.map((t) => t.id)).toEqual([
      "0xA", "0xB", "0xC", "0xD",
    ]);
  });

  /* A busy minute must not reorder the whole grid and leave the ranking inert. */
  it("lifts at most the cap, keeping the most recent", () => {
    const many = Array.from({ length: 12 }, (_, i) => token(`0x${i}`));
    const traded = new Map(many.map((t, i) => [t.id.toLowerCase(), NOW - i * 10]));
    const { lifted, ordered } = hoistRecentlyTraded(many, traded, NOW);
    expect(lifted.size).toBe(TRADED_CAP);
    expect(ordered[0]!.id).toBe("0x0");
  });

  it("ignores a trade in a coin this view is not showing", () => {
    const { ordered, lifted } = hoistRecentlyTraded(list, new Map([["0xzz", NOW]]), NOW);
    expect(ordered.map((t) => t.id)).toEqual(["0xA", "0xB", "0xC", "0xD"]);
    expect(lifted.size).toBe(0);
  });
});

describe("hoistRecentlyTraded under an explicit sort", () => {
  const list = [
    { id: "0xA" },
    { id: "0xB" },
    { id: "0xC" },
    { id: "0xD" },
  ];

  it("MARKS a recent trade without moving the card when reorder is off", () => {
    // The reader asked for market cap. Promoting whatever traded answers a
    // different question — but the trade is still worth telling them about,
    // which is what the chip is for.
    const { ordered, lifted } = hoistRecentlyTraded(
      list,
      new Map([["0xc", NOW]]),
      NOW,
      { reorder: false },
    );

    expect(ordered.map((t) => t.id)).toEqual(["0xA", "0xB", "0xC", "0xD"]);
    expect([...lifted]).toEqual(["0xC"]);
  });

  it("still moves the card by default, which is the Last trade sort", () => {
    const { ordered, lifted } = hoistRecentlyTraded(list, new Map([["0xc", NOW]]), NOW);

    expect(ordered.map((t) => t.id)).toEqual(["0xC", "0xA", "0xB", "0xD"]);
    expect([...lifted]).toEqual(["0xC"]);
  });

  it("expires a mark on the same window whether or not it reorders", () => {
    // A chip that never cleared would end up on every card and say nothing.
    const stale = new Map([["0xc", NOW - TRADED_WINDOW_MS - 1]]);
    const { lifted } = hoistRecentlyTraded(list, stale, NOW, { reorder: false });

    expect(lifted.size).toBe(0);
  });
});

describe("noteTrade", () => {
  it("returns the SAME map when a frame names nothing", () => {
    const before = new Map([["0xa", NOW]]);
    expect(noteTrade(before, [], NOW)).toBe(before);
  });

  it("records both legs of the trade", () => {
    const next = noteTrade(new Map(), ["0xBase", "0xQuote"], NOW);
    expect([...next.keys()].sort()).toEqual(["0xbase", "0xquote"]);
  });

  it("drops entries past the window as it writes, so no timer is needed", () => {
    const before = new Map([["0xold", NOW - TRADED_WINDOW_MS - 1], ["0xnew", NOW - 10]]);
    const next = noteTrade(before, ["0xa"], NOW);
    expect(next.has("0xold")).toBe(false);
    expect(next.has("0xnew")).toBe(true);
    expect(next.has("0xa")).toBe(true);
  });
});
