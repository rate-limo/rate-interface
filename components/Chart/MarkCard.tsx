"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MarkCluster, ThesisMark } from "@/lib/chart/marks";

/**
 * The card a chart mark opens — one callout, or the whole candle's worth.
 *
 * ## One component, not two
 *
 * A single callout is the one-row case of a list, and splitting them produced
 * two headers that drifted: the stacked variant is the common one on a busy
 * coin, and it is the one nobody looks at while building the other. The only
 * thing that changes with count is whether the card scrolls and whether it says
 * how many there are.
 *
 * ## It scrolls rather than grows
 *
 * A card sized to its contents covers the chart it is annotating the moment a
 * candle holds a dozen callouts — which is the case this exists for. Capped
 * height, internal scroll, and the count in the footer so a reader knows there
 * is more without having to discover it by dragging.
 *
 * ## Every row is a button
 *
 * Clicking one opens that callout's modal. On the stacked card the rows are the
 * only way to reach an individual callout at all, since the marks behind it are
 * overlapping by design.
 */
export function MarkCard({
  cluster,
  position,
  width,
  onSelect,
  onDismiss,
}: {
  cluster: MarkCluster;
  position: { left: number; top: number };
  width: number;
  onSelect: (mark: ThesisMark) => void;
  onDismiss: () => void;
}) {
  const stacked = cluster.marks.length > 1;
  const ref = useRef<HTMLDivElement | null>(null);

  // Escape closes it. A card opened by hover and closed only by moving the mouse
  // somewhere specific is a trap on a touchpad, and unreachable from a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      style={{ left: position.left, top: position.top, width }}
      onMouseLeave={onDismiss}
      className={cn(
        "pointer-events-auto absolute z-40 overflow-hidden rounded-[12px]",
        "border border-[color:var(--m-border)] bg-[color:var(--m-surface)]",
        "shadow-[0_18px_44px_rgba(0,0,0,0.35)]",
      )}
    >
      <div className={cn(stacked && "max-h-[232px] overflow-y-auto")}>
        {cluster.marks.map((mark) => (
          <button
            key={mark.id}
            type="button"
            onClick={() => onSelect(mark)}
            className={cn(
              "flex w-full flex-col gap-2 border-b border-[color:var(--m-border)] px-4 py-3 text-left",
              "transition-colors last:border-b-0 hover:bg-[color:var(--m-surface-2)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2",
              "focus-visible:outline-[color:var(--m-primary)]",
            )}
          >
            <span className="flex items-center gap-2">
              <Avatar mark={mark} />
              <span className="truncate text-[14px] font-semibold text-[color:var(--m-text-primary)]">
                {mark.name}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-[5px] border border-[color:var(--m-primary)]/40 px-1.5",
                  "text-[11px] font-semibold text-[color:var(--m-primary)]",
                  "bg-[color:var(--m-primary)]/15",
                )}
              >
                Thesis
              </span>
              <span className="ml-auto shrink-0 font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                {stamp(mark.time)}
              </span>
            </span>
            {/* `break-words`, because a callout is frequently a pasted URL —
                without it one link pushes the card wider than the chart. */}
            <span className="break-words text-[14px] leading-[1.45] text-[color:var(--m-text-primary)]">
              {mark.body}
            </span>
          </button>
        ))}
      </div>

      {stacked && (
        <div
          className={cn(
            "flex items-center justify-between border-t border-[color:var(--m-border)]",
            "bg-[color:var(--m-surface-2)] px-4 py-2 font-dm-mono text-[11px]",
            "text-[color:var(--m-text-secondary-2)]",
          )}
        >
          <span>
            {cluster.marks.length} on this candle
          </span>
          <span>by stake</span>
        </div>
      )}
    </div>
  );
}

function Avatar({ mark }: { mark: ThesisMark }) {
  if (mark.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={mark.avatarUrl} alt="" className="h-[26px] w-[26px] shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[color:var(--m-primary)] text-[11px] font-bold text-white">
      {mark.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * An absolute stamp, not "3h ago".
 *
 * Every callout in a cluster shares a candle, so relative ages render as the
 * same string repeated down the card and say nothing about which came first. The
 * date is dropped when the callout is from today, which is most of them.
 */
function stamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}
