"use client";

import { useEffect, useRef, useState } from "react";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { getWsUrl } from "@/lib/realtime/ws-url";
import { noteTrade, TRADED_WINDOW_MS } from "@/lib/launch/traded";
import {
  collapseFillSummary,
  streamToEvent,
  type SpotFillSummaryEvent,
  type SpotTradeEvent,
} from "@/types";

/** Reorder the grid at most this often, however fast the frames arrive. */
const SETTLE_MS = 1_500;

/**
 * Which coins have traded lately, venue-wide.
 *
 * ## `spotTrade:allPairs`, and here it IS the right topic
 *
 * Elsewhere in this app that feed is the wrong choice — `useTradePulse` names
 * the token page's markets one by one, because a token page cares about two
 * pairs and would otherwise decode every fill on the venue to throw it away.
 * This page is the opposite: a directory of EVERY launch, where any coin on the
 * list may trade and the alternative is two hundred subscriptions.
 *
 * ## It settles rather than tracks
 *
 * A trade reorders the grid, so applying every frame would move cards under the
 * reader's cursor at whatever rate the market runs. Frames are folded into a
 * ref as they arrive and published on a `SETTLE_MS` timer, so a burst produces
 * one reorder. The timer only runs while frames are pending: a quiet market
 * costs nothing.
 *
 * ## The map cannot grow
 *
 * `noteTrade` expires its own entries as it writes, so nothing here holds a
 * timer to sweep and a tab left open overnight ends with at most the coins that
 * traded in the last window.
 */
export function useRecentlyTraded(networkName: string): ReadonlyMap<string, number> {
  const [traded, setTraded] = useState<ReadonlyMap<string, number>>(() => new Map());
  const pending = useRef<ReadonlyMap<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = getWsUrl(networkName);
    if (!url) return;
    const manager = getSocketManager(url);

    const publish = () => {
      timer.current = null;
      const next = pending.current;
      pending.current = null;
      if (next) setTraded(next);
    };

    const handle = (frame: unknown) => {
      const event = streamToEvent(frame as never) as
        | SpotTradeEvent
        | SpotFillSummaryEvent
        | null;
      const trade =
        event?.eventId === "spotTrade"
          ? event
          : event?.eventId === "spotFillSummary"
            ? collapseFillSummary(event)
            : null;
      if (!trade) return;
      // BOTH legs: a coin is "trading" whether it was bought or sold, and the
      // quote side is a real coin on this venue too.
      const base = typeof trade.base === "string" ? trade.base : "";
      const quote = typeof trade.quote === "string" ? trade.quote : "";
      pending.current = noteTrade(pending.current ?? traded, [base, quote], Date.now());
      if (!timer.current) timer.current = setTimeout(publish, SETTLE_MS);
    };

    const unsubscribe = manager.subscribe(
      "spotTrade:allPairs",
      {
        method: "spot.trades.subscribe.pairs.all",
        params: {},
        unsubscribeMethod: "spot.trades.unsubscribe.pairs.all",
      },
      { onBatch: (batch) => { for (const frame of batch.d) handle(frame); } },
    );

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      unsubscribe();
    };
    // `traded` is read inside `handle` as a seed and must not re-subscribe when
    // it changes — the pending ref carries the accumulation between publishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkName]);

  return traded;
}

export { TRADED_WINDOW_MS };
