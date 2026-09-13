"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SOURCE_COLOR } from "@/lib/rewards/mock";
import { epochPoints, type EpochRow } from "@/lib/rewards/types";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Stacked per-epoch bar chart — trading + liquidity + referral points, one bar
 * per week. Built from divs (no chart lib). Hover reveals a tooltip with the
 * epoch's volume and liquidity balance alongside the per-source points.
 */
export function EpochBarChart({
  epochs,
  maxPoints,
}: {
  epochs: EpochRow[];
  maxPoints: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const n = epochs.length;
  const active = hovered !== null ? epochs[hovered] : null;

  return (
    <div className="relative px-[18px] pt-3 pb-1">
      <div className="flex h-[180px] items-end gap-1.5">
        {epochs.map((e, i) => {
          const total = epochPoints(e);
          const h = maxPoints > 0 ? Math.round((total / maxPoints) * 100) : 0;
          const pct = (part: number) =>
            total > 0 ? (part / total) * 100 : 0;
          return (
            <div
              key={e.label}
              className="relative flex flex-1 flex-col items-center justify-end gap-1"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((prev) => (prev === i ? null : prev))}
            >
              <div
                className={cn(
                  "flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-t-[5px] transition-[filter] duration-100 group-hover:brightness-110 motion-reduce:transition-none",
                  e.status === "claimed" && "opacity-40",
                  e.status === "accruing" &&
                    "rounded-[5px] outline outline-[1.5px] outline-offset-[-1px] outline-dashed outline-[color:var(--m-logo)]",
                  hovered === i && "brightness-110",
                )}
                style={{ height: `${h}%` }}
              >
                <div
                  style={{ height: `${pct(e.referralPts)}%`, background: SOURCE_COLOR.referral }}
                />
                <div
                  style={{ height: `${pct(e.liquidityPts)}%`, background: SOURCE_COLOR.liquidity }}
                />
                <div
                  style={{ height: `${pct(e.tradingPts)}%`, background: SOURCE_COLOR.trading }}
                />
              </div>
              <div className="whitespace-nowrap font-mono text-[9.5px] text-[color:var(--m-text-secondary)]">
                {e.label}
              </div>
            </div>
          );
        })}
      </div>

      {active && hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[9px] bg-[color:var(--m-text-primary)] px-3 py-2 text-[11.5px] leading-relaxed text-[color:var(--m-background)] shadow-lg"
          style={{ left: `${((hovered + 0.5) / n) * 100}%`, top: 0 }}
        >
          <div>
            <b className="font-mono">{active.label}</b> · {active.status} ·{" "}
            <b className="font-mono">{fmt(epochPoints(active))} pts</b>
          </div>
          <TipRow color={SOURCE_COLOR.trading} label="Trading" value={active.tradingPts} extra={`$${fmt(active.volumeUsd)} vol`} />
          <TipRow color={SOURCE_COLOR.liquidity} label="Liquidity" value={active.liquidityPts} extra={`$${fmt(active.liquidityUsd)} bal`} />
          <TipRow color={SOURCE_COLOR.referral} label="Referral" value={active.referralPts} />
        </div>
      )}
    </div>
  );
}

function TipRow({
  color,
  label,
  value,
  extra,
}: {
  color: string;
  label: string;
  value: number;
  extra?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
      <b className="ml-auto pl-3 font-mono tabular-nums">{value}</b>
      {extra ? <span className="text-[color:var(--m-background)]/70">· {extra}</span> : null}
    </div>
  );
}
