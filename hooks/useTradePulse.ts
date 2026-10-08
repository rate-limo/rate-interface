"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { getWsUrl } from "@/lib/realtime/ws-url";
import {
  collapseFillSummary,
  streamToEvent,
  type SpotFillSummaryEvent,
  type SpotTradeEvent,
} from "@/types";

/** At most one callback per window, with a trailing edge. See `MIN_GAP_MS`. */
const MIN_GAP_MS = 750;

/**
 * Fires when a trade lands on one of THIS page's markets.
 *
 * ## Why a page that polls needs this
 *
 * The token header's figures are ROLLING aggregates the broker maintains, so
 * they can only be read, never derived from a tick — that is why
 * `useLiveTokenStats` polls rather than subscribing, and the reasoning there
 * still holds. What polling cannot do is tell the reader *when* something
 * happened: at a 15s interval, with the gateway caching that route for ten
 * seconds on top, a trade took up to ~25 seconds to appear, several trades
 * inside one window collapsed into a single change, and a tab that lost focus
 * stopped asking altogether. The header flashed "occasionally", which is
 * exactly what a coalesced poll looks like from the outside.
 *
 * So the socket says WHEN and the poll still says WHAT. A frame re-asks
 * immediately; nothing is computed from the frame itself.
 *
 * ## Named markets ONLY — never `spotTrade:allPairs`
 *
 * The first cut of this subscribed to the all-pairs feed and filtered by token
 * address in the browser. That works and it does not scale: every fill on every
 * market on the venue crosses the socket, is decoded, and is thrown away by a
 * predicate — on a page that may be left open for hours, on a venue whose whole
 * point is many markets. A token trades against a handful of quotes, the page
 * already knows which, and `trades.pairs` takes them by name, so the gateway
 * does the filtering and this tab receives only frames it will act on.
 *
 * An empty `pairs` list subscribes to nothing at all. A token with no market
 * has no trade to react to, and joining a feed to learn that is pure cost.
 *
 * ## Coalesced, because a sweep is not one frame
 *
 * `MatchingEngine.matchAt` emits one `OrderMatched` per resting order consumed,
 * so a single taker can produce twenty frames. The public feed folds most of
 * that into a `spotFillSummary` envelope, but not all shapes and not from an
 * older gateway — so a sweep can still arrive as a burst, and un-throttled this
 * would fire a REST read per fill. One read per 750ms with a trailing call
 * answers the same question at a fixed cost.
 */
export function useTradePulse({
  networkName,
  pairs,
  onTrade,
  enabled = true,
}: {
  networkName: string;
  /** Market symbols, `BASE/QUOTE`. Empty means no subscription. */
  pairs: readonly string[];
  onTrade: () => void;
  enabled?: boolean;
}): void {
  /*
   * Held in a ref on purpose. Callers pass this inline, so a new identity
   * arrives on every render; in the dependency array it would tear the
   * subscription down and rebuild it each time — a resubscribe per frame on a
   * busy market, which is the opposite of what this hook is for.
   */
  const onTradeRef = useRef(onTrade);
  useLayoutEffect(() => {
    onTradeRef.current = onTrade;
  });

  // A stable key, so re-deriving `pairs.map(p => p.symbol)` upstream does not
  // count as a change. The list is a handful of symbols; sorting makes it
  // order-independent too.
  const key = useMemo(() => [...pairs].filter(Boolean).sort().join(","), [pairs]);

  useEffect(() => {
    if (!enabled || !key) return;
    const url = getWsUrl(networkName);
    if (!url) return;

    const symbols = key.split(",");
    const manager = getSocketManager(url);

    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      const now = Date.now();
      const since = now - last;
      if (since >= MIN_GAP_MS) {
        last = now;
        onTradeRef.current();
        return;
      }
      // A burst's LAST frame still has to be answered: the fills after the one
      // that fired are the rest of the same sweep, and dropping them would
      // report a partial trade as the whole of it.
      if (trailing) return;
      trailing = setTimeout(() => {
        trailing = null;
        last = Date.now();
        onTradeRef.current();
      }, MIN_GAP_MS - since);
    };

    const handle = (frame: unknown) => {
      const event = streamToEvent(frame as never) as
        | SpotTradeEvent
        | SpotFillSummaryEvent
        | null;
      // Both shapes, because the public feed carries envelopes for a sweep and
      // an older gateway still sends one frame per fill.
      if (event?.eventId === "spotTrade" || event?.eventId === "spotFillSummary") fire();
    };

    const unsubscribes = symbols.map((pair) =>
      manager.subscribe(
        `spotTrade:${pair}`,
        {
          method: "spot.trades.subscribe.pairs",
          params: { pairs: [pair] },
          unsubscribeMethod: "spot.trades.unsubscribe.pairs",
          unsubscribeParams: { pairs: [pair] },
        },
        {
          onBatch: (batch) => {
            for (const frame of batch.d) handle(frame);
          },
        },
      ),
    );

    return () => {
      if (trailing) clearTimeout(trailing);
      for (const off of unsubscribes) off();
    };
  }, [networkName, key, enabled]);
}

/** `SpotPair[]` → the symbols `useTradePulse` subscribes to. */
export function pairSymbols(pairs: readonly { symbol?: string | null }[]): string[] {
  return pairs.map((p) => p?.symbol).filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Retained for callers that still filter a shared feed by token. */
export function tradeTouchesToken(trade: SpotTradeEvent, address: string | undefined): boolean {
  if (!address) return false;
  const id = address.toLowerCase();
  return (
    String(trade.base ?? "").toLowerCase() === id ||
    String(trade.quote ?? "").toLowerCase() === id
  );
}
