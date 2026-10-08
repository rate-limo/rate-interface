import type { FillProgress } from "@/lib/orders/fillProgress";

/**
 * A small ring in front of the Filled percentage, so fill progress reads at a
 * glance without parsing "37.50%".
 *
 * It never closes on an open order. A row here is one the chain has not
 * cleared, and `formatFillProgress` already refuses to print 100% for the same
 * reason, so the arc is capped just short of a full circle. An order with no
 * known progress draws a dashed empty ring, matching the "—" beside it. An
 * approximate figure (the float columns, pre-0031 orders) draws the same arc,
 * slightly fainter.
 */
// Percent of the circle. 90, not 97: with round caps a 97% arc renders closed and
// reads as "done", which an open order never is.
const MAX_SWEEP = 90;

export function FillRing({ progress, size = 14 }: { progress: FillProgress; size?: number }) {
  const stroke = 2.25;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const unknown = progress.kind === "unknown";
  const pct = unknown ? 0 : Math.max(0, Math.min(progress.percent, MAX_SWEEP));
  // A sliver for any real fill, so 0.3% does not look like nothing happened.
  const shown = pct > 0 && pct < 4 ? 4 : pct;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      data-testid="fill-ring"
      data-percent={unknown ? "" : pct.toFixed(2)}
      className="inline-block shrink-0 align-[-2px]"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--m-border)"
        strokeWidth={stroke}
        strokeDasharray={unknown ? "2 2" : undefined}
      />
      {shown > 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--m-primary)"
          strokeOpacity={progress.kind === "approximate" ? 0.6 : 1}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </svg>
  );
}
