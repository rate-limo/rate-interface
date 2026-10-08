"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";

export type Series = {
  key: string;
  label: string;
  color: string;
  /** Draw a faint area wash under this series (reserve for the one series the story is about). */
  emphasize?: boolean;
  /**
   * SVG strokeDasharray. Colour alone is not enough when two series carry the
   * same values: one line is then drawn exactly on top of the other and the
   * one underneath cannot be seen at all, no matter how far apart their hues
   * are. A dash lets both read, and doubles as a non-colour channel for anyone
   * who cannot separate the hues in the first place.
   */
  dash?: string;
};

type LineChartProps = {
  title: string;
  subtitle?: string;
  /** One row per x position. Each row must have `x` (category label) plus one numeric field per series key. */
  data: Record<string, number | string>[];
  series: Series[];
  /** Value format, kept as a string tag (not a function prop) so this can be
   *  rendered from a server component without crossing the RSC boundary with
   *  a closure. */
  format: "pct" | "usd";
  yTicks?: number;
  /** Fixed y-domain override, e.g. [0, 70]. Defaults to data min/max with padding. */
  yDomain?: [number, number];
  /** What the x-axis categories mean, e.g. "Trade size, as % of pool depth". Shown under the axis and as the table's first column header. */
  xLabel?: string;
};

