"use client";

type Row = {
  label: string;
  color: string;
  lo: number;
  hi: number;
  /** Optional breakdown for the table: gross income and the adverse-selection
   *  (LVR/IL) cost netted against it to produce lo/hi. Shown as extra table
   *  columns only when every row supplies them (or is `costUnmodeled`). */
  gross?: number;
  ilCost?: number;
  /** Set when the row's cost channel is deliberately not modeled — a CEX
   *  market maker's inventory risk has no LVR analogue and the whitepaper
   *  (§4.6) leaves it unquantified. Such a row is shown gross, i.e. credited
   *  a cost of zero, which is the most generous reading available to it; the
   *  table says "not modeled" rather than printing a $0 we can't support. */
  costUnmodeled?: boolean;
};

type RangeChartProps = {
  title: string;
  subtitle?: string;
  data: Row[];
  /** What the x-axis measures, e.g. "Gross LP take per $1M matched volume". */
  xLabel?: string;
  /** Rendered on the title row's right edge — e.g. a view toggle. */
  headerRight?: React.ReactNode;
  /* A `note` slot used to sit here, between the chart and the table, for
     defining a term the chart was built on. Its only caller was LpIncomeCard's
     LVR explainer, and that copy is gone — the quantity is named plainly now,
     so there is nothing left to define. Removed with it rather than left as an
     empty slot carrying a rationale that no longer holds. */
};

const WIDTH = 640;
const ROW_H = 56;
const BAR_H = 24;
const X_TICKS = 4;
// left holds the row labels, drawn end-anchored at x=-14, so the usable label
// width is left-14. At 11px mono (~0.6em advance) the longest label in use
// ("Rate, s = 0 (any depth)", 23 chars) needs ~152px; the previous 168
// gave only 154 and ran the label into the plot.
//
// `right` is a floor only — the real gutter is derived per chart from the
// widest value label, since those are drawn past the end of the longest bar
// and a fixed gutter can't know how wide "$10.3K–$11K" is going to be.
const PAD = { top: 16, right: 20, bottom: 36, left: 196 };
/** Advance width of the 11px mono value labels, in px. */
const MONO_CH = 6.6;

function fmtUsd(v: number) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtRange(lo: number, hi: number) {
  if (lo === hi) return fmtUsd(lo);
  // "-$1K–-$200" reads as a double negative; spell out "to" when both
  // bounds are negative so the sign isn't ambiguous.
  const sep = lo < 0 && hi < 0 ? " to " : "–";
  return `${fmtUsd(lo)}${sep}${fmtUsd(hi)}`;
}

