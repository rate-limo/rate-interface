import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WATERMARK_HEADER,
  chainKeyForUrl,
  gatewayFetch,
  isOlderThan,
  minWatermark,
  noteFrameWatermark,
  parseWatermark,
  resetWatermarks,
  seenWatermark,
  watermarkCounters,
} from "./watermark";
import { parseWatermarkReport } from "./watermarkReport";

const ARC_API = "https://gateway-api-arc.up.railway.app/api/pairs/20/1";

function reply(header: string | null) {
  return new Response("{}", { status: 200, headers: header ? { [WATERMARK_HEADER]: header } : {} });
}

describe("watermark parsing and comparison", () => {
  it("parses writer=seq pairs and refuses malformed ones", () => {
    expect(parseWatermark("shard-0=812,shard-1=40")).toEqual({ "shard-0": 812, "shard-1": 40 });
    expect(parseWatermark(null)).toBeNull();
    expect(parseWatermark("shard-0=abc")).toBeNull();
  });

  it("an answer is older when ANY writer is behind; a missing writer counts as 0", () => {
    expect(isOlderThan({ "shard-0": 5, "shard-1": 9 }, { "shard-0": 5 })).toBe(false);
    expect(isOlderThan({ "shard-0": 4, "shard-1": 9 }, { "shard-0": 5 })).toBe(true);
    expect(isOlderThan({ "shard-0": 9 }, { cron: 1 })).toBe(true);
  });

  it("a merged answer takes the per-writer minimum, and is unknown if either side is", () => {
    expect(minWatermark({ a: 3, b: 7 }, { a: 5 })).toEqual({ a: 3, b: 0 });
    expect(minWatermark({ a: 3 }, null)).toBeNull();
  });
});

describe("which chain a URL belongs to", () => {
  it("maps the REST and websocket gateways, and the same-origin proxy", () => {
    expect(chainKeyForUrl(ARC_API)).toBe("Arc Testnet");
    expect(chainKeyForUrl("wss://gateway-ws-rise.up.railway.app/ws")).toBe("RISE Testnet");
    expect(chainKeyForUrl("/api/gateway/pairs/20/1?network=Arc%20Testnet")).toBe("Arc Testnet");
  });

  it("anything else is not a gateway", () => {
    expect(chainKeyForUrl("/profile/save")).toBeNull();
    expect(chainKeyForUrl("https://example.com/api")).toBeNull();
    expect(chainKeyForUrl("/api/gateway/pairs?network=Nope")).toBeNull();
  });
});

describe("gatewayFetch", () => {
  beforeEach(() => {
    resetWatermarks();
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window = {};
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as { window?: unknown }).window;
  });

  it("frames only ever raise the stored watermark", () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    noteFrameWatermark("Arc Testnet", { "shard-0": 5, cron: 2 });
    expect(seenWatermark("Arc Testnet")).toEqual({ "shard-0": 7, cron: 2 });
  });

  it("accepts an answer at or past what the tab has seen", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    const fetchMock = vi.fn().mockResolvedValue(reply("shard-0=7"));
    vi.stubGlobal("fetch", fetchMock);
    await gatewayFetch(ARC_API);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-asks when an answer predates a frame already shown", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    const fetchMock = vi.fn().mockResolvedValueOnce(reply("shard-0=6")).mockResolvedValueOnce(reply("shard-0=7"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = gatewayFetch(ARC_API);
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a missing header is unknown, never stale", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    const fetchMock = vi.fn().mockResolvedValue(reply(null));
    vi.stubGlobal("fetch", fetchMock);
    await gatewayFetch(ARC_API);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up with an error after its retries, so the caller keeps its newer data", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("shard-0=1")));
    const pending = gatewayFetch(ARC_API);
    const outcome = pending.then(() => "resolved", (e: Error) => e.name);
    await vi.runAllTimersAsync();
    expect(await outcome).toBe("StaleResponseError");
    expect(watermarkCounters()).toEqual({ "Arc Testnet": { retried: 3, refused: 1, healed: 0 } });
  });

  it("heals when the chain stays behind past the window (counters were reset)", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 900 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("shard-0=3")));
    const first = gatewayFetch(ARC_API).catch(() => "stale");
    await vi.runAllTimersAsync();
    expect(await first).toBe("stale");
    vi.advanceTimersByTime(11_000);
    const second = gatewayFetch(ARC_API);
    await vi.runAllTimersAsync();
    await expect(second).resolves.toBeInstanceOf(Response);
    expect(seenWatermark("Arc Testnet")).toEqual({ "shard-0": 3 });
    expect(watermarkCounters()["Arc Testnet"]).toMatchObject({ refused: 1, healed: 1 });
  });

  it("an answer accepted first time counts nothing", async () => {
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("shard-0=9")));
    await gatewayFetch(ARC_API);
    expect(watermarkCounters()).toEqual({});
  });

  it("on the server it is plain fetch", async () => {
    delete (globalThis as { window?: unknown }).window;
    noteFrameWatermark("Arc Testnet", { "shard-0": 7 });
    const fetchMock = vi.fn().mockResolvedValue(reply("shard-0=1"));
    vi.stubGlobal("fetch", fetchMock);
    await gatewayFetch(ARC_API);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the watermark report endpoint's parser", () => {
  it("keeps small non-negative counts under sane chain keys and drops the rest", () => {
    expect(
      parseWatermarkReport({
        counts: {
          "Arc Testnet": { retried: 4, refused: 1, healed: 0, extra: 9 },
          "RISE Testnet": { retried: -1, refused: 1.5, healed: "2" },
          "<script>": { refused: 1 },
        },
      }),
    ).toEqual({ "Arc Testnet": { retried: 4, refused: 1, healed: 0 } });
    expect(parseWatermarkReport(null)).toEqual({});
    expect(parseWatermarkReport({ counts: [1, 2] })).toEqual({});
  });
});
