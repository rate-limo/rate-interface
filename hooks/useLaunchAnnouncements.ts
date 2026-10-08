"use client";

import { useEffect, useRef } from "react";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { getWsUrl } from "@/lib/realtime/ws-url";
import { streamToEvent, type SpotLaunchEvent } from "@/types";

/** Refetch at most this often, however many coins deploy at once. */
const SETTLE_MS = 400;

/**
 * Tells the caller when a coin has launched anywhere on the venue.
 *
 * ## It asks for a refetch; it does not carry the coin
 *
 * The frame has a symbol, a name and a creator — and none of the thirty-odd
 * numbers a card draws: supply, decimals, price, market cap. Rendering from the
 * frame would mean inventing them, and a card reading "$0.00" is not a coin
 * that is worth nothing, it is a lie with a number in it. So the announcement
 * is treated as what it is: notice that the row now EXISTS, and the row is
 * fetched from the same route the grid already uses.
 *
 * The broker publishes after writing the row, not on the contract event, so by
 * the time this fires there is something to fetch.
 *
 * ## The arrival animation needs nothing from this
 *
 * `useArrivals` is a set difference across renders: any id the grid has not
 * drawn before enters. That already worked — the coin simply had to wait for a
 * mount or a tab focus to be fetched, which on a quiet venue is minutes after
 * the deploy. The animation is unchanged; only its timing is.
 *
 * ## Resync counts as an announcement
 *
 * A reconnect (tab slept, seq gap) drops whatever was published while the
 * socket was away, and a launch missed that way would never arrive — there is
 * no later frame to correct it. Refetching on resync is the whole recovery.
 *
 * ## Nothing accumulates
 *
 * No frames are held and no ids are remembered: a redelivered launch costs one
 * refetch that the settle timer usually absorbs. A tab left open for a day ends
 * holding exactly one timer handle, and only while a refetch is pending.
 */
export function useLaunchAnnouncements(
  networkName: string,
  onAnnounced: () => void,
): void {
  // Kept in a ref so an inline arrow from the caller cannot tear the
  // subscription down and rebuild it on every render.
  const announced = useRef(onAnnounced);
  announced.current = onAnnounced;

  useEffect(() => {
    const url = getWsUrl(networkName);
    if (!url) return;
    const manager = getSocketManager(url);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        announced.current();
      }, SETTLE_MS);
    };

    const handle = (frame: unknown) => {
      const event = streamToEvent(frame as never) as SpotLaunchEvent | null;
      // A frame that fails its schema decodes to null rather than throwing, so
      // a bad one costs this feed a launch, not the socket its other topics.
      if (event?.eventId !== "spotLaunch") return;
      schedule();
    };

    const unsubscribe = manager.subscribe(
      "spotLaunch:all",
      {
        method: "spot.launches.subscribe.all",
        params: {},
        unsubscribeMethod: "spot.launches.unsubscribe.all",
      },
      {
        onBatch: (batch) => { for (const frame of batch.d) handle(frame); },
        onResync: schedule,
      },
    );

    return () => {
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
    };
  }, [networkName]);
}
