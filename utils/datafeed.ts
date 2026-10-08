import { streamToEvent } from "@/types/streams";
import { stripChartAddress } from "@iter/types";
import { SpotBarEvent } from "@/types";
import { eventBus } from "./events";
// Bars stream over the app-wide shared websocket (lib/realtime/socket-manager):
// no dedicated chart socket, no per-message console noise.
import { getSocketManager, type SocketManager } from "@/lib/realtime/socket-manager";

const createRoomString = (prefix: string) => ({
  1: `${prefix}Min`,
  2: `${prefix}Min`,
  5: `${prefix}Min`,
  15: `${prefix}Min`,
  30: `${prefix}Min`,
  60: `${prefix}Hour`,
  120: `${prefix}Hour`,
  240: `${prefix}Hour`,
  360: `${prefix}Hour`,
  720: `${prefix}Hour`,
  D: `${prefix}Day`,
  "1D": `${prefix}Day`,
  W: `${prefix}Week`,
  "1W": `${prefix}Week`,
  M: `${prefix}Month`,
  "1M": `${prefix}Month`,
});

export const pairRoomString = createRoomString("Pair");
export const tokenRoomString = createRoomString("Token");

export const getRelatedResolutions = (
  roomStringObj: { [s: string]: unknown } | ArrayLike<unknown>
) => {
  const resolutionMap = new Map();
  for (const [key, value] of Object.entries(roomStringObj)) {
    if (!resolutionMap.has(value)) {
      resolutionMap.set(value, []);
    }
    resolutionMap.get(value).push(key);
  }
  return resolutionMap;
};

export const pairRelatedResolutions = getRelatedResolutions(pairRoomString);
export const tokenRelatedResolutions = getRelatedResolutions(tokenRoomString);

const interval = {
  1: 60,
  2: 120,
  5: 300,
  15: 900,
  30: 1800,
  60: 3600,
  120: 7200,
  240: 14400,
  360: 21600,
  720: 43200,
  D: 86400,
  "1D": 86400,
  W: 604800,
  "1W": 604800,
  M: 2592000,
  "1M": 2592000,
};

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StreamHandler {
  id: string;
  callback: (bar: Bar) => void;
}

interface SubscriptionItem {
  resolution: keyof typeof interval;
  /** The websocket topic this subscription reads. Stored, never re-derived — see below. */
  topic: string;
  /** Undefined until `getBars` has answered; the live merge needs a bar to merge INTO. */
  lastBar: Bar | undefined;
  handlers: StreamHandler[];
}

/**
 * One chart's live-bar state. Created per `getDatafeed` call, which is per chain.
 *
 * ## Why this is not module-level any more
 *
 * These were four module singletons keyed by `ticker-resolution` and
 * `spotBar:<ticker>-<room>`. No chain appears in either key, and the same symbol
 * legitimately exists on more than one chain, so on a chain switch all four
 * collided:
 *
 *  - the last-bar cache handed the chart the OTHER chain's closing bar to merge
 *    live prices into, and nothing ever deleted an entry — one per symbol ×
 *    resolution ever opened, for the lifetime of the tab;
 *  - `unsubscribers.has(topic)` is the guard deciding whether to subscribe at
 *    all, so a leftover entry from the previous chain made `subscribeOnStream`
 *    skip subscribing entirely. The chart silently never streamed, and the old
 *    chain's topic stayed subscribed, holding its socket open past its last
 *    reader;
 *  - `subscriptions.set(...)` replaced the whole entry, discarding an existing
 *    `handlers` array — so a second subscriber for the same symbol and
 *    resolution orphaned the first, whose unsubscriber could then never be found
 *    again and was never called.
 *
 * Scoping the state to the datafeed fixes all three at once, and fixes them by
 * construction rather than by everyone remembering to put the chain in a key:
 * two charts on two chains hold two of these and neither can see the other's.
 *
 * It also bounds the growth. The maps live exactly as long as the datafeed the
 * widget was built with, so a chain switch — which rebuilds the widget — drops
 * the whole set instead of adding to it.
 */
interface DatafeedStreams {
  manager: SocketManager;
  /** Last bar per `ticker-resolution`, seeded from history for the live merge. */
  lastBars: Map<string, Bar>;
  /** Live subscriptions per `ticker-resolution`. */
  subscriptions: Map<string, SubscriptionItem>;
  /** One unsubscribe per websocket topic, refcounted through `subscriptions`. */
  unsubscribers: Map<string, () => void>;
}

/**
 * Split a bar event's `<ticker>-<room>` id on the LAST dash.
 *
 * Not `split("-")[0]`, which is what this was: that takes the FIRST segment, so
 * any ticker containing a dash was truncated and its bars were filed under a key
 * nothing would ever look up — a chart that draws history and then never ticks.
 * The room suffix comes from `createRoomString` above and is always one word
 * (`PairMin`, `TokenMonth`, …), so the last dash is unambiguously the separator.
 */