export function RangeChart({ title, subtitle, data, xLabel, headerRight }: RangeChartProps) {
  // A `costUnmodeled` row counts as supplying a breakdown: it renders its own
  // cells rather than gross/ilCost. Without this, one such row would silently
  // drop the Gross and loss columns for every other row in the table.
  const hasBreakdown = data.every(
    (r) => (r.gross !== undefined && r.ilCost !== undefined) || r.costUnmodeled,
  );
  // Reserve exactly enough right gutter for the widest value label, which is
  // drawn 10px past the end of the longest bar. Without this the longest row
  // ("$10.3K–$11K" on the gross chart) paints outside the card's padding.
  const widestValuePx = Math.max(
    ...data.map((r) => fmtRange(r.lo, r.hi).length * MONO_CH),
  );
  const padRight = Math.max(PAD.right, Math.ceil(widestValuePx) + 18);
  const plotW = WIDTH - PAD.left - padRight;
  const plotH = data.length * ROW_H;
  const height = PAD.top + PAD.bottom + plotH;
  const domainMin = Math.min(0, ...data.map((d) => d.lo)) * 1.08;
  const domainMax = Math.max(0, ...data.map((d) => d.hi)) * 1.08;

  const xFor = (v: number) => ((v - domainMin) / (domainMax - domainMin)) * plotW;
  const zeroX = xFor(0);

  const xTickValues = Array.from(
    { length: X_TICKS + 1 },
    (_, i) => domainMin + ((domainMax - domainMin) * i) / X_TICKS,
  );

  return (
    <div className="rounded-2xl border border-dark-grey-3 bg-black-300 p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 className="text-base font-medium text-white">{title}</h3>
          {headerRight}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-dark-grey-1">{subtitle}</p>
        )}
      </div>

      <div className="mt-5">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={`${title}. ${subtitle ?? ""}`}
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {xTickValues.map((tv, i) => (
              <g key={i}>
                <line
                  x1={xFor(tv)}
                  x2={xFor(tv)}
                  y1={0}
                  y2={plotH}
                  stroke="var(--color-dark-grey-3)"
                  strokeWidth={1}
                />
                <text
                  x={xFor(tv)}
                  y={plotH + 20}
                  textAnchor="middle"
                  className="font-mono-brand"
                  style={{ fontSize: 10, fill: "var(--color-dark-grey-1)" }}
                >
                  {fmtUsd(tv)}
                </text>
              </g>
            ))}
            <line
              x1={zeroX}
              x2={zeroX}
              y1={0}
              y2={plotH}
              stroke="var(--color-dark-grey-2)"
              strokeWidth={1}
            />
            {data.map((row, i) => {
              const y = i * ROW_H + ROW_H / 2;
              // The bound closer to zero anchors the solid segment; the
              // farther bound (if different) extends it as a lighter tint.
              // This handles both positive rows (anchored at 0, growing
              // right) and the negative CEX-retail row (anchored at 0,
              // growing left) with the same logic.
              const near = Math.abs(row.lo) <= Math.abs(row.hi) ? row.lo : row.hi;
              const far = near === row.lo ? row.hi : row.lo;
              const xNear = xFor(near);
              const xFar = xFor(far);
              const labelX = Math.max(xNear, xFar) + 10;
              return (
                <g key={row.label}>
                  <text
                    x={-14}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="font-mono-brand"
                    style={{ fontSize: 11, fill: "var(--color-dark-grey-1)" }}
                  >
                    {row.label}
                  </text>
                  <rect
                    x={Math.min(zeroX, xNear)}
                    y={y - BAR_H / 2}
                    width={Math.max(Math.abs(xNear - zeroX), 2)}
                    height={BAR_H}
                    fill={row.color}
                  />
                  {far !== near && (
                    <rect
                      x={Math.min(xNear, xFar)}
                      y={y - BAR_H / 2}
                      width={Math.abs(xFar - xNear)}
                      height={BAR_H}
                      fill={row.color}
                      opacity={0.4}
                    />
                  )}
                  <text
                    x={labelX}
                    y={y}
                    dominantBaseline="middle"
                    className="font-mono-brand tabular-nums"
                    style={{ fontSize: 11, fontWeight: 500, fill: "var(--color-white)" }}
                  >
                    {fmtRange(row.lo, row.hi)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {xLabel && (
        <p className="mt-2 text-center font-mono-brand text-[10px] tracking-wide text-dark-grey-1 uppercase">
          {xLabel}
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer font-mono-brand text-[11px] tracking-wide text-dark-grey-1 uppercase hover:text-purple-700 dark:hover:text-purple-300">
          View as table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-dark-grey-3 text-dark-grey-1">
                <th className="py-2 pr-4 font-normal">Venue</th>
                {hasBreakdown && (
                  <>
                    <th className="py-2 pr-4 font-normal">Gross</th>
                    {/* Not "Loss from LVR". The figure in this column is computed
                        by sim.py's il_standard/v3_il_approx -- impermanent loss,
                        measured against holding -- so naming it LVR made the header
                        assert a benchmark the number does not use.
                        The acronym is now off the page entirely: the note that
                        defined it is gone and the subtitle describes the mechanism
                        in a clause instead. This header was already the plain
                        version and needed no change, which is the argument for
                        having written it this way. It deliberately echoes the
                        "LP loss when the market moves" chart above, because it is
                        the same quantity. */}
                    <th className="py-2 pr-4 font-normal">Loss when price moves</th>
                  </>
                )}
                <th className="py-2 pr-4 font-normal">
                  {hasBreakdown ? "Net" : (xLabel ?? "Value")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.label} className="border-b border-dark-grey-3/50">
                  <td className="py-2 pr-4 text-dark-grey-1">{row.label}</td>
                  {hasBreakdown && (
                    <>
                      <td className="py-2 pr-4 font-mono-brand text-dark-grey-1 tabular-nums">
                        {row.costUnmodeled
                          ? fmtRange(row.lo, row.hi)
                          : fmtUsd(row.gross!)}
                      </td>
                      <td className="py-2 pr-4 font-mono-brand text-dark-grey-1 tabular-nums">
                        {row.costUnmodeled ? "not modeled" : fmtUsd(row.ilCost!)}
                      </td>
                    </>
                  )}
                  <td className="py-2 pr-4 font-mono-brand text-white tabular-nums">
                    {fmtRange(row.lo, row.hi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
