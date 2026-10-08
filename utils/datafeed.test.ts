import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What these pin: the chart datafeed's live-bar state is PER DATAFEED, so two
 * charts on two chains cannot reach each other's.
 *
 * Every case here was a real failure with the module-level maps, and every one of
 * them needed two chains carrying the SAME SYMBOL to appear at all — which is why
 * none of it showed up on a single-chain deployment. The keys were
 * `ticker-resolution` and `spotBar:<ticker>-<room>`; the chain appeared in
 * neither.
 *
 * Nothing here reaches into the datafeed's internals. History arrives through
 * `getBars` over a stubbed fetch, exactly as the widget delivers it, because
 * "does the live merge have a bar to merge into" is half of what broke.
 */

/** One fake manager per URL, so a test can assert which gateway was subscribed. */
const managers = new Map<
  string,
  {
    subscribe: ReturnType<typeof vi.fn>;
    /** topic -> the handlers the datafeed registered for it. */
    handlers: Map<string, { onBatch: (b: { d: unknown[][] }) => void; onResync: () => void }>;
    /** topic -> how many times its unsubscribe was called. */
    unsubscribed: Map<string, number>;
  }
>();

function fakeManager(url: string) {
  let m = managers.get(url);
  if (!m) {
    const handlers = new Map<string, any>();
    const unsubscribed = new Map<string, number>();
    m = {
      handlers,
      unsubscribed,
      subscribe: vi.fn((topic: string, _req: unknown, h: any) => {
        handlers.set(topic, h);
        return () => unsubscribed.set(topic, (unsubscribed.get(topic) ?? 0) + 1);
      }),
    };
    managers.set(url, m);
  }
  return m;
}

vi.mock("@/lib/realtime/socket-manager", () => ({
  getSocketManager: (url: string) => fakeManager(url),
}));

import { getDatafeed } from "./datafeed";
import { eventToSpotBarStream, type SpotBarEvent } from "@/types";

const RISE = "wss://rise.example/ws";
const ARC = "wss://arc.example/ws";

/** The last history bar's `t`. `lastBar.time` becomes this × 1000. */
const HISTORY_T = 1_000;

/**
 * A bar frame as the gateway sends it. `id` is `<ticker>-<room>` — note the room
 * suffix, which is what the id parser has to strip without eating a ticker's own
 * dashes.
 */
function barFrame(ticker: string, room: string, price: number, timestamp = 1) {
  return eventToSpotBarStream({
    eventId: "spotBar",
    id: `${ticker}-${room}`,
    price,
    timestamp,
    volume: 1,
    updatedAt: timestamp,
  } as SpotBarEvent);
}

/** Drive a chain's socket for one topic. */
function deliver(url: string, topic: string, frames: unknown[][]) {
  managers.get(url)!.handlers.get(topic)!.onBatch({ d: frames });
}

type Feed = ReturnType<typeof getDatafeed>;

/** One UDF history response, so `getBars` seeds the bar the live merge needs. */
async function loadHistory(feed: Feed, ticker: string, resolution: string) {
  await new Promise<void>((resolve, reject) => {
    feed.getBars(
      { ticker },
      resolution,
      { from: 0, to: 100, firstDataRequest: true },
      () => resolve(),
      (e: unknown) => reject(e),
    );
  });
}

function subscribe(feed: Feed, ticker: string, resolution: string, uid: string) {
  const received: { time: number; close: number }[] = [];
  feed.subscribeBars(
    { ticker },
    resolution as never,
    (bar) => received.push({ time: bar.time, close: bar.close }),
    uid,
    () => {},
  );
  return received;
}

/** History first, then subscribe — the order the widget actually uses. */
async function open(feed: Feed, ticker: string, resolution: string, uid: string) {
  await loadHistory(feed, ticker, resolution);
  return subscribe(feed, ticker, resolution, uid);
}

