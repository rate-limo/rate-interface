"use client";

import { useEffect, useRef, useState } from "react";
import { changedLevels, type FlashableLevel } from "@/lib/orderbook/flash";

/**
 * The set of price levels to flash right now.
 *
 * Holds the previous snapshot, diffs against it, and clears the highlight after
 * `FLASH_MS`. The diff itself is pure and lives in `lib/orderbook/flash`.
 *
 * ## The duration must outlast the transition it triggers
 *
 * The version this replaces cleared its state after 100ms while the row's
 * transition ran for 300 — so the flash was cut off a third of the way in and
 * the colour never reached full strength. `FLASH_MS` is the single number now,
 * and the row's transition is driven from it.
 *
 * ## Reduced motion means no flash at all, not a slower one
 *
 * A book on a busy market repaints several rows a second. That is the
 * definition of the thing `prefers-reduced-motion` exists to suppress, and a
 * gentler version of it is still the thing. The rows still update — only the
 * highlight is withheld.
 *
 * Read in an effect and stored in state rather than consulted during render:
 * the server cannot know the preference, so reading it while rendering would
 * mismatch the HTML being hydrated. Same rule the consent banner and the OG
 * Pass countdown already follow.
 */

/** Long enough to notice, short enough not to smear on a fast book. */
export const FLASH_MS = 300;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function useFlashingLevels(levels: readonly FlashableLevel[]): Set<string> {
  const previous = useRef<readonly FlashableLevel[] | undefined>(undefined);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const changed = changedLevels(previous.current, levels);
    previous.current = levels;

    // The snapshot is still recorded above when motion is reduced, so turning
    // the preference off mid-session compares against the book as it is rather
    // than flashing everything that moved while it was on.
    if (reduced || changed.size === 0) return;

    setFlashing(changed);
    const timer = setTimeout(() => setFlashing(new Set()), FLASH_MS);
    // Cleared on the next update, so a level that moves twice in quick
    // succession flashes for the second move rather than being cut short by the
    // first timer — and nothing sets state after unmount, which the eventBus
    // subscription this replaces did on every mount.
    return () => clearTimeout(timer);
  }, [levels, reduced]);

  return flashing;
}
