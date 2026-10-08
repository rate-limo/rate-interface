"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ladderDisplay, type Ladder, type LadderTone } from "@/lib/launch/ladderView";

/**
 * Design C+ (2026-10-03): a ring that fills toward the graduation market cap,
 * with notches where each later ladder step starts, plus a corner pill on the
 * art. Ladder coins only — coins from the previous generator keep the listing
 * bar. Colours are Monet tokens: WARNING while the ladder is still being placed,
 * orange while selling / sold out, blue armed, green graduated.
 *
 * `placing` is warning rather than accent on purpose: it is the one state where
 * the coin cannot be traded at all, and it must not look like a step on sale.
 */

const TONE_STROKE: Record<LadderTone, string> = {
  placing: "var(--m-warning)",
  step: "var(--m-accent)",
  armed: "var(--m-primary)",
  graduated: "var(--m-success)",
};

const TONE_PILL: Record<LadderTone, string> = {
  placing: "text-[color:var(--m-warning-700)] bg-[color-mix(in_srgb,var(--m-warning)_18%,transparent)]",
  step: "text-[color:var(--m-accent-text)] bg-[color-mix(in_srgb,var(--m-accent)_16%,transparent)]",
  armed: "text-[color:var(--m-primary-fg)] bg-[color-mix(in_srgb,var(--m-primary)_18%,transparent)]",
  graduated: "text-[color:var(--m-success-fg)] bg-[color-mix(in_srgb,var(--m-success)_18%,transparent)]",
};

/** Unix seconds, ticking once a second only while a countdown is on screen. */
function useNowSec(active: boolean): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function LadderRing({ ladder, size = 46, nowSec }: { ladder: Ladder; size?: number; nowSec: number }) {
  const d = ladderDisplay(ladder, nowSec);
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 46 46" aria-hidden className="shrink-0">
      <circle cx="23" cy="23" r={r} fill="none" stroke="var(--m-surface-2)" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke={TONE_STROKE[d.tone]}
        strokeWidth="5"
        strokeDasharray={`${(d.progress * c).toFixed(2)} ${c.toFixed(2)}`}
        transform="rotate(-90 23 23)"
      />
      {d.notches.map((f) => {
        const a = (f * 360 - 90) * (Math.PI / 180);
        return (
          <line
            key={f}
            x1={23 + 13.2 * Math.cos(a)}
            y1={23 + 13.2 * Math.sin(a)}
            x2={23 + 20.8 * Math.cos(a)}
            y2={23 + 20.8 * Math.sin(a)}
            stroke="var(--m-surface)"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

export function LadderPill({ ladder, nowSec, label, className }: { ladder: Ladder; nowSec: number; label?: string; className?: string }) {
  const d = ladderDisplay(ladder, nowSec);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-dm-mono text-[11px] tabular-nums",
        TONE_PILL[d.tone],
        className,
      )}
    >
      {label ?? d.pill}
    </span>
  );
}

/** Ring + the two lines, for a launch tile. */
export function LadderProgress({ ladder }: { ladder: Ladder }) {
  const now = useNowSec(ladder.state === "armed");
  const d = ladderDisplay(ladder, now);
  return (
    <div className="mt-2.5 flex items-center gap-3" data-testid="ladder-progress" data-state={ladder.state}>
      <LadderRing ladder={ladder} nowSec={now} />
      <div className="min-w-0">
        <b className="block truncate font-dm-mono text-[13px] font-medium tabular-nums text-[color:var(--m-text-primary)]">
          {d.headline}
        </b>
        <span className="block truncate font-dm-mono text-[11.5px] tabular-nums text-[color:var(--m-text-secondary)]">
          {d.detail}
        </span>
      </div>
    </div>
  );
}

/** The corner pill over a tile's art. */
export function LadderCornerPill({ ladder }: { ladder: Ladder }) {
  const now = useNowSec(false);
  return <LadderPill ladder={ladder} nowSec={now} className="absolute right-2 top-2 z-[1] shadow-sm" />;
}

/** Small ring + pill for a table row; while selling the pill says what is left. */
export function LadderStatusCell({ ladder }: { ladder: Ladder }) {
  const now = useNowSec(ladder.state === "armed");
  const d = ladderDisplay(ladder, now);
  const label = ladder.state === "selling" ? d.headline : ladder.state === "armed" ? d.headline : d.pill;
  return (
    <span className="inline-flex items-center gap-2" data-testid="ladder-status" data-state={ladder.state}>
      <LadderRing ladder={ladder} nowSec={now} size={26} />
      <LadderPill ladder={ladder} nowSec={now} label={label} />
    </span>
  );
}