function splitBarId(id: string): { ticker: string; room: string } {
  const cut = id.lastIndexOf("-");
  if (cut < 0) return { ticker: id, room: "" };
  return { ticker: id.slice(0, cut), room: id.slice(cut + 1) };
}

/**
 * Keyed by the STREAM ticker, not the chart ticker. The chart opens with an
 * address-qualified ticker (`NOVA/USDC@0x…`) so /history names one market, but
 * the broker publishes bars as `spotBar:NOVA/USDC-<room>` and incoming frames
 * are filed under that bare name — so every map here has to use it too, or a
 * subscription and the bars meant for it never meet.
 */
function cacheKeyFor(ticker: string, resolution: string | number): string {
  return `${stripChartAddress(ticker)}-${resolution}`;
}

export function handleStreamingData(
  streams: DatafeedStreams,
  data: SpotBarEvent,
  resolution: keyof typeof interval
) {
  const { id, price, timestamp, volume } = data;
  const cacheKey = cacheKeyFor(splitBarId(id).ticker, resolution);
  const tradePrice = price;
  const tradeTime = timestamp * 1000; // Multiplying by 1000 to get milliseconds
  const subscriptionItem = streams.subscriptions.get(cacheKey);
  if (!subscriptionItem) {
    return;
  }

  // A bar can arrive before `getBars` has answered — subscribeBars is called
  // with whatever is cached, which on a first visit is nothing. Reading `.time`
  // off it threw inside the socket's onBatch, which takes down the whole batch
  // and not just this symbol.
  const lastBar = subscriptionItem.lastBar;
  if (!lastBar) return;

  const intervalInSeconds = interval[resolution];
  const nextBarTime = getNextBarTime(lastBar.time, intervalInSeconds);

  // No logging in here. This runs once per streamed bar, and with DevTools open
  // the console holds a live reference to every object it is handed — so a
  // per-message log makes the retained set grow with trade volume, in the one
  // place a developer is guaranteed to be looking while diagnosing a leak.
  let bar: Bar;
  if (tradeTime >= nextBarTime) {
    bar = {
      time: nextBarTime * 1000,
      open: tradePrice,
      high: tradePrice,
      low: tradePrice,
      close: tradePrice,
      volume: volume ?? 0,
    };
  } else {
    bar = {
      ...lastBar,
      high: Math.max(lastBar.high, tradePrice),
      low: Math.min(lastBar.low, tradePrice),
      close: tradePrice,
      volume: lastBar.volume + (volume ?? 0),
    };
  }

  // Mutating the item already in the map; the redundant re-`set` that used to
  // follow the loop below is gone.
  subscriptionItem.lastBar = bar;

  // Send data to every subscriber of that symbol
  for (const handler of subscriptionItem.handlers) {
    handler.callback(bar);
  }
}

export function getNextBarTime(barTime: number, interval: number) {
  return barTime + interval * 1000;
}

/**
 * A socket manager for this gateway.
 *
 * No module state any more: `getSocketManager` already caches one manager per
 * URL, so this is a named wrapper rather than a place that remembers anything.
 * The `let manager` it used to assign was the reason a chain switch could leave
 * the chart streaming from the chain the user had left — see `DatafeedStreams`.
 */
export const initializeSocket = (streamingUrl: string): SocketManager =>
  getSocketManager(streamingUrl);

function handleBarFrame(streams: DatafeedStreams, frame: unknown[]): void {
  const spotBarEvent = streamToEvent(frame as never) as SpotBarEvent | null;
  if (!spotBarEvent) return;

  eventBus.emit("spot-bar-update", spotBarEvent);

  const { ticker, room } = splitBarId(spotBarEvent.id);
  const isPair = ticker.includes("/");
  const relatedResolutions = isPair
    ? pairRelatedResolutions.get(room)
    : tokenRelatedResolutions.get(room);
  for (const resolution of relatedResolutions ?? []) {
    handleStreamingData(streams, spotBarEvent, resolution);
  }
}

