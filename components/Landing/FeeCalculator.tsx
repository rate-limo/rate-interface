"use client";

import { useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { feeRates, CHART_SERIES } from "@/lib/simData";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 30 };

const ROW_COLORS: Record<string, string> = {
  "Uniswap v2 / v3": CHART_SERIES.v2.color,
  Curve: CHART_SERIES.curve.color,
  "Iter": CHART_SERIES.iter.color,
};

// Compact K-notation for chart axis ticks, where space is tight.
function fmtUsdCompact(v: number) {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${v.toFixed(0)}`;
}

const WIDTH = 640;
const HEIGHT = 280;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };
const TICKS = 4;

function FeeChart({ amount }: { amount: number }) {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  // The chart always shows a bit past the current amount, so moving the
  // number up extends the lines rather than pushing the marker off the edge.
  const xMax = Math.max(amount * 1.4, 20000);
  const maxRate = Math.max(...feeRates.map((r) => r.rate));
  const yMax = maxRate * xMax * 1.08;

  const xFor = (v: number) => (v / xMax) * plotW;
  const yFor = (v: number) => plotH - (v / yMax) * plotH;

  const xTicks = Array.from({ length: TICKS + 1 }, (_, i) => (xMax * i) / TICKS);
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => (yMax * i) / TICKS);
  const markerX = Math.min(amount, xMax);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full overflow-visible"
      role="img"
      aria-label="Fee earned vs. liquidity provided, for Uniswap, Curve, and Iter"
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

        {feeRates.map((row) => (
          <motion.line
            key={row.venue}
            x1={0}
            y1={yFor(0)}
            animate={{ x2: xFor(xMax), y2: yFor(row.rate * xMax) }}
            transition={SPRING}
            stroke={ROW_COLORS[row.venue]}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}

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
          feeRates.map((row) => (
            <motion.circle
              key={row.venue}
              animate={{ cx: xFor(markerX), cy: yFor(row.rate * markerX) }}
              transition={SPRING}
              r={4.5}
              fill={ROW_COLORS[row.venue]}
              stroke="var(--color-black-300)"
              strokeWidth={2}
            />
          ))}
      </g>
    </svg>
  );
}

export function FeeCalculator() {
  const [amount, setAmount] = useState(10000);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  return (
    <div>
      <p className="max-w-2xl text-sm leading-relaxed text-dark-grey-1">
        These are the same three formulas behind the LP charts above, run on
        your own number instead of a fixed $1M example. Type in how much
        USDC you&apos;d provide as liquidity and every figure below, and the
        chart, recomputes live &mdash; using the exact rates from the
        simulation, not rounded estimates.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dark-grey-1">
        This is <span className="text-white">not a yearly or daily rate.</span>{" "}
        Every number below answers one question: once trading volume equal to
        your own liquidity has matched against it, one time, what fee did you
        earn? How often that happens in a real day depends on the pair and
        the market &mdash; that turnover rate isn&apos;t modeled here. If your
        liquidity gets matched twice a day, earn this amount twice a day; if
        it sits untraded, you earn nothing that day.
      </p>

      <label className="mt-6 block">
        <span className="font-mono-brand text-[11px] tracking-[0.16em] text-purple-700 dark:text-purple-300 uppercase">
          Your USDC liquidity
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
            aria-label="Your USDC liquidity"
          />
        </div>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {feeRates.map((row) => (
          <div
            key={row.venue}
            className="rounded-xl border border-dark-grey-3 bg-black-400 p-5"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-[10px] w-[10px] rounded-full"
                style={{ background: ROW_COLORS[row.venue] }}
              />
              <span className="font-display text-base font-medium text-white">
                {row.venue}
              </span>
            </div>
            <p className="mt-2 font-mono-brand text-[11px] leading-relaxed text-dark-grey-1">
              {row.formula}
            </p>
            <p className="mt-1 font-mono-brand text-[11px] text-dark-grey-1">
              {row.detail}
            </p>
            <div className="mt-3 font-mono-brand text-2xl font-medium text-purple-400">
              <NumberFlow
                value={safeAmount * row.rate}
                format={{ style: "currency", currency: "USD", maximumFractionDigits: 2 }}
              />
            </div>
            <p className="mt-1 font-mono-brand text-[10px] tracking-wide text-dark-grey-1 uppercase">
              per matched turn, not per year
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dark-grey-3 bg-black-400 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 className="font-display text-base font-medium text-white">
            Fee earned per matched turn, vs. liquidity provided
          </h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {feeRates.map((row) => (
              <li
                key={row.venue}
                className="flex items-center gap-1.5 font-mono-brand text-[11px] text-dark-grey-1 uppercase"
              >
                <span
                  className="inline-block h-[2px] w-3.5 rounded-full"
                  style={{ background: ROW_COLORS[row.venue] }}
                />
                {row.venue}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-1 text-sm text-dark-grey-1">
          Every line is a straight fee-rate-times-liquidity line; steeper
          means more fee per dollar deposited. The dashed marker is your
          current number above.
        </p>
        <div className="mt-5">
          <FeeChart amount={safeAmount} />
        </div>
        <p className="mt-2 text-center font-mono-brand text-[10px] tracking-wide text-dark-grey-1 uppercase">
          Liquidity provided (USDC)
        </p>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dark-grey-1">
        Uniswap and Curve charge a protocol-fixed rate, same for every LP,
        every pair, regardless of how they quote. Iter&apos;s LP pays no
        fee at all &mdash; they earn the spread they quoted themselves, plus
        the fee the trader&apos;s own membership tier pays; the rate above is
        the top tolerance tier on a thin book, the same one behind the
        &ldquo;Iter, thin market&rdquo; row on the charts above. This
        assumes your liquidity gets matched dollar-for-dollar &mdash; real
        turnover varies by pair and venue, and it&apos;s the same simplifying
        assumption the net-of-price-risk chart above already uses. Open the
        LP charts above for every tier and book depth, not just this one.
      </p>
    </div>
  );
}
