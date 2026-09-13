"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One header figure that says when it changed, and which way.
 *
 * ## The flash is the whole point
 *
 * A polled number that swaps silently is indistinguishable from one that never
 * moves — the reader has no way to know whether the market is quiet or the page
 * is stale, and both look like a frozen header. A 900ms tint answers that
 * without a "last updated" line nobody reads.
 *
 * ## Fill and digits carry different claims
 *
 * The fill says a value MOVED; the digit slide says it moved in a direction.
 * Market cap and volume get the first and not the second, because a rising
 * volume is not "good" the way a rising price is, and colouring it green would
 * be reading a judgement into a number that has none. `direction` is opt-in per
 * stat for exactly that reason.
 *
 * ## Keyed on the formatted string, not the number
 *
 * A price polls at more precision than it renders, so keying on the raw value
 * flashes the tile on a change no one can see — every poll, forever. Comparing
 * what is actually on screen means the flash always corresponds to a digit the
 * reader can find.
 */
export function LiveStat({
  label,
  value,
  /** Raw value behind `value`, for deciding up from down. Omit for a plain flash. */
  compare,
  /** Colour the digits by sign, for a stat where a direction means something. */
  tone,
  className,
}: {
  label: string;
  value: string;
  compare?: number;
  tone?: "positive" | "negative";
  className?: string;
}) {
  const [flash, setFlash] = useState<"up" | "down" | "flat" | null>(null);
  const previous = useRef<{ value: string; compare?: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { value, compare };

    // The first render is not a change. Flashing every tile on mount would
    // teach a reader to ignore the one signal this component exists to give.
    if (!before || before.value === value) return;

    const next =
      compare != null && before.compare != null
        ? compare > before.compare
          ? "up"
          : compare < before.compare
            ? "down"
            : "flat"
        : "flat";
    setFlash(next);

    // Cleared rather than left set: the class has to be REMOVED before it can
    // be re-added, or a second change inside the animation window does not
    // restart it and the tile appears to miss a tick.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 950);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, compare]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] bg-[var(--m-surface-2)] px-3 py-2.5",
        className,
      )}
    >
      {/* The tint is its own layer at low opacity rather than the tile's own
          background, so a flash cannot leave the tile a different colour if the
          animation is interrupted mid-way — the layer just stops existing. */}
      {flash && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 opacity-[0.18]",
            flash === "down" ? "stat-tick-down" : "stat-tick-up",
          )}
        />
      )}
      <div className="relative text-[10px] text-[var(--m-text-secondary-2)]">{label}</div>
      <div
        // Keyed on the value so React replaces the node, which is what restarts
        // the digit animation. Without the key it mutates the text in place and
        // the animation only ever plays once.
        key={value}
        className={cn(
          "relative mt-1 font-dm-mono text-[13px] tabular-nums",
          flash && "stat-tick-digits",
          tone === "positive" && "text-[var(--m-success)]",
          tone === "negative" && "text-[var(--m-error)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
