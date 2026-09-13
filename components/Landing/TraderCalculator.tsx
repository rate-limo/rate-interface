"use client";

import { useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { CHART_SERIES, traderFeeRates, traderTotalCost } from "@/lib/simData";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 30 };

function fmtUsdCompact(v: number) {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${v.toFixed(0)}`;
}

const ROWS = [
  {
    venue: "Uniswap v2",
    key: "v2" as const,
    color: CHART_SERIES.v2.color,
    formula: "0.30% fee + price impact",
  },
  {
    venue: "Uniswap v3",
    key: "v3" as const,
    color: CHART_SERIES.v3.color,
    formula: "0.30% fee + price impact",
  },
  {
    venue: "Curve",
    key: "curve" as const,
    color: CHART_SERIES.curve.color,
    formula: "0.04% fee + price impact",
  },
  {
    venue: "Iter",
    key: "iter" as const,
    color: CHART_SERIES.iter.color,
    formula: `${(traderFeeRates.iter * 100).toFixed(2)}% taker fee + price impact`,
  },
];

const WIDTH = 640;
const HEIGHT = 280;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };
const TICKS = 4;
const SAMPLES = 16;

function TradeChart({ amount }: { amount: number }) {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  // Same "show a bit past the current trade" behavior as the LP chart.
  const xMax = Math.max(amount * 1.4, 100000);
  const xFor = (v: number) => (v / xMax) * plotW;

  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => (xMax * i) / SAMPLES);
  const curves = ROWS.map((row) => ({
    ...row,
    points: samples.map((x) => ({ x, cost: traderTotalCost(row.key, x) })),
  }));

  const yMax =
    Math.max(...curves.flatMap((c) => c.points.map((p) => p.cost)), 1) * 1.08;
  const yFor = (v: number) => plotH - (v / yMax) * plotH;

  const xTicks = Array.from({ length: TICKS + 1 }, (_, i) => (xMax * i) / TICKS);
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => (yMax * i) / TICKS);
  const markerX = Math.min(amount, xMax);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full overflow-visible"
      role="img"
      aria-label="Total trading cost vs. trade size, for Uniswap, Curve, and Iter"
    >
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {yTicks.map((tv, i) => (
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
              {fmtUsdCompact(tv)}
            </text>
          </g>
        ))}
        {xTicks.map((tv, i) => (
          <text
            key={i}
            x={xFor(tv)}
            y={plotH + 20}
            textAnchor="middle"
            className="font-mono-brand"
            style={{ fontSize: 10, fill: "var(--color-dark-grey-1)" }}
          >
            {fmtUsdCompact(tv)}
          </text>
        ))}

        {curves.map((curve) =>
          curve.points.slice(0, -1).map((p, i) => {
            const next = curve.points[i + 1];
            return (
              <motion.line
                key={`${curve.venue}-${i}`}
                animate={{
                  x1: xFor(p.x),
                  y1: yFor(p.cost),
                  x2: xFor(next.x),
                  y2: yFor(next.cost),
                }}
                transition={SPRING}
                stroke={curve.color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          }),
        )}

        {amount > 0 && (
          <motion.line
            y1={0}
            y2={plotH}
            animate={{ x1: xFor(markerX), x2: xFor(markerX) }}
            transition={SPRING}
            stroke="var(--color-dark-grey-2)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        )}

        {amount > 0 &&
          ROWS.map((row) => (
            <motion.circle
              key={row.venue}
              animate={{
                cx: xFor(markerX),
                cy: yFor(traderTotalCost(row.key, markerX)),
              }}
              transition={SPRING}
              r={4.5}
              fill={row.color}
              stroke="var(--color-black-300)"
              strokeWidth={2}
            />
          ))}
      </g>
    </svg>
  );
}

export function TraderCalculator() {
  const [amount, setAmount] = useState(50000);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  return (
    <div>
      <p className="max-w-2xl text-sm leading-relaxed text-dark-grey-1">
        This is the trade-side counterpart above: the same protocol fee plus
        price-impact math behind the &ldquo;Slippage by trade size&rdquo;
        chart, run on your own trade size instead of the chart&apos;s fixed
        grid. Type in a trade size and every figure below recomputes live.
      </p>

      <label className="mt-6 block">
        <span className="font-mono-brand text-[11px] tracking-[0.16em] text-purple-700 dark:text-purple-300 uppercase">
          Your trade size
        </span>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dark-grey-3 bg-black-400 px-4 py-3 focus-within:border-purple-400">
          <span className="font-mono-brand text-lg text-dark-grey-1">$</span>
          <input
            type="number"
            min={0}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.valueAsNumber)}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full bg-transparent font-mono-brand text-lg text-white outline-none"
            aria-label="Your trade size"
          />
        </div>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROWS.map((row) => (
          <div
            key={row.venue}
            className="rounded-xl border border-dark-grey-3 bg-black-400 p-5"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-[10px] w-[10px] rounded-full"
                style={{ background: row.color }}
              />
              <span className="font-display text-base font-medium text-white">
                {row.venue}
              </span>
            </div>
            <p className="mt-2 font-mono-brand text-[11px] leading-relaxed text-dark-grey-1">
              {row.formula}
            </p>
            <div className="mt-3 font-mono-brand text-2xl font-medium text-purple-400">
              <NumberFlow
                value={traderTotalCost(row.key, safeAmount)}
                format={{ style: "currency", currency: "USD", maximumFractionDigits: 2 }}
              />
            </div>
            <p className="mt-1 font-mono-brand text-[11px] text-dark-grey-1">
              total cost, this trade
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dark-grey-3 bg-black-400 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 className="font-display text-base font-medium text-white">
            Total cost by trade size
          </h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {ROWS.map((row) => (
              <li
                key={row.venue}
                className="flex items-center gap-1.5 font-mono-brand text-[11px] text-dark-grey-1 uppercase"
              >
                <span
                  className="inline-block h-[2px] w-3.5 rounded-full"
                  style={{ background: row.color }}
                />
                {row.venue}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-1 text-sm text-dark-grey-1">
          Protocol fee plus price impact, at every trade size up to a bit past
          yours. The dashed marker is your current number above.
        </p>
        <div className="mt-5">
          <TradeChart amount={safeAmount} />
        </div>
        <p className="mt-2 text-center font-mono-brand text-[10px] tracking-wide text-dark-grey-1 uppercase">
          Trade size (USDC)
        </p>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dark-grey-1">
        &ldquo;Total cost&rdquo; is the protocol fee plus price impact &mdash;
        what you actually lose versus the pre-trade price, not counting gas.
        Price impact between the chart&apos;s grid points is linearly
        interpolated from the same simulation as the slippage chart above,
        on the same $1M pool-depth basis; it isn&apos;t re-simulated for your
        exact number. Iter&apos;s cost stays near zero until your trade
        starts walking into wider-tolerance depth &mdash; if the book can&apos;t
        fill you at all, your money comes back instead of filling at a worse
        price.
      </p>
    </div>
  );
}