export function subscribeOnStream(
  streams: DatafeedStreams,
  symbolInfo: { ticker: string },
  resolution: keyof typeof interval,
  onRealtimeCallback: (bar: Bar) => void,
  subscriberUID: string,
  onResetCacheNeededCallback: (() => void) | undefined,
  lastBar: Bar | undefined
) {
  const isPair = symbolInfo.ticker.includes("/");
  const roomString = `${stripChartAddress(symbolInfo.ticker)}-${
    isPair ? pairRoomString[resolution] : tokenRoomString[resolution]
  }`;
  const cacheKey = cacheKeyFor(symbolInfo.ticker, resolution);
  const topic = `spotBar:${roomString}`;

  /*
   * ADD to an existing entry, never replace it. Replacing dropped the handlers
   * already there, so a second subscriber for the same symbol and resolution
   * silently stopped the first one's chart AND orphaned its unsubscriber — the
   * topic then stayed subscribed for as long as the tab was open.
   */
  const existing = streams.subscriptions.get(cacheKey);
  if (existing) {
    if (!existing.handlers.some((h) => h.id === subscriberUID)) {
      existing.handlers.push({ id: subscriberUID, callback: onRealtimeCallback });
    }
    // Keep the live bar: it is more current than the one the caller read out of
    // the history cache.
    if (!existing.lastBar) existing.lastBar = lastBar;
  } else {
    streams.subscriptions.set(cacheKey, {
      resolution,
      topic,
      lastBar,
      handlers: [{ id: subscriberUID, callback: onRealtimeCallback }],
    });
  }

  if (!streams.unsubscribers.has(topic)) {
    const unsubscribe = streams.manager.subscribe(
      topic,
      {
        method: "spot.bars.subscribe.pairs",
        params: { ids: [roomString] },
        unsubscribeMethod: "spot.bars.unsubscribe.pairs",
      },
      {
        onBatch: (batch) => {
          for (const frame of batch.d) handleBarFrame(streams, frame);
        },
        onResync: () => onResetCacheNeededCallback?.(),
      },
    );
    streams.unsubscribers.set(topic, unsubscribe);
  }
}

export function unsubscribeFromStream(
  streams: DatafeedStreams,
  subscriberUID: string
) {
  for (const [cacheKey, subscriptionItem] of streams.subscriptions) {
    const handlerIndex = subscriptionItem.handlers.findIndex(
      (handler) => handler.id === subscriberUID
    );
    if (handlerIndex === -1) continue;

    subscriptionItem.handlers.splice(handlerIndex, 1);
    if (subscriptionItem.handlers.length === 0) {
      /*
       * The topic is read off the subscription, not rebuilt from the key. It was
       * rebuilt with `cacheKey.split("-")`, which takes the first two segments —
       * so a ticker containing a dash produced a topic that matched nothing, the
       * unsubscriber was never found, and the subscription leaked for the life of
       * the tab.
       */
      streams.unsubscribers.get(subscriptionItem.topic)?.();
      streams.unsubscribers.delete(subscriptionItem.topic);
      streams.subscriptions.delete(cacheKey);
    }
    break;
  }
}

