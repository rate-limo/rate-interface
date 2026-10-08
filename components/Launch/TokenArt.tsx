"use client";

import { useId } from "react";
import { ChainBadge } from "@/components/Atoms/TokenImageIcon";
import { meshStops } from "@/lib/launch/preview";
import { tokenLogoURI } from "@/lib/tokens/logo";
import { cn } from "@/lib/utils";

/**
 * A launched coin's square art: its own logo, or a mesh derived from its symbol.
 *
 * ## Why this is shared rather than drawn twice
 *
 * `/create`'s preview card captions itself "This is the card Explore renders
 * once it deploys", and that was not true. The preview drew this art; the
 * Launches grid drew a 40px avatar in a row of stats, so the one screen that
 * promises what a coin will look like showed something the product never
 * rendered. Two components claiming to be the same card is how they drift, and
 * these had already drifted before anyone shipped a coin.
 *
 * So the art lives here and both mount it. A change to what an unbranded coin
 * looks like now lands on the promise and the delivery at the same time.
 *
 * ## The mesh is a fallback, not a placeholder
 *
 * A coin with no upload is the common case on this venue, not an error state,
 * so the fallback is designed rather than grey: `meshStops` spins a hue family
 * out of the symbol, deterministically, so a creator recognises their own coin
 * before it has artwork and two coins rarely look alike.
 */
export function TokenArt({
  symbol,
  /** The token's artwork. A blob: URL from the cropper, or a listed logoURI. */
  logoURI,
  chainName,
  /** Draws the symbol plate over the mesh. Off at avatar sizes, where it cannot fit. */
  showSymbol = true,
  className,
}: {
  symbol: string;
  logoURI?: string | null;
  chainName?: string;
  showSymbol?: boolean;
  className?: string;
}) {
  const shown = (symbol || "TOKEN").trim().toUpperCase();
  const mesh = meshStops(shown);
  // Both the compact strip and the sticky rail mount, so a symbol-derived id
  // would appear twice in one document and the second reference would resolve
  // to the first instance's filter. Non-alphanumerics are stripped because
  // useId returns colons, which several engines refuse inside url(#...).
  const meshId = `token-art-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Treats the predecessor list's placeholder filename as absent, the one place
  // that decides whether a logoURI is real.
  const art = logoURI?.startsWith("blob:") ? logoURI : tokenLogoURI(logoURI ?? undefined);

  return (
    <div
      className={cn(
        "relative isolate aspect-square w-full overflow-hidden rounded-[12px]",
        className,
      )}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL is
        // per-document and has no intrinsic size, which next/image cannot load;
        // LogoCropper renders the same preview the same way.
        <img src={art} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 400 400"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
          className="block h-full w-full"
        >
          <defs>
            <filter id={meshId}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="38" />
            </filter>
          </defs>
          <g filter={`url(#${meshId})`}>
            <rect width="400" height="400" fill={mesh.ground} />
            <circle cx="110" cy="120" r="140" fill={mesh.a} opacity="0.75" />
            <circle cx="320" cy="110" r="190" fill={mesh.b} opacity="0.7" />
            <circle cx="240" cy="360" r="200" fill={mesh.c} opacity="0.8" />
            <circle cx="60" cy="330" r="150" fill={mesh.d} opacity="0.55" />
          </g>
        </svg>
      )}

      {/* Sheen, so the flat mesh reads as a surface rather than a gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-55"
        style={{
          background:
            "radial-gradient(circle at 22% 26%, rgba(255,255,255,.22) 0%, transparent 42%)," +
            "radial-gradient(circle at 78% 74%, rgba(255,255,255,.12) 0%, transparent 44%)," +
            "linear-gradient(135deg, rgba(255,255,255,.2) 0%, rgba(255,255,255,.02) 40%, rgba(255,255,255,.14) 100%)",
        }}
      />

      {!art && showSymbol && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* The plate is dark-on-light now that the mesh is light: white text on
              a pastel ground failed contrast at every hue the hash can pick. */}
          <b className="max-w-[86%] truncate rounded-[10px] bg-black/10 px-3 py-1.5 text-center font-mono text-[clamp(18px,7vw,30px)] font-medium tracking-[-0.02em] text-black/70 shadow-[inset_0_1px_0_rgba(255,255,255,.35)] backdrop-blur-[2px]">
            {shown.slice(0, 6)}
          </b>
        </div>
      )}

      {chainName && (
        <div className="absolute bottom-2 right-2">
          <ChainBadge chainName={chainName} size="sm" />
        </div>
      )}
    </div>
  );
}