beforeEach(() => {
  managers.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => ({
        s: "ok",
        t: [HISTORY_T],
        o: [1],
        h: [1],
        l: [1],
        c: [1],
        v: [0],
      }),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("one datafeed per chain", () => {
  it("subscribes on the gateway it was built with, not the one built first", async () => {
    const rise = getDatafeed("https://rise.example", RISE);
    const arc = getDatafeed("https://arc.example", ARC);

    await open(rise, "ETH/USDC", "60", "uid-rise");
    await open(arc, "ETH/USDC", "60", "uid-arc");

    // The bug: the module-level `manager` was whichever chain called
    // `initializeSocket` last, so both charts subscribed to one gateway.
    expect(managers.get(RISE)!.subscribe).toHaveBeenCalledTimes(1);
    expect(managers.get(ARC)!.subscribe).toHaveBeenCalledTimes(1);
  });

  it("subscribes the second chain even though the topic string is identical", async () => {
    const rise = getDatafeed("https://rise.example", RISE);
    await open(rise, "ETH/USDC", "60", "uid-rise");

    const arc = getDatafeed("https://arc.example", ARC);
    await open(arc, "ETH/USDC", "60", "uid-arc");

    /*
     * `unsubscribers.has(topic)` is the guard deciding whether to subscribe at
     * all, and the topic carries no chain — so a leftover RISE entry made the Arc
     * chart skip subscribing entirely. No error and no empty state: a chart that
     * drew history and then never ticked.
     */
    expect(managers.get(ARC)!.handlers.has("spotBar:ETH/USDC-PairHour")).toBe(true);
  });

  it("keeps one chain's bars out of the other chain's callbacks", async () => {
    const rise = getDatafeed("https://rise.example", RISE);
    const arc = getDatafeed("https://arc.example", ARC);

    const riseBars = await open(rise, "ETH/USDC", "60", "uid-rise");
    const arcBars = await open(arc, "ETH/USDC", "60", "uid-arc");

    deliver(ARC, "spotBar:ETH/USDC-PairHour", [barFrame("ETH/USDC", "PairHour", 4242)]);

    expect(arcBars.map((b) => b.close)).toEqual([4242]);
    expect(riseBars).toEqual([]);
  });

  it("does not let one chain's history seed the other chain's live merge", async () => {
    const rise = getDatafeed("https://rise.example", RISE);
    const arc = getDatafeed("https://arc.example", ARC);

    // RISE loads history; Arc deliberately does not.
    await open(rise, "ETH/USDC", "60", "uid-rise");
    const arcBars = subscribe(arc, "ETH/USDC", "60", "uid-arc");

    deliver(ARC, "spotBar:ETH/USDC-PairHour", [barFrame("ETH/USDC", "PairHour", 4242)]);

    // Arc has no bar of its own yet, so the tick is dropped. Previously it
    // inherited RISE's candle and merged an Arc price into it.
    expect(arcBars).toEqual([]);
  });
});

describe("two subscribers on one symbol", () => {
  it("delivers to both, instead of the second silently replacing the first", async () => {
    const feed = getDatafeed("https://rise.example", RISE);

    const first = await open(feed, "ETH/USDC", "60", "uid-1");
    const second = subscribe(feed, "ETH/USDC", "60", "uid-2");

    deliver(RISE, "spotBar:ETH/USDC-PairHour", [barFrame("ETH/USDC", "PairHour", 1234)]);

    expect(first.map((b) => b.close)).toEqual([1234]);
    expect(second.map((b) => b.close)).toEqual([1234]);
  });

  it("unsubscribes the topic only once the last subscriber leaves", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    const topic = "spotBar:ETH/USDC-PairHour";

    await open(feed, "ETH/USDC", "60", "uid-1");
    subscribe(feed, "ETH/USDC", "60", "uid-2");

    feed.unsubscribeBars("uid-1");
    expect(managers.get(RISE)!.unsubscribed.get(topic)).toBeUndefined();

    feed.unsubscribeBars("uid-2");
    expect(managers.get(RISE)!.unsubscribed.get(topic)).toBe(1);
  });
});

describe("a ticker containing a dash", () => {
  /*
   * The id parser was `split("-")[0]` and the topic was rebuilt with
   * `cacheKey.split("-")`, both of which take the FIRST segment. A ticker with a
   * dash was therefore truncated in two different places: its bars were filed
   * under a key nothing looked up, and its unsubscriber could never be found — so
   * the subscription leaked for the life of the tab.
   */
  const TICKER = "MY-COIN/USDC";
  const topic = `spotBar:${TICKER}-PairHour`;

  it("routes its bars to the right subscription", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    const bars = await open(feed, TICKER, "60", "uid-1");

    deliver(RISE, topic, [barFrame(TICKER, "PairHour", 7)]);

    expect(bars.map((b) => b.close)).toEqual([7]);
  });

  it("finds its unsubscriber", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    await open(feed, TICKER, "60", "uid-1");

    feed.unsubscribeBars("uid-1");

    expect(managers.get(RISE)!.unsubscribed.get(topic)).toBe(1);
  });
});

describe("history arriving after the subscription", () => {
  it("seeds the live merge, rather than dropping every tick until a resubscribe", async () => {
    const feed = getDatafeed("https://rise.example", RISE);

    // Subscribe FIRST. The widget does this when a cached symbol is reopened, and
    // `subscribeBars` is then handed nothing.
    const bars = subscribe(feed, "ETH/USDC", "60", "uid-1");
    deliver(RISE, "spotBar:ETH/USDC-PairHour", [barFrame("ETH/USDC", "PairHour", 1)]);
    expect(bars).toEqual([]);

    await loadHistory(feed, "ETH/USDC", "60");
    deliver(RISE, "spotBar:ETH/USDC-PairHour", [barFrame("ETH/USDC", "PairHour", 99)]);

    expect(bars.map((b) => b.close)).toEqual([99]);
  });
});

describe("an address-qualified ticker", () => {
  /*
   * Charts open with `NOVA/USDC@0x…` so /history names one market when two
   * launches share a ticker. The broker still publishes bars under the bare
   * symbol, so the topic and every key the incoming frame is matched against
   * must drop the address — or the chart draws history and never ticks.
   */
  const PAIR = "0xF2640EFf6987a3b55abd7909d20Df4D246DeF104";
  const QUALIFIED = `NOVA/USDC@${PAIR}`;
  const topic = "spotBar:NOVA/USDC-PairHour";

  it("asks /history for the qualified ticker, encoded", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    await loadHistory(feed, QUALIFIED, "60");

    const url = String(vi.mocked(fetch).mock.calls[0]![0]);
    expect(url).toContain(`symbol=${encodeURIComponent(QUALIFIED)}`);
  });

  it("subscribes to the bare symbol's room and receives its bars", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    const bars = await open(feed, QUALIFIED, "60", "uid-1");

    expect([...managers.get(RISE)!.handlers.keys()]).toEqual([topic]);
    deliver(RISE, topic, [barFrame("NOVA/USDC", "PairHour", 5)]);

    expect(bars.map((b) => b.close)).toEqual([5]);
  });

  it("finds its unsubscriber", async () => {
    const feed = getDatafeed("https://rise.example", RISE);
    await open(feed, QUALIFIED, "60", "uid-1");

    feed.unsubscribeBars("uid-1");

    expect(managers.get(RISE)!.unsubscribed.get(topic)).toBe(1);
  });
});
