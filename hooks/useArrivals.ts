"use client";

import { useEffect, useRef, useState } from "react";
import { arrivalsOf } from "@/lib/launch/arrivals";

/** How long a new card stays marked after it enters. */
const HOLD_MS = 6_000;

/**
 * The cards that have just joined this list, and their place in the stagger.
 *
 * Transport-agnostic on purpose — see `arrivalsOf`. It compares the ids this
 * list has rendered before against the ids it is rendering now, so it is right
 * whether the row arrived on a window-focus refetch (today) or on a socket
 * frame (the day a venue-wide launch topic exists).
 *
 * The joined id string is the dependency rather than the array: react-query
 * hands back a new array identity on every refetch, and keying on that would
 * re-run this — and re-mark every card — each time the tab regains focus.
 */
export function useArrivals(
  ids: readonly string[],
  /**
   * Changing this forgets everything seen so far, marking nothing.
   *
   * The Launches tabs are three different questions, not three orderings of
   * one: moving from All to Recently launched replaces the whole id set, and
   * without a reset every card on the incoming tab would read as having just
   * been deployed. A tab switch is navigation; nothing arrived.
   */
  resetKey: string = "",
): ReadonlyMap<string, number> {
  const seen = useRef<Set<string> | null>(null);
  const lastReset = useRef(resetKey);
  const [arrived, setArrived] = useState<ReadonlyMap<string, number>>(new Map());
  const key = ids.join(",");

  useEffect(() => {
    if (lastReset.current !== resetKey) {
      lastReset.current = resetKey;
      seen.current = null;
    }
    const fresh = arrivalsOf(seen.current, ids);
    seen.current = new Set(ids);
    if (fresh.size === 0) return;
    setArrived(fresh);
    // Cleared rather than left: the mark says "this arrived while you were
    // looking", which stops being true a few seconds later.
    const timer = window.setTimeout(() => setArrived(new Map()), HOLD_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the value
    // of `ids`; depending on the array itself re-runs on every refetch.
  }, [key, resetKey]);

  return arrived;
}