const FORMATTERS: Record<LineChartProps["format"], (v: number) => string> = {
  pct: (v) => `${v.toFixed(Math.abs(v) < 1 && v !== 0 ? 2 : 1)}%`,
  usd: (v) =>
    Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(2)}`,
};

const WIDTH = 640;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };

/** Later = painted on top. See the comment at the line-drawing call site. */
function paintRank(s: Series) {
  if (s.emphasize) return 2;
  if (s.dash) return 1;
  return 0;
}

export function LineChart({
  title,
  subtitle,
  data,
  series,
  format,
  yTicks = 4,
  yDomain,
  xLabel,
}: LineChartProps) {
  const yFormat = FORMATTERS[format];
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const { min, max } = useMemo(() => {
    if (yDomain) return { min: yDomain[0], max: yDomain[1] };
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of data) {
      for (const s of series) {
        const v = row[s.key];
        if (typeof v === "number") {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    const span = hi - lo || 1;
    return { min: lo - span * 0.08, max: hi + span * 0.12 };
  }, [data, series, yDomain]);

  const xFor = (i: number) =>
    data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW;
  const yFor = (v: number) => plotH - ((v - min) / (max - min || 1)) * plotH;

  const pathFor = (key: string) =>
    data
      .map((row, i) => {
        const v = row[key];
        if (typeof v !== "number") return null;
        return `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");

  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    min + ((max - min) * i) / yTicks,
  );

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="rounded-2xl border border-dark-grey-3 bg-black-300 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-white">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-sm text-dark-grey-1">{subtitle}</p>
          )}
        </div>
        {series.length > 1 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 font-mono-brand text-[11px] text-dark-grey-1 uppercase"
              >
                {/* The swatch has to carry the dash too, or the legend claims a
                    solid line the chart does not draw. */}
                <span
                  className="inline-block h-[2px] w-3.5 rounded-full"
                  style={
                    s.dash
                      ? {
                          backgroundImage: `repeating-linear-gradient(to right, ${s.color} 0 3px, transparent 3px 6px)`,
                        }
                      : { background: s.color }
                  }
                />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative mt-5">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={`${title}. ${subtitle ?? ""}`}
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {yTickValues.map((tv, i) => (
              <g key={i}>
                <line
                  x1={0}
                  x2={plotW}
                  y1={yFor(tv)}
                  y2={yFor(tv)}
                  stroke="var(--color-dark-grey-3)"
                  strokeWidth={1}
                />
                <text
                  x={-10}
                  y={yFor(tv)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="font-mono-brand"
                  style={{ fontSize: 10, fill: "var(--color-dark-grey-1)" }}
                >
                  {yFormat(tv)}
                </text>
              </g>
            ))}

            {/* The wash sits under the emphasised line and runs to the floor of
                the plot, so how much of the chart it covers depends entirely on
                where that line sits. On the impermanent-loss chart Rate is the
                TOP series, so at 0.1 it tinted essentially the whole plot its
                own colour and every other series ended up reading as a shade of
                it. 0.045 still separates "this is the one to watch" without
                repainting the chart. */}
            {series
              .filter((s) => s.emphasize)
              .map((s) => (
                <path
                  key={`${s.key}-area`}
                  d={`${pathFor(s.key)} L${xFor(data.length - 1)},${plotH} L0,${plotH} Z`}
                  fill={s.color}
                  opacity={0.045}
                  stroke="none"
                />
              ))}

            {/* Paint order: solid, then dashed, then the emphasised series.
                A dash only rescues an exact overlap if the dashed line is the
                one ON TOP — drawn underneath it is just as hidden as a solid
                line, which is what happened to v2 under Curve on the
                impermanent-loss chart. Emphasised stays last so the series the
                chart is about is never the one buried. */}
            {[...series]
              .sort((a, b) => paintRank(a) - paintRank(b))
              .map((s) => (
              <path
                key={s.key}
                d={pathFor(s.key) ?? undefined}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                strokeLinecap={s.dash ? "butt" : "round"}
                strokeLinejoin="round"
              />
            ))}

            {series.map((s) => {
              const last = data.length - 1;
              const v = data[last][s.key];
              if (typeof v !== "number") return null;
              return (
                <circle
                  key={`${s.key}-dot`}
                  cx={xFor(last)}
                  cy={yFor(v)}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-black-300)"
                  strokeWidth={2}
                />
              );
            })}

            {data.map((row, i) => (
              <text
                key={i}
                x={xFor(i)}
                y={plotH + 20}
                textAnchor="middle"
                className="font-mono-brand"
                style={{ fontSize: 10, fill: "var(--color-dark-grey-1)" }}
              >
                {String(row.x)}
              </text>
            ))}

            {hoverIndex !== null && (
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={0}
                y2={plotH}
                stroke="var(--color-dark-grey-2)"
                strokeWidth={1}
              />
            )}

            {data.map((_, i) => (
              <rect
                key={i}
                x={xFor(i) - plotW / data.length / 2}
                y={0}
                width={plotW / data.length}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHoverIndex(i)}
                onPointerLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                onFocus={() => setHoverIndex(i)}
                onBlur={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                tabIndex={0}
                role="button"
                aria-label={`${row_aria(data[i])}`}
              />
            ))}
          </g>
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className={clsx(
              "pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-dark-grey-2 bg-black-400 p-3 shadow-lg",
            )}
            style={{
              left: `${((PAD.left + xFor(hoverIndex)) / WIDTH) * 100}%`,
              transform:
                hoverIndex > data.length / 2
                  ? "translateX(-105%)"
                  : "translateX(5%)",
            }}
          >
            <div className="font-mono-brand text-[10px] tracking-wide text-dark-grey-1 uppercase">
              {String(hovered.x)}
            </div>
            <ul className="mt-1.5 space-y-1">
              {series.map((s) => {
                const v = hovered[s.key];
                if (typeof v !== "number") return null;
                return (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="flex items-center gap-1.5 text-dark-grey-1">
                      <span
                        className="inline-block h-[2px] w-3"
                        style={{ background: s.color }}
                      />
                      {s.label}
                    </span>
                    <span className="font-mono-brand font-medium text-white">
                      {yFormat(v)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
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
                <th className="py-2 pr-4 font-normal">{xLabel ?? "Scenario"}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 pr-4 font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-dark-grey-3/50">
                  <td className="py-2 pr-4 text-dark-grey-1">{String(row.x)}</td>
                  {series.map((s) => {
                    const v = row[s.key];
                    return (
                      <td
                        key={s.key}
                        className="py-2 pr-4 font-mono-brand text-white tabular-nums"
                      >
                        {typeof v === "number" ? yFormat(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function row_aria(row: Record<string, number | string>) {
  return Object.entries(row)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}
