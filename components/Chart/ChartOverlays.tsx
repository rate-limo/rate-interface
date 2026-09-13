"use client";

import { cn } from "@/lib/utils";
import type { MarkFilters } from "@/hooks/useThesisMarks";

/** Thresholds the size filter offers. `0` is the filter turned off. */
const SIZE_STEPS = [1_000, 10_000, 100_000] as const;

/**
 * The controls under the chart: which callouts it draws, and how it draws them.
 *
 * ## Only controls that do something
 *
 * There is no "My swaps" toggle. Nothing puts a viewer's own fills on the chart
 * as marks — that needs its own source keyed to the connected wallet — and a
 * checkbox next to a working one, doing nothing, is the failure this codebase
 * keeps deleting. It goes in when the layer behind it does.
 *
 * ## Friends only is disabled, not hidden, without a wallet
 *
 * There is nobody to have follows FOR, so an enabled control resolving to an
 * empty chart would read as "none of the people you follow have posted here"
 * rather than "we cannot know". Same call the traders table makes about its own
 * Following tab, with the same wording in the tooltip.
 */
export function ChartOverlays({
  filters,
  onChange,
  showMarks,
  onShowMarksChange,
  hasViewer,
  count,
  className,
}: {
  filters: MarkFilters;
  onChange: (next: MarkFilters) => void;
  showMarks: boolean;
  onShowMarksChange: (next: boolean) => void;
  hasViewer: boolean;
  /** Callouts currently drawn. Named so a reader can tell an empty filter from an empty coin. */
  count: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[color:var(--m-text-secondary)]",
        className,
      )}
    >
      <span className="font-medium text-[color:var(--m-text-primary)]">Chart overlays</span>
      <span className="h-4 w-px bg-[color:var(--m-border)]" aria-hidden />

      <Check
        checked={showMarks}
        onChange={onShowMarksChange}
        label={count > 0 ? `Thesis (${count})` : "Thesis"}
      />

      <Check
        checked={filters.friendsOnly}
        onChange={(next) => onChange({ ...filters, friendsOnly: next })}
        label="Friends only"
        disabled={!showMarks || !hasViewer}
        title={hasViewer ? undefined : "Connect a wallet to see callouts from people you follow"}
      />

      <label
        className={cn(
          "flex items-center gap-2",
          !showMarks && "cursor-not-allowed opacity-40",
        )}
      >
        <span>Min size</span>
        <select
          value={filters.minUsd}
          disabled={!showMarks}
          onChange={(e) => onChange({ ...filters, minUsd: Number(e.target.value) })}
          className={cn(
            "rounded-[8px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)]",
            "px-2 py-1 font-dm-mono text-[12px] tabular-nums text-[color:var(--m-text-primary)]",
          )}
        >
          <option value={0}>any</option>
          {SIZE_STEPS.map((v) => (
            <option key={v} value={v}>
              &gt;${v >= 1000 ? `${v / 1000}k` : v}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={cn(
        "flex select-none items-center gap-2",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      {/* A real checkbox, not a styled div: it focuses, it toggles from the
          keyboard, and a screen reader announces its state without an aria dance. */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[color:var(--m-primary)]"
      />
      <span>{label}</span>
    </label>
  );
}
