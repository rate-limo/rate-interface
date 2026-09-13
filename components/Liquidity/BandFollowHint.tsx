"use client";

/**
 * A four-second loop showing the one thing a band does that a v3 range does not:
 * it MOVES.
 *
 * `BandPool._anchor()` re-reads the pair's TWAP on every swap, so a band's
 * absolute price follows the market. An LP arriving from Uniswap reads the
 * shaded strip on the chart as a range they staked out — ground the price can
 * walk off, taking their fees with it. Every word of copy saying otherwise
 * competes with a picture that looks exactly like a v3 position, and the picture
 * wins. So this shows it instead of asserting it: the price wanders, the band
 * rides along, and nothing ever leaves it.
 *
 * ## It is a diagram, not the live chart
 *
 * Deliberately its own little SVG rather than an animation applied to
 * CLPriceChart. Moving the real anchor line would put a price on screen that
 * nothing traded at, next to a label reading the true rate — the same class of
 * lie as the range summary this replaced. Here the axis is unlabelled and the
 * shape is obviously schematic, so it can only be read as an illustration.
 *
 * ## Motion is opt-out, and the still frame has to work
 *
 * Under `prefers-reduced-motion` the animation is dropped entirely and the
 * static frame still reads: a band centred on a price line. Anyone who suppresses
 * motion loses the demonstration, not the meaning.
 */
export function BandFollowHint({ className }: { className?: string }) {
  return (
    <figure className={`m-0 ${className ?? ""}`}>
      <svg
        viewBox="0 0 200 56"
        role="img"
        aria-label="A price line drifting up and down with its liquidity band moving with it, always centred on the price."
        className="block h-[56px] w-full"
      >
        <title>The band follows the price</title>
        {/* One group, so the band and the line cannot drift apart — which is the
            entire claim being made. Animating them separately would let a
            rounding difference show the band lagging, contradicting the point. */}
        <g className="band-follow">
          <rect
            x={0}
            y={16}
            width={200}
            height={24}
            fill="var(--m-primary)"
            fillOpacity={0.18}
            rx={3}
          />
          <line
            x1={0}
            y1={28}
            x2={200}
            y2={28}
            stroke="var(--m-primary)"
            strokeWidth={1.5}
            strokeOpacity={0.9}
          />
        </g>
      </svg>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-[var(--m-text-secondary-2)]">
        Your band is anchored to the pair&apos;s TWAP, so it moves with the market. There is
        no out-of-range.
      </figcaption>

      <style jsx>{`
        .band-follow {
          animation: band-drift 4s ease-in-out infinite;
        }
        @keyframes band-drift {
          0%,
          100% {
            transform: translateY(0);
          }
          25% {
            transform: translateY(-9px);
          }
          60% {
            transform: translateY(7px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .band-follow {
            animation: none;
          }
        }
      `}</style>
    </figure>
  );
}
