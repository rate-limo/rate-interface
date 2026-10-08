"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProtocolFlywheelData } from "@/lib/iter/protocolMetrics";

/* ─── Why a Sankey-style flow instead of five coloured cards ──────────────────
   The five revenue rows are one measure ranked by share, so the encoding job is
   MAGNITUDE, not identity: a sequential single-hue ramp (darkest = biggest
   share) is the correct form, and it dodges the categorical-palette problem
   outright -- the Monet ramps are deliberately low-chroma, so five distinct hues
   from them fail CVD separation (validated: worst adjacent pair ΔE 14.6 normal
   vision, below the 15 floor). Ribbon THICKNESS carries the share, ramp step
   reinforces the order, and every row keeps a direct label, so identity is never
   colour-alone. Flow narrative: primary (inflow) → warning (the hub) → success
   (what leaves), plus a dashed return arc that closes the loop.

   Geometry is arithmetic, not measured per-card: the source rows are a fixed
   height with a fixed gap and the columns are percentage-width, so every y is
   computable and only the container WIDTH needs a ResizeObserver. That keeps
   1 SVG unit = 1px (so the <animateMotion> particles stay circular) with one
   measurement instead of eight getBoundingClientRect reads that would have to
   re-run on font load and text wrap. */

const SRC_H = 76;
const SRC_GAP = 8;
const HUB_H = 180;
const OUT_H = 128;
const OUT_GAP = 14;
const RETURN_BAND = 46; // strip below the columns that the return arc rides

/* Column edges as fractions of the measured width. These MUST match the grid
   template on the desktop row below, or the ribbons detach from the cards. */
const X_LEFT_END = 0.26;
const X_HUB_START = 0.375;
const X_HUB_END = 0.625;
const X_RIGHT_START = 0.74;

const HUB_SPAN = 132; // total ribbon thickness where the inflows meet the hub
const SRC_SPAN = 132; // total ribbon thickness at the source edge
const OUT_SPAN = 120; // hub-side thickness of the full outflow
const OUT_TARGET_SPAN = 96;
const MIN_T = 3.5;

/* Sequential steps: percent of the hue mixed toward the section surface. Mixing
   toward the surface (not toward transparent) keeps the ramp monotonic in BOTH
   modes with one formula. The range is compressed so even the 5th ribbon -- a
   3%-share hairline -- stays visible against a near-white light surface. */
const RAMP = [88, 74, 62, 52, 44];

const tint = (token: string, pct: number) =>
  `color-mix(in oklab, var(${token}) ${pct}%, var(--m-surface))`;

/* The frame is only as tall as the rows it has to hold (floored by the hub and
   the outflow stack). Pinning it to the five-row height left ~140px of dead air
   in the zero state -- which is the state the page shows while the indexer is
   down, i.e. the one that must not look broken. */
function flowHeight(rowCount: number) {
  return Math.max(rowCount * SRC_H + (rowCount - 1) * SRC_GAP, OUT_H * 2 + OUT_GAP, HUB_H);
}

/* Hand-rolled rather than Intl `notation: "compact"`: that path disagrees
   between Node's ICU and the browser's on exactly-round values (server renders
   "$6K", the client "$6.0K") and this is a client component with an SSR pass, so
   the difference lands as a hydration error. Fixed digits are deterministic. */
const COMPACT_UNITS: ReadonlyArray<[number, string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

function compactUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (const [scale, suffix] of COMPACT_UNITS) {
    if (abs >= scale) {
      const scaled = abs / scale;
      return `${sign}$${scaled.toFixed(scaled < 100 ? 1 : 0)}${suffix}`;
    }
  }
  return `${sign}$${abs.toFixed(abs < 100 ? 2 : 0)}`;
}

function exactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/* A Sankey link: two mirrored cubics joined into a closed band. */
function ribbonPath(x0: number, y0: number, t0: number, x1: number, y1: number, t1: number) {
  const top0 = y0 - t0 / 2;
  const bottom0 = y0 + t0 / 2;
  const top1 = y1 - t1 / 2;
  const bottom1 = y1 + t1 / 2;
  const mid = (x0 + x1) / 2;
  return (
    `M${x0} ${top0} C${mid} ${top0} ${mid} ${top1} ${x1} ${top1} ` +
    `L${x1} ${bottom1} C${mid} ${bottom1} ${mid} ${bottom0} ${x0} ${bottom0} Z`
  );
}

