"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  colonnadeProfile,
  columnCountFor,
  ornamentProfile,
  rasterizeColonnade,
} from "@/lib/graphics/depthColonnade";
import { luminance, parseHex, type Rgb } from "@/lib/graphics/dither";

/**
 * The depth-colonnade graphic, painted to a canvas at device resolution.
 *
 * All geometry and colour decisions live in `lib/graphics/depthColonnade`,
 * which is a pure function and carries the tests. This component is only the
 * plumbing: measure, read the theme's tokens, rasterise, blit.
 *
 * ## It reads the theme from the CASCADE, not from a hook
 *
 * The `--m-*` values are pulled off the element's own computed style, so the
 * `.dark` class next-themes puts on `<html>` before first paint decides the
 * palette with no JS involvement and no provider requirement. That matters for
 * the same reason it mattered for `useChainBrand`: this is decoration, and a
 * decorative component that can throw for want of a provider can take down
 * whatever mounts it. A `useTheme()` here would also re-introduce the
 * first-paint flash `HeroBackdrop` was rewritten to remove.
 *
 * The theme is identified by the ground's LUMINANCE rather than by a theme
 * name, so a third theme needs no change here. It selects the PALETTE only —
 * the dither pattern is identical in both, so the two themes are visibly the
 * same graphic rather than negatives of each other.
 *
 * ## Resolution
 *
 * One dither cell per device pixel by default, which is what makes the grain
 * read as halftone rather than as blocks. That is genuinely expensive — a
 * full-bleed hero on a 2x display is several million cells — so `CELL_BUDGET`
 * coarsens the cell rather than letting an unbounded frame stall the main
 * thread. Repaints happen on resize (debounced) and on a theme change, never
 * per frame; nothing here animates.
 */

/** Device pixels per dither cell. 1 is the finest the display can show. */
const CELL_DEVICE_PX = 1;
/**
 * Ceiling on total cells per paint. Above this the cell grows instead, trading
 * grain for a frame that lands. Sized so a 2x ultrawide hero stays under ~40ms.
 */
const CELL_BUDGET = 3_000_000;
/** Beyond 2x, extra density is invisible and only costs milliseconds. */
const MAX_DPR = 2;
/**
 * Coverage band for a pale ground. See `coverageRange` in the rasteriser.
 *
 * Raised from [0.38, 0.86] when the light pillars went vivid. The two settings
 * are coupled and cannot be tuned apart: a DARK colour survives being painted
 * on half the cells, because the white half simply reads as a lighter shade of
 * it. A vivid mid-tone does not — at 38% it becomes a pastel wash. Bold colour
 * needs bold coverage.
 */
const LIGHT_COVERAGE = [0.55, 0.95] as const;

/**
 * First token in the chain that resolves to a hex colour.
 *
 * The chain matters more than it looks. `--m-graphic-*` are new, bespoke, and
 * referenced ONLY from JavaScript — no CSS rule mentions them — so nothing in
 * the stylesheet fails if they go missing. When that happened (a stale
 * Turbopack CSS build that had not picked up globals.css), the component's
 * strict guard returned early and the ENTIRE colonnade disappeared from both
 * themes, with no error anywhere.
 *
 * A decorative graphic drawn in the wrong-ish colour is a far better outcome
 * than one that is not drawn at all, so a missing bespoke token now falls back
 * to the Monet chart tokens, which every stylesheet in this app has always had.
 * Returning null — and drawing nothing — is reserved for the case where even
 * those are gone, which means the theme itself did not load.
 */
export function firstColour(
  read: (token: string) => Rgb | null,
  ...tokens: readonly string[]
): Rgb | null {
  for (const token of tokens) {
    const colour = read(token);
    if (colour) return colour;
  }
  return null;
}

