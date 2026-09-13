import { streamToEvent } from "@/types/streams";
import { SpotBarEvent } from "@/types";
import { eventBus } from "./events";

// Use it to keep a record of the most recent bar on the chart
const lastBarsCache = new Map();

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

// Assuming you're working in a browser environment that supports fetch and ReadableStream
const roomToSubscription = new Map();

export function handleStreamingData(
  data: SpotBarEvent,
  resolution: keyof typeof interval
) {
  const { id, price, timestamp, volume } = data;
  const cacheKey = `${id.split("-")[0]}-${resolution}`;
  const tradePrice = price;
  const tradeTime = timestamp * 1000; // Multiplying by 1000 to get milliseconds
  const subscriptionItem = roomToSubscription.get(cacheKey);
  if (!subscriptionItem) {
    return;
  }

  const lastBar = subscriptionItem.lastBar;
  const intervalInSeconds = interval[resolution];
  const nextBarTime = getNextBarTime(lastBar.time, intervalInSeconds);

  let bar;
  if (tradeTime >= nextBarTime) {
    bar = {
      time: nextBarTime * 1000,
      open: tradePrice,
      high: tradePrice,
      low: tradePrice,
      close: tradePrice,
      volume: volume ?? 0,
    };
    console.log("[stream] Generate new bar", bar);
  } else {
    bar = {
      ...lastBar,
      high: Math.max(lastBar.high, tradePrice),
      low: Math.min(lastBar.low, tradePrice),
      close: tradePrice,
      volume: lastBar.volume + (volume ?? 0),
    };
    console.log(
      "[stream] Update the latest bar by price and volume",
      tradePrice,
      volume
    );
  }

  subscriptionItem.lastBar = bar;

  // Send data to every subscriber of that symbol
  for (const handler of subscriptionItem.handlers) {
    handler.callback(bar);
  }
  roomToSubscription.set(cacheKey, subscriptionItem);
}

export function getNextBarTime(barTime: number, interval: number) {
  return barTime + interval * 1000;
}

// Bars stream over the app-wide shared websocket (lib/realtime/socket-manager):
// no dedicated chart socket, no per-message console noise.
import { getSocketManager, type SocketManager } from "@/lib/realtime/socket-manager";

let manager: SocketManager | null = null;
const topicUnsubscribers = new Map<string, () => void>();

export const initializeSocket = (streamingUrl: string): SocketManager => {
  manager = getSocketManager(streamingUrl);
  return manager;
};

function handleBarFrame(frame: unknown[]): void {
  const spotBarEvent = streamToEvent(frame as never) as SpotBarEvent | null;
  if (!spotBarEvent) return;

  eventBus.emit("spot-bar-update", spotBarEvent);

  const [id, room] = spotBarEvent.id.split("-");
  const isPair = id.includes("/");
  const relatedResolutions = isPair
    ? pairRelatedResolutions.get(room)
    : tokenRelatedResolutions.get(room);
  for (const resolution of relatedResolutions ?? []) {
    handleStreamingData(spotBarEvent, resolution);
  }
}

export function subscribeOnStream(
  _socket: unknown,
  symbolInfo: { ticker: string },
  resolution: keyof typeof interval,
  onRealtimeCallback: any,
  subscriberUID: any,
  onResetCacheNeededCallback: any,
  lastBar: any
) {
  if (!manager) return;
  const isPair = symbolInfo.ticker.includes("/");
  const roomString = `${symbolInfo.ticker}-${
    isPair ? pairRoomString[resolution] : tokenRoomString[resolution]
  }`;
  const cacheKey = `${symbolInfo.ticker}-${resolution}`;

  roomToSubscription.set(cacheKey, {
    subscriberUID,
    resolution,
    lastBar,
    handlers: [{ id: subscriberUID, callback: onRealtimeCallback }],
  });

  const topic = `spotBar:${roomString}`;
  if (!topicUnsubscribers.has(topic)) {
    const unsubscribe = manager.subscribe(
      topic,
      {
        method: "spot.bars.subscribe.pairs",
        params: { ids: [roomString] },
        unsubscribeMethod: "spot.bars.unsubscribe.pairs",
      },
      {
        onBatch: (batch) => {
          for (const frame of batch.d) handleBarFrame(frame);
        },
        onResync: () => onResetCacheNeededCallback?.(),
      },
    );
    topicUnsubscribers.set(topic, unsubscribe);
  }
}

export function unsubscribeFromStream(_socket: unknown, subscriberUID: string) {
  for (const cacheKey of roomToSubscription.keys()) {
    const subscriptionItem = roomToSubscription.get(cacheKey);
    const handlerIndex = subscriptionItem.handlers.findIndex(
      (handler: { id: string }) => handler.id === subscriberUID
    );
    if (handlerIndex === -1) continue;

    subscriptionItem.handlers.splice(handlerIndex, 1);
    if (subscriptionItem.handlers.length === 0) {
      const [id, resolution] = cacheKey.split("-");
      const isPair = id.includes("/");
      const roomId = isPair
        ? pairRoomString[resolution as keyof typeof pairRoomString]
        : tokenRoomString[resolution as keyof typeof tokenRoomString];
      const topic = `spotBar:${id}-${roomId}`;

      topicUnsubscribers.get(topic)?.();
      topicUnsubscribers.delete(topic);
      roomToSubscription.delete(cacheKey);
    }
    break;
  }
}

export const getDatafeed = (
  apiURL: string,
  streamingUrl: string,
  socket: unknown
) => {
  const API_ENDPOINT = `${apiURL}/api/tradingview`;

  return {
    onReady: (callback: (arg0: any) => void) => {
      console.log("[onReady]: Method call");
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
      console.log("[searchSymbols]: Method call");
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
      console.log("[getBars]: Method call", symbolInfo, resolution, from, to);

      const maxRangeInSeconds = 365 * 24 * 60 * 60; // 1 year in seconds
      const promises = [];
      let currentFrom = from;
      let currentTo;

      while (currentFrom < to) {
        currentTo = Math.min(to, currentFrom + maxRangeInSeconds);
        const url = `${API_ENDPOINT}/history?symbol=${symbolInfo.ticker}&from=${currentFrom}&to=${currentTo}&resolution=${resolution}`;
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
          const cacheKey = `${symbolInfo.ticker}-${resolution}`;

          if (firstDataRequest && bars.length > 0) {
            lastBarsCache.set(cacheKey, {
              ...bars[bars.length - 1],
            });
          }

          onHistoryCallback(bars, { noData: bars.length === 0 });
        })
        .catch((error) => {
          console.log("[getBars]: Get error", error);
          onErrorCallback(error);
        });
    },
    subscribeBars: (
      symbolInfo: { ticker: string },
      resolution: keyof typeof interval,
      onRealtimeCallback: any,
      subscriberUID: string,
      onResetCacheNeededCallback: any
    ) => {
      console.log(
        "[subscribeBars]: Method call with subscriberUID:",
        subscriberUID
      );
      const cacheKey = `${symbolInfo.ticker}-${resolution}`;
      console.log("[subscribeBars]: resolution", resolution);
      subscribeOnStream(
        socket,
        symbolInfo,
        resolution,
        onRealtimeCallback,
        subscriberUID,
        onResetCacheNeededCallback,
        lastBarsCache.get(cacheKey)
      );
    },
    unsubscribeBars: (subscriberUID: string) => {
      console.log(
        "[unsubscribeBars]: Method call with subscriberUID:",
        subscriberUID
      );
      unsubscribeFromStream(socket, subscriberUID);
    },
  };
};