/* The centreline of that band — the track a particle travels. */
function spinePath(x0: number, y0: number, x1: number, y1: number) {
  const mid = (x0 + x1) / 2;
  return `M${x0} ${y0} C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
}

/* One measurement of the flow container's width -- but read off the node's live
   rect rather than the observer entry, and watch the PARENT as well as the node
   itself. The flow container is display:none below 1050px, where its own
   contentRect is 0x0 and a restored-to-visible element does not reliably deliver
   a fresh entry; the always-displayed parent changes size whenever the media
   query flips, so its callback is what recovers the width. The window listener
   is the belt-and-braces for the same crossing. */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Measured before queueing the update: an updater may run more than once.
    const read = () => {
      const next = node.getBoundingClientRect().width;
      setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    window.addEventListener("resize", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);

  return [ref, width] as const;
}

interface FlowRow {
  label: string;
  value: string;
  note: string;
  title: string;
  /** Renormalised over the displayed rows only — geometry must close. */
  share: number;
}

/* The zero-state is the state this actually renders whenever the indexer is
   unreachable (getProtocolFlywheelData swallows the error and returns zeros), so
   it gets real placeholder rows rather than NaN path coordinates: the diagram
   still explains the mechanism, the ribbons go recessive, the particles stop,
   and every number reads "—" instead of a fabricated $0. */
function buildRows(data: ProtocolFlywheelData): { rows: FlowRow[]; hasFlow: boolean } {
  const sources = data.pairSources.filter((source) => source.weeklyRevenueUsd > 0);
  const hasFlow = data.weeklyRevenueUsd > 0 && sources.length > 0;

  if (!hasFlow) {
    return {
      hasFlow: false,
      rows: Array.from({ length: 3 }, () => ({
        label: "Awaiting volume",
        value: "—",
        note: "no pair revenue yet",
        title: "No pair volume recorded for this period",
        share: 1 / 3,
      })),
    };
  }

  const shown = sources.slice(0, 5);
  const total = shown.reduce((sum, source) => sum + source.weeklyRevenueUsd, 0);

  return {
    hasFlow: true,
    rows: shown.map((source) => ({
      label: source.pair,
      value: compactUsd(source.weeklyRevenueUsd),
      note: `${source.sharePct.toFixed(source.sharePct < 1 ? 1 : 0)}% of revenue`,
      title: `${source.pair} · ${exactUsd(source.weeklyRevenueUsd)} per week`,
      share: total > 0 ? source.weeklyRevenueUsd / total : 1 / shown.length,
    })),
  };
}

export function ProtocolFlywheel({ data }: { data: ProtocolFlywheelData }) {
  const [flowRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const { rows, hasFlow } = useMemo(() => buildRows(data), [data]);

  const burnShare = hasFlow
    ? Math.min(1, Math.max(0, data.buybackBurnUsd / data.weeklyRevenueUsd))
    : 0;

  const flowH = flowHeight(rows.length);
  const svgH = flowH + RETURN_BAND;
  const outTop = (flowH - (OUT_H * 2 + OUT_GAP)) / 2;
  const burnCy = outTop + OUT_H / 2;

  const geometry = useMemo(() => {
    if (width <= 0) return null;

    const xSource = width * X_LEFT_END;
    const xHubLeft = width * X_HUB_START;
    const xHubRight = width * X_HUB_END;
    const xTarget = width * X_RIGHT_START;

    const colTop = (flowH - (rows.length * SRC_H + (rows.length - 1) * SRC_GAP)) / 2;

    let stacked = (flowH - HUB_SPAN) / 2;
    const inflows = rows.map((row, index) => {
      const hubThickness = Math.max(MIN_T, row.share * HUB_SPAN);
      const hubCenter = stacked + hubThickness / 2;
      stacked += hubThickness;
      const sourceCenter = colTop + index * (SRC_H + SRC_GAP) + SRC_H / 2;
      /* Capped to the card it leaves: at one source share is 1.0, and an
         uncapped SRC_SPAN band (132) would be wider than the 76px card, reading
         as a slab that swallows it. */
      const sourceThickness = Math.min(SRC_H - 12, Math.max(MIN_T, row.share * SRC_SPAN));
      return {
        band: ribbonPath(xSource, sourceCenter, sourceThickness, xHubLeft, hubCenter, hubThickness),
        spine: spinePath(xSource, sourceCenter, xHubLeft, hubCenter),
      };
    });

    const burnHubThickness = Math.max(MIN_T, burnShare * OUT_SPAN);
    const burnTargetThickness = Math.max(MIN_T, burnShare * OUT_TARGET_SPAN);

    return {
      inflows,
      burn: {
        band: ribbonPath(
          xHubRight,
          flowH / 2,
          burnHubThickness,
          xTarget,
          burnCy,
          burnTargetThickness,
        ),
        spine: spinePath(xHubRight, flowH / 2, xTarget, burnCy),
      },
      /* Backing per Rate is derived from the burn, not a second cash flow — a
         dashed hop says "consequence of", where a ribbon would claim "value
         moves here" and double-count the revenue. */
      derive: `M${width * 0.87} ${outTop + OUT_H + 1} L${width * 0.87} ${outTop + OUT_H + OUT_GAP - 1}`,
      /* The loop that makes it a flywheel: deeper backing → tighter books →
         more volume → more fees, back into the left column. */
      returnArc:
        `M${width * 0.87} ${outTop + OUT_H * 2 + OUT_GAP + 4} ` +
        `C${width * 0.87} ${flowH + 34} ${width * 0.7} ${flowH + 38} ${width * 0.5} ${flowH + 38} ` +
        `C${width * 0.3} ${flowH + 38} ${width * 0.13} ${flowH + 34} ${width * 0.13} ${flowH + 6}`,
    };
  }, [width, rows, burnShare, flowH, outTop, burnCy]);

  /* SMIL <animateMotion> does not reliably re-read a patched `path`, so the
     particles are keyed on the rounded width and remount when the layout moves. */
  const geometryKey = Math.round(width);
  const dim = (index: number) => (active === null || active === index ? 1 : 0.24);

  return (
    <section className="mt-4 rounded-[28px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5 text-[color:var(--m-text-primary)] shadow-[inset_0_1px_var(--m-text-primary-12)] min-[700px]:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.035em]">Protocol Flywheel</h2>
        <span className="font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase">
          Pair volume × {(data.feeRate * 100).toFixed(2)}% fee
        </span>
      </div>

      {/* ── Desktop: the flow diagram ────────────────────────────────────── */}
      <div
        ref={flowRef}
        className="relative mt-6 hidden min-[1050px]:block"
        style={{ height: svgH }}
      >
        {geometry && (
          <svg
            aria-hidden
            viewBox={`0 0 ${width} ${svgH}`}
            width={width}
            height={svgH}
            className="pointer-events-none absolute inset-0"
          >
            <defs>
              {rows.map((_, index) => (
                <linearGradient key={index} id={`iter-flow-in-${index}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={tint("--m-primary", RAMP[index] ?? 44)} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={tint("--m-primary", RAMP[index] ?? 44)} stopOpacity="0.5" />
                </linearGradient>
              ))}
              <linearGradient id="iter-flow-out" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={tint("--m-success", 78)} stopOpacity="0.9" />
                <stop offset="100%" stopColor={tint("--m-success", 78)} stopOpacity="0.45" />
              </linearGradient>
              <marker
                id="iter-flow-arrow"
                viewBox="0 0 8 8"
                refX="4"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M1 1 L7 4 L1 7 Z" fill="var(--m-text-secondary)" opacity="0.45" />
              </marker>
            </defs>

            <g opacity={hasFlow ? 1 : 0.4}>
              {geometry.inflows.map((flow, index) => (
                <g key={index} style={{ opacity: dim(index), transition: "opacity 160ms" }}>
                  <path d={flow.band} fill={`url(#iter-flow-in-${index})`} />
                  {hasFlow && (
                    <circle
                      key={`${geometryKey}-in-${index}`}
                      className="iter-flow-particle"
                      r="2.4"
                      fill="var(--m-primary)"
                      opacity="0.75"
                    >
                      <animateMotion
                        dur="2.8s"
                        begin={`${index * 0.42}s`}
                        repeatCount="indefinite"
                        path={flow.spine}
                      />
                    </circle>
                  )}
                </g>
              ))}

              <path d={geometry.burn.band} fill="url(#iter-flow-out)" />
              {hasFlow && (
                <circle
                  key={`${geometryKey}-out`}
                  className="iter-flow-particle"
                  r="2.8"
                  fill="var(--m-success)"
                  opacity="0.7"
                >
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={geometry.burn.spine} />
                </circle>
              )}

              <path
                d={geometry.derive}
                stroke="var(--m-success)"
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.4"
                fill="none"
              />

              <path
                d={geometry.returnArc}
                stroke="var(--m-text-secondary)"
                strokeWidth="1"
                strokeDasharray="5 4"
                opacity="0.3"
                fill="none"
                markerEnd="url(#iter-flow-arrow)"
              />
              {hasFlow && (
                <circle
                  key={`${geometryKey}-loop`}
                  className="iter-flow-particle"
                  r="2.2"
                  fill="var(--m-accent)"
                  opacity="0.6"
                >
                  <animateMotion dur="5.2s" repeatCount="indefinite" path={geometry.returnArc} />
                </circle>
              )}
            </g>
          </svg>
        )}

        {/* Column widths are the X_* fractions above, in the same order. */}
        <div
          className="grid h-full items-start"
          style={{
            gridTemplateColumns: "26% 11.5% 25% 11.5% 26%",
            gridTemplateRows: `${flowH}px ${RETURN_BAND}px`,
          }}
        >
          <div className="flex flex-col justify-center gap-2" style={{ height: flowH }}>
            {rows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                title={row.title}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex items-center gap-3 overflow-hidden rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 transition-colors",
                  active === index && "border-[color:var(--m-primary-300)]",
                )}
                style={{ height: SRC_H }}
              >
                {/* The rank rail repeats the ribbon's ramp step next to the label,
                    so the ordering survives a colour-blind or greyscale read. */}
                <span
                  aria-hidden
                  className="h-9 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: tint("--m-primary", RAMP[index] ?? 44) }}
                />
                <div className="min-w-0">
                  <div className="truncate font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
                    {row.label}
                  </div>
                  <div
                    className={cn(
                      "font-dm-mono text-lg font-medium tracking-[-0.04em] tabular-nums",
                      /* An em dash in DM Mono at this weight reads as a filled
                         bar -- i.e. as data. Muted, it reads as absence. */
                      !hasFlow && "text-[color:var(--m-text-secondary)]",
                    )}
                  >
                    {row.value}
                    {hasFlow && (
                      <span className="ml-1 text-xs font-normal text-[color:var(--m-text-secondary)]">/wk</span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[color:var(--m-text-secondary)]">{row.note}</div>
                </div>
              </div>
            ))}
          </div>

          <div aria-hidden />

          <div
            className="flex flex-col items-center justify-center rounded-[24px] border border-[color:var(--m-warning-300)] bg-[color:var(--m-surface-2)] text-center shadow-[inset_0_1px_var(--m-text-primary-12)]"
            style={{ height: HUB_H, marginTop: (flowH - HUB_H) / 2 }}
          >
            <div className="flex items-center justify-center gap-2 font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
              <PulseDot token="--m-warning" />
              Weekly Revenue
            </div>
            <div
              className={cn(
                "mt-3 font-dm-mono text-5xl font-medium tracking-[-0.065em] tabular-nums",
                !hasFlow && "text-[color:var(--m-text-secondary)]",
              )}
            >
              {hasFlow ? compactUsd(data.weeklyRevenueUsd) : "—"}
            </div>
            <div className="mt-2 text-sm text-[color:var(--m-text-secondary)]">
              {hasFlow
                ? `${data.pairSources.length} pair revenue source${data.pairSources.length === 1 ? "" : "s"}`
                : "No revenue recorded"}
            </div>
          </div>

          <div aria-hidden />

          <div
            className="flex flex-col justify-center"
            style={{ height: flowH, gap: OUT_GAP }}
          >
            <OutflowCard
              label="Buyback & Burn"
              value={
                hasFlow
                  ? `${data.buybackBurnIter.toLocaleString("en-US", { maximumFractionDigits: 2 })} Rate`
                  : "—"
              }
              note={
                hasFlow
                  ? `${data.periodLabel} · ${compactUsd(data.buybackBurnUsd)} · ${(burnShare * 100).toFixed(0)}% of revenue`
                  : "Awaiting revenue"
              }
              muted={!hasFlow}
            />
            <OutflowCard
              label="Backing per Rate"
              value={hasFlow ? `$${data.backingPerIter.toFixed(2)}` : "—"}
              note={hasFlow ? `${data.annualDeflationPct.toFixed(2)}% annual deflation` : "Awaiting revenue"}
              emphasis
              muted={!hasFlow}
            />
          </div>

          <div className="col-span-5 flex items-center justify-center">
            <span className="rounded-full bg-[color:var(--m-surface)] px-3 font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase">
              Deeper backing → tighter books → more volume
            </span>
          </div>
        </div>
      </div>

      {/* ── Below 1050px: the same story as a proportional bar + chain ────── */}
      <div className="mt-5 space-y-4 min-[1050px]:hidden">
        <div>
          <p className="mb-2 text-center font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
            Revenue sources
          </p>
          {/* 2px surface gaps between segments: a sequential ramp is only
              readable as an order if the segments don't bleed together. */}
          <div className="flex h-7 gap-[2px] overflow-hidden rounded-lg">
            {rows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                title={row.title}
                className="h-full first:rounded-l-lg last:rounded-r-lg"
                style={{
                  /* Shares sum to 100%, and the 2px gaps are extra -- so the row
                     overflows and flex shrinks every segment, which silently
                     un-proportions the bar (worst on the smallest share). Each
                     segment gives back its own slice of the gap budget instead,
                     and shrink is off so the widths stay exactly the shares. */
                  flexBasis: `calc(${row.share * 100}% - ${(2 * (rows.length - 1)) / rows.length}px)`,
                  flexGrow: 0,
                  flexShrink: 0,
                  backgroundColor: tint("--m-primary", RAMP[index] ?? 44),
                  opacity: hasFlow ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          {/* Legend order matches the bar order exactly. */}
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {rows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                className="flex items-center gap-1 text-[11px] text-[color:var(--m-text-secondary)]"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tint("--m-primary", RAMP[index] ?? 44) }}
                />
                <span className="text-[color:var(--m-text-primary)]">{row.label}</span>
                <span className="font-dm-mono tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <ChainArrow />

        <div className="rounded-2xl border border-[color:var(--m-warning-300)] bg-[color:var(--m-surface-2)] px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2 font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
            <PulseDot token="--m-warning" />
            Weekly Revenue
          </div>
          <p
            className={cn(
              "mt-1 font-dm-mono text-2xl font-medium tracking-[-0.05em] tabular-nums",
              !hasFlow && "text-[color:var(--m-text-secondary)]",
            )}
          >
            {hasFlow ? compactUsd(data.weeklyRevenueUsd) : "—"}
          </p>
        </div>

        <ChainArrow />

        <OutflowCard
          label="Buyback & Burn"
          value={
            hasFlow
              ? `${data.buybackBurnIter.toLocaleString("en-US", { maximumFractionDigits: 2 })} Rate`
              : "—"
          }
          note={
            hasFlow
              ? `${data.periodLabel} · ${compactUsd(data.buybackBurnUsd)} · ${(burnShare * 100).toFixed(0)}% of revenue`
              : "Awaiting revenue"
          }
          muted={!hasFlow}
        />

        <ChainArrow />

        <OutflowCard
          label="Backing per Rate"
          value={hasFlow ? `$${data.backingPerIter.toFixed(2)}` : "—"}
          note={hasFlow ? `${data.annualDeflationPct.toFixed(2)}% annual deflation` : "Awaiting revenue"}
          emphasis
          muted={!hasFlow}
        />
      </div>

      <p className="mt-6 font-dm-mono text-[10px] tracking-[0.04em] text-[color:var(--m-text-secondary)]">
        Source: Rate pair aggregates · Admin protocol configuration
        {data.isFallback ? " · data source unavailable" : ""}
      </p>
    </section>
  );
}

