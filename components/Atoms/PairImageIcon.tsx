"use client";

import { cn } from '@/lib/utils';
import { ChainBadge, TokenImageIcon } from '@/components/Atoms/TokenImageIcon';

/**
 * A market's two tokens as one mark: the base's LEFT half beside the quote's RIGHT half,
 * with the network chip on the lower-right corner.
 *
 * ## Two clipped circles, not one circle split down the middle
 *
 * `Portfolio/parts.tsx`'s `MarketAvatar` renders the other reading of this — two halves
 * butted together with `rounded-none`, so they fuse into a single disc with a seam. This
 * one keeps each token a whole circle and shows a window onto half of it, so both halves
 * keep their own curved outer edge and a flat cut on the inside, separated by a gap. That
 * is what the reference does, and it is the difference between "one coin made of two
 * tokens" and "two coins, overlapping" — the latter reads correctly when the two logos
 * are similar colours, which on this venue they frequently are.
 *
 * ## Proportions, not pixel tiers
 *
 * The reference is drawn at 44px: each half-window 21px wide, leaving a 2px gap between
 * them. Those are kept as percentages — 47.7% per side, ~4.6% of gap — because `size`
 * here is only a default and call sites routinely override the box (`h-7 w-7`, `!h-6 !w-6`
 * and so on). A half fixed at 21px is correct at exactly one container size. This is the
 * same lesson `TokenImageIcon` records for its badge geometry; the two files should stay
 * consistent about it.
 *
 * Each token is sized `h-full aspect-square`, so it is a square as wide as the CONTAINER
 * is tall regardless of how narrow its clipping window is — that is what makes the window
 * show half of a full-size circle rather than a squashed whole one.
 *
 * ## What it reuses, deliberately
 *
 * The halves are `TokenImageIcon`, so they inherit its faint underlay disc and its
 * cached-failure handling — the case where a URL has already 404'd, the browser serves
 * the failure from cache, and `onError` never fires because the element was `complete`
 * before React attached the handler. Re-implementing an `<img>` here would silently drop
 * that and leave broken glyphs on pair rows only.
 *
 * `chainName` is NOT passed down to either half: `TokenImageIcon` renders its own badge
 * when it receives one, and this composition needs exactly one badge on the OUTER box —
 * two halves each with their own would be both wrong and clipped.
 */
export function PairImageIcon({
  base,
  quote,
  baseLogoURI,
  quoteLogoURI,
  baseColor,
  quoteColor,
  chainName,
  className,
}: {
  base: string;
  quote: string;
  baseLogoURI?: string;
  quoteLogoURI?: string;
  /** Fallback hue when the token has no artwork — see `lib/swap/tokens`' `tokenColor`. */
  baseColor: string;
  quoteColor: string;
  /** Omit to render the pair with no network chip. */
  chainName?: string;
  className?: string;
}) {
  return (
    <div
      // `overflow-visible` because the badge deliberately hangs past the lower-right
      // corner; the clipping happens per-half, one level down.
      className={cn('relative h-11 w-11 shrink-0 overflow-visible', className)}
      role="img"
      aria-label={`${base}/${quote}`}
      title={`${base}/${quote}`}
    >
      {/* Base — a full circle, windowed to its left half. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[47.7%] overflow-hidden">
        <TokenImageIcon
          symbol={base}
          color={baseColor}
          logoURI={baseLogoURI}
          className="absolute left-0 top-0 aspect-square h-full w-auto"
        />
      </span>

      {/* Quote — anchored RIGHT inside its window, so the window shows its right half.
          Anchoring rather than translating keeps the gap a property of the two window
          widths alone, so changing the gap is one number in two places and not three. */}
      <span aria-hidden className="absolute inset-y-0 right-0 w-[47.7%] overflow-hidden">
        <TokenImageIcon
          symbol={quote}
          color={quoteColor}
          logoURI={quoteLogoURI}
          className="absolute right-0 top-0 aspect-square h-full w-auto"
        />
      </span>

      {/* Outside both windows, or it would be clipped by whichever half it sat in. */}
      {chainName && <ChainBadge chainName={chainName} fill />}
    </div>
  );
}