export const getDatafeed = (
  apiURL: string,
  streamingUrl: string,
  // Accepted and unused. The datafeed resolves its own manager from
  // `streamingUrl` below, so a caller cannot hand it one for a different chain
  // than the REST base it was built with — which is exactly the mismatch that
  // used to put one chain's history under another chain's live bars.
  _socket?: unknown
) => {
  const API_ENDPOINT = `${apiURL}/api/tradingview`;

  const streams: DatafeedStreams = {
    manager: getSocketManager(streamingUrl),
    lastBars: new Map(),
    subscriptions: new Map(),
    unsubscribers: new Map(),
  };

  return {
    onReady: (callback: (arg0: any) => void) => {
      fetch(`${API_ENDPOINT}/config`).then((response) => {
        response.json().then((configurationData) => {
          setTimeout(() => callback(configurationData));
        });
      });
    },
    searchSymbols: (
      userInput: string,
      exchange: any,
      symbolType: any,
      onResultReadyCallback: any
    ) => {
      fetch(`${API_ENDPOINT}/search?query=${userInput}`).then((response) => {
        response.json().then((data) => {
          onResultReadyCallback(data);
        });
      });
    },
    resolveSymbol: (
      symbolName: string,
      onSymbolResolvedCallback: any,
      onResolveErrorCallback: any
    ) => {
      // Encoded because a pair symbol contains a slash (ETH/USDC) and any future
      // symbol could carry a reserved character.
      fetch(`${API_ENDPOINT}/symbols?symbol=${encodeURIComponent(symbolName)}`)
        .then((response) => response.json())
        .then((symbolInfo) => {
          // A failed resolve must be REPORTED, not passed on as a symbol.
          //
          // This only caught a thrown parse error before, so two real failures
          // reached the widget dressed as success: the UDF error shape
          // ({s:"error"}), and a well-formed result with an empty ticker, which is
          // what /symbols answered for every token symbol until it learned to
          // search spotTokens. Both then made the widget request bars for ticker
          // "" and render an empty chart with nothing logged anywhere.
          if (!symbolInfo || symbolInfo.s === "error" || !symbolInfo.ticker) {
            onResolveErrorCallback(symbolInfo?.errmsg ?? "unknown_symbol");
            return;
          }
          onSymbolResolvedCallback(symbolInfo);
        })
        .catch(() => {
          onResolveErrorCallback("Cannot resolve symbol");
        });
    },
    // Thesis posts as avatar marks -- gated by config's `supports_marks`
    // (now true). The gateway does the token/profile resolution and returns
    // plain data, not the library's Mark shape; this is where that data
    // becomes Mark[].
    getMarks: (
      symbolInfo: { ticker: string },
      from: number,
      to: number,
      onDataCallback: (marks: any[]) => void,
      resolution: any
    ) => {
      const url = `${API_ENDPOINT}/marks?symbol=${encodeURIComponent(
        symbolInfo.ticker
      )}&from=${from}&to=${to}&resolution=${resolution}`;

      fetch(url)
        .then((response) => response.json())
        .then((data) => {
          // Same error discipline resolveSymbol applies above: a failed or
          // malformed fetch must not break the chart. The library assumes
          // onDataCallback is called exactly once per getMarks call, so the
          // failure case still has to call it -- with an empty array, never
          // by leaving the promise chain to silently drop the request.
          if (!data || !Array.isArray(data.marks)) {
            onDataCallback([]);
            return;
          }

          const marks = data.marks.map((mark: any) => {
            const name: string = mark.name || "Anonymous";
            // The fallback glyph shown when there is no avatar image (or
            // while one is still loading) -- single character, per the
            // Mark interface's own `label` doc.
            const label = name.trim().charAt(0).toUpperCase() || "?";
            return {
              id: mark.id,
              time: mark.time,
              color: "blue",
              // Hover content: who posted it and what they said.
              text: `${name}: ${mark.body}`,
              label,
              labelFontColor: "#FFFFFF",
              minSize: 24,
              // Omitted entirely -- not a broken-image URL -- when the
              // author has no avatar to show; the library falls back to
              // the `label` initial above on its own.
              ...(mark.avatarUrl ? { imageUrl: mark.avatarUrl } : {}),
            };
          });

          onDataCallback(marks);
        })
        .catch(() => {
          onDataCallback([]);
        });
    },
    getBars: (
      symbolInfo: { ticker: any },
      resolution: any,
      periodParams: { from: any; to: any; firstDataRequest: any },
      onHistoryCallback: any,
      onErrorCallback: any
    ) => {
      const { from, to, firstDataRequest } = periodParams;

      const maxRangeInSeconds = 365 * 24 * 60 * 60; // 1 year in seconds
      const promises = [];
      let currentFrom = from;
      let currentTo;

      while (currentFrom < to) {
        currentTo = Math.min(to, currentFrom + maxRangeInSeconds);
        const url = `${API_ENDPOINT}/history?symbol=${encodeURIComponent(symbolInfo.ticker)}&from=${currentFrom}&to=${currentTo}&resolution=${resolution}`;
        promises.push(fetch(url).then((response) => response.json()));
        currentFrom = currentTo;
      }

      Promise.all(promises)
        .then((results) => {
          const bars = [];
          for (const data of results) {
            if (data.t.length > 0) {
              for (let index = 0; index < data.t.length; index++) {
                bars.push({
                  time: data.t[index] * 1000,
                  low: data.l[index],
                  high: data.h[index],
                  open: data.o[index],
                  close: data.c[index],
                  volume: data.v[index],
                });
              }
            }
          }
          const cacheKey = cacheKeyFor(symbolInfo.ticker, resolution);

          if (firstDataRequest && bars.length > 0) {
            const seed = { ...bars[bars.length - 1] };
            streams.lastBars.set(cacheKey, seed);
            // Seed a subscription that already exists: subscribeBars can run
            // before the first history answers, and without this the live merge
            // has no bar to merge into and drops every tick until a resubscribe.
            const live = streams.subscriptions.get(cacheKey);
            if (live && !live.lastBar) live.lastBar = seed;
          }

          onHistoryCallback(bars, { noData: bars.length === 0 });
        })
        .catch((error) => {
          console.error("[getBars]: Get error", error);
          onErrorCallback(error);
        });
    },
    subscribeBars: (
      symbolInfo: { ticker: string },
      resolution: keyof typeof interval,
      onRealtimeCallback: (bar: Bar) => void,
      subscriberUID: string,
      onResetCacheNeededCallback: () => void
    ) => {
      const cacheKey = cacheKeyFor(symbolInfo.ticker, resolution);
      subscribeOnStream(
        streams,
        symbolInfo,
        resolution,
        onRealtimeCallback,
        subscriberUID,
        onResetCacheNeededCallback,
        streams.lastBars.get(cacheKey)
      );
    },
    unsubscribeBars: (subscriberUID: string) => {
      unsubscribeFromStream(streams, subscriberUID);
    },
  };
};