function PulseDot({ token }: { token: string }) {
  return (
    <span aria-hidden className="relative flex items-center justify-center">
      <span className="size-2 rounded-full" style={{ backgroundColor: `var(${token})` }} />
      <span
        className="iter-pulse-ring absolute size-2 rounded-full"
        style={{ backgroundColor: `var(${token})` }}
      />
      <span
        className="iter-pulse-ring-delayed absolute size-2 rounded-full"
        style={{ backgroundColor: `var(${token})` }}
      />
    </span>
  );
}

function OutflowCard({
  label,
  value,
  note,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[22px] border border-[color:var(--m-success-300)] bg-[color:var(--m-surface-2)] px-4 py-4 text-center min-[1050px]:py-0",
        emphasis && "ring-1 ring-[color:var(--m-success-300)]",
      )}
      style={{ minHeight: OUT_H }}
    >
      <div className="flex items-center justify-center gap-2 font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
        <PulseDot token="--m-success" />
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-dm-mono text-2xl font-medium tracking-[-0.05em] tabular-nums",
          emphasis && "text-[color:var(--m-success-fg)]",
          muted && "text-[color:var(--m-text-secondary)]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[color:var(--m-text-secondary)]">{note}</div>
    </div>
  );
}

function ChainArrow() {
  return (
    <div className="flex justify-center">
      <svg aria-hidden width="24" height="28" viewBox="0 0 24 28" fill="none">
        <line
          x1="12"
          y1="0"
          x2="12"
          y2="21"
          stroke="var(--m-text-secondary)"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.35"
        />
        <path d="M12 22 L8 16 L16 16 Z" fill="var(--m-text-secondary)" opacity="0.35" />
        <circle className="iter-flow-particle" r="2.4" fill="var(--m-primary)" opacity="0.6">
          <animateMotion dur="1.6s" repeatCount="indefinite" path="M12 0 L12 21" />
        </circle>
      </svg>
    </div>
  );
}
