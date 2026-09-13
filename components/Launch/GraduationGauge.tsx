import { cn } from "@/lib/utils";
import { compactUsd as sharedCompactUsd } from "@/lib/format/compact";

/**
 * Progress toward listing.
 *
 * The figure is QUOTE SPENT BUYING the token, not liquidity locked in resting
 * bids — the prop was `lockedLiquidityUsd` and every label read "locked", which
 * described the old criterion. That one was a 24h level that emptied as bids
 * filled, so a coin that had actually traded showed 0%.
 */
function clampProgress(boughtUsd: number, thresholdUsd: number): number {
  if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return 0;
  const locked = Number.isFinite(boughtUsd) ? Math.max(0, boughtUsd) : 0;
  return Math.min(100, (locked / thresholdUsd) * 100);
}

// Was Intl `notation: "compact"`, which renders 0 as "$0.0" under Node's ICU and
// "$0" in the browser — a hydration mismatch on every server-rendered gauge,
// including its aria-label. See lib/format/compact.ts.
function compactUsd(value: number): string {
  return sharedCompactUsd(Math.max(0, value));
}

export function GraduationGauge({
  boughtUsd,
  thresholdUsd,
  size = "md",
  showAmounts = true,
  variant = "ring",
  className,
}: {
  boughtUsd: number;
  thresholdUsd: number;
  size?: "sm" | "md";
  showAmounts?: boolean;
  variant?: "ring" | "bar";
  className?: string;
}) {
  const progress = clampProgress(boughtUsd, thresholdUsd);
  if (variant === "bar") {
    return (
      <div className={cn("min-w-0", className)} aria-label={`${progress.toFixed(0)}% graduated with ${compactUsd(boughtUsd)} of quote spent buying`}>
        <div className="mb-1.5 flex items-center justify-between gap-2 font-dm-mono text-[9.5px] tabular-nums">
          <span className="text-[var(--m-text-secondary-2)]">Graduation</span>
          <span className="text-[var(--m-primary-fg)]">{Math.floor(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--m-border)]">
          <div className="h-full rounded-full bg-[var(--m-primary)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        {showAmounts && <div className="mt-1.5 flex justify-between gap-2 font-dm-mono text-[9px] tabular-nums text-[var(--m-text-secondary-2)]"><span>{compactUsd(boughtUsd)} bought</span><span>{compactUsd(thresholdUsd)} target</span></div>}
      </div>
    );
  }
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);
  const pixels = size === "sm" ? 42 : 54;

  return (
    <div
      className={cn("flex items-center gap-2.5", className)}
      aria-label={`${progress.toFixed(0)}% graduated with ${compactUsd(boughtUsd)} of quote spent buying`}
    >
      <div className="relative shrink-0" style={{ width: pixels, height: pixels }}>
        <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--m-border)" strokeWidth="3.5" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={progress >= 100 ? "var(--m-success)" : "var(--m-primary)"}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-dm-mono text-[10px] font-medium tabular-nums text-[color:var(--m-text-primary)]">
          {Math.floor(progress)}%
        </span>
      </div>
      {showAmounts && (
        <div className="min-w-0">
          <div className="text-[10px] text-[color:var(--m-text-secondary-2)]">Graduation</div>
          <div className="whitespace-nowrap font-dm-mono text-[10px] tabular-nums text-[color:var(--m-text-primary)]">
            {compactUsd(boughtUsd)} / {compactUsd(thresholdUsd)} bought
          </div>
        </div>
      )}
    </div>
  );
}
