/**
 * The order-ladder hero backdrop: price levels stacked around one bright line,
 * the rate a fill clears at. Asks rest on the right in the logo orange, bids on
 * the left in the page ink, and depth grows away from the midline, as it does
 * on a real book.
 *
 * Pure SVG with every colour a `var(--m-*)`, so the theme is decided by the
 * cascade before first paint, the same reason `HeroBackdrop` and
 * `DepthColonnade` avoid a theme hook. The geometry is fixed (no randomness),
 * so server and client render the same markup.
 *
 * `slice` keeps the levels evenly spaced at any aspect ratio instead of
 * stretching them; the midline stays at 48% of the height, behind the card.
 */
const W = 1440;
const H = 900;
const MID = 430;
const GAP = 22;
const LEVELS = 18;

/** Depth at level k: grows away from the midline, with a few heavier levels so it reads as a book rather than a ramp. Kept to about half the width so the centre column, where the headline and card sit, stays clear. */
function depth(k: number) {
  return 140 + k * 30 + (k % 3 === 0 ? 40 : 0) + (k % 5 === 1 ? 25 : 0);
}

export function OrderLadder() {
  const levels = Array.from({ length: LEVELS }, (_, i) => i + 1);
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="order-ladder-mid" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--m-logo)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--m-logo)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--m-logo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {levels.map((k) => {
        const ask = MID - k * GAP;
        const bid = MID + k * GAP;
        const d = depth(k);
        return (
          <g key={k}>
            <rect x={0} y={ask} width={W} height={1} fill="var(--m-text-primary)" opacity={0.07} />
            <rect x={W - d} y={ask - 7} width={d} height={14} fill="var(--m-logo)" opacity={0.1 + 0.012 * k} />
            <rect x={0} y={bid} width={W} height={1} fill="var(--m-text-primary)" opacity={0.07} />
            <rect x={0} y={bid - 7} width={d} height={14} fill="var(--m-text-primary)" opacity={0.06 + 0.006 * k} />
          </g>
        );
      })}
      <rect x={0} y={MID - 10} width={W} height={20} fill="url(#order-ladder-mid)" opacity={0.18} />
      <rect x={0} y={MID - 1} width={W} height={2} fill="url(#order-ladder-mid)" />
    </svg>
  );
}
