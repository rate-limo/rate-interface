"use client";

import { useEffect, useState } from "react";

export interface Countdown {
  /** false until the client has mounted — render a placeholder while false to avoid SSR hydration mismatch. */
  mounted: boolean;
  /** true once the countdown has reached zero (the sale is live). */
  isLive: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Hydration-safe countdown.
 *
 * The target time is derived from `startsInSec` inside an effect (never during
 * render), so the server and the first client render agree (`mounted:false`).
 * After mount it ticks every second. Real behaviour: swap `startsInSec` for a
 * fixed on-chain/config timestamp and drop the "derive target on mount" step.
 */
export function useCountdown(startsInSec: number): Countdown {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.now() + startsInSec * 1000;
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startsInSec]);

  if (remainingMs === null) {
    return { mounted: false, isLive: false, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSec = Math.floor(remainingMs / 1000);
  return {
    mounted: true,
    isLive: remainingMs <= 0,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}
