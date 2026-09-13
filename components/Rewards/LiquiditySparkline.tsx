"use client";

import { SOURCE_COLOR } from "@/lib/rewards/mock";

/**
 * Tiny area sparkline of the liquidity balance across epochs. Pure SVG, no
 * chart lib. Scales to the max balance so a rising balance reads as a ramp.
 */
export function LiquiditySparkline({
  values,
  width = 120,
  height = 26,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  const pad = 2;
  const span = values.length > 1 ? values.length - 1 : 1;
  const points = values
    .map((v, i) => {
      const x = (i / span) * width;
      const y = height - (v / max) * (height - pad * 2) - pad;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="mt-2 block w-full"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={SOURCE_COLOR.liquidity}
        opacity={0.12}
      />
      <polyline
        points={points}
        fill="none"
        stroke={SOURCE_COLOR.liquidity}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