export interface DepthColonnadeProps {
  /**
   * The book to draw. Omit ONLY where there is no book to read — the graphic
   * then falls back to `ornamentProfile`, an explicitly illustrative shape.
   * Never pass a synthesised book here; see the module note in
   * `lib/graphics/depthColonnade`.
   */
  book?: { bids: readonly { size: number }[]; asks: readonly { size: number }[] };
  /** Column count. Resolved from the width when omitted. */
  columns?: number;
  /** Coverage multiplier. Below 1 the colonnade becomes a haze. */
  gain?: number;
  /** `radial` quiets the centre, for a centred hero. */
  falloff?: "none" | "radial";
  className?: string;
}

export function DepthColonnade({
  book,
  columns,
  gain = 1,
  falloff = "none",
  className,
}: DepthColonnadeProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const paint = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    const styles = getComputedStyle(canvas);
    const read = (token: string): Rgb | null =>
      parseHex(styles.getPropertyValue(token));
    const ground = read("--m-background");
    if (!ground) return;
    const dark = luminance(ground) < 0.5;

    // One token pair, declared per theme in globals.css — dollar green and
    // cobalt blue. Reading a single name here rather than branching on the
    // theme keeps the palette decision in the stylesheet, where both themes
    // sit side by side and can be compared; see the note beside the tokens for
    // why they step outside the Monet ramps.
    const bid = firstColour(read, "--m-graphic-bid", "--m-chart-buy");
    const ask = firstColour(read, "--m-graphic-ask", "--m-primary");
    // Only if the fallbacks are gone too, which means no theme loaded at all.
    // Never substitute a literal here: black is a plausible colour on this
    // palette and would ship unnoticed.
    if (!bid || !ask) return;

    const dpr = Math.min(MAX_DPR, globalThis.devicePixelRatio || 1);
    let cell = CELL_DEVICE_PX;
    let w = Math.max(1, Math.round((cssW * dpr) / cell));
    let h = Math.max(1, Math.round((cssH * dpr) / cell));
    while (w * h > CELL_BUDGET && cell < 8) {
      cell += 1;
      w = Math.max(1, Math.round((cssW * dpr) / cell));
      h = Math.max(1, Math.round((cssH * dpr) / cell));
    }

    // Column thickness is a ratio of the frame's HEIGHT — see columnCountFor.
    // A fixed CSS-pixel slot made the hero thinner than a small plate purely
    // because it is wider, which is how the shafts came out as pickets.
    const count = columns ?? columnCountFor(cssW, cssH);
    const profile = book
      ? colonnadeProfile(book.bids, book.asks, count)
      : ornamentProfile(count);

    const data = rasterizeColonnade({
      width: w,
      height: h,
      columns: profile,
      ground,
      bid,
      ask,
      gain,
      falloff,
      // Only the pale ground needs this. On #0D0F12 an unpainted cell reads as
      // shadow; on #F2F0F0 it reads as nothing there, so a shaded face comes
      // out hollow. The ceiling matters as much as the floor: without it the
      // lit third of every shaft reached full coverage and went flat.
      coverageRange: dark ? undefined : LIGHT_COVERAGE,
    });

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Written through createImageData rather than `new ImageData(data, w, h)`:
    // the constructor overload requires an ArrayBuffer-backed view, and the
    // rasteriser returns a plain Uint8ClampedArray so it stays free of DOM
    // types and testable in node. The copy is a memcpy next to the raster loop.
    const image = ctx.createImageData(w, h);
    image.data.set(data);
    ctx.putImageData(image, 0, 0);
  }, [book, columns, gain, falloff]);

  useEffect(() => {
    paint();

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };

    const ro = new ResizeObserver(schedule);
    if (ref.current) ro.observe(ref.current);

    // next-themes toggles a class on <html>; the tokens change with it, and the
    // cascade alone cannot repaint a bitmap.
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, [paint]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      // `pixelated` so the browser never resamples the grain: the buffer is
      // already device-sized, and smoothing it would turn an ordered dither
      // back into the gradient it exists to replace.
      className={className}
      style={{ imageRendering: "pixelated", display: "block", width: "100%", height: "100%" }}
    />
  );
}
