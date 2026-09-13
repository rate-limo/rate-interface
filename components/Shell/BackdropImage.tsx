"use client";

/**
 * A still image laid behind a page's content, drifting slowly, with a scrim over
 * it so the content on top stays legible.
 *
 * Replaces the backdrop VIDEO this file's history began as (2026-08-14, user
 * direction: "the video does not loop smooth. I would rather get one image and
 * make it float around"). A video loop is only seamless if its last frame
 * matches its first; this one's did not, so every ~20s the whole backdrop
 * jump-cut. A still cannot have that seam at all, and the cost difference is not
 * marginal: 355KB against 44MB.
 *
 * Mount as the first child of a `relative isolate` container. It positions
 * itself `absolute inset-0` on a negative layer, so it covers that container and
 * nothing else — `isolate` opens the stacking context that keeps `-z-10` behind
 * the page's content without escaping behind the app shell's chrome.
 *
 * ## Why the drift is a transform on an oversized image
 *
 * The image is scaled past the frame and moved WITHIN it, so the drift never
 * exposes an edge. Animating `background-position` or `inset` instead would
 * either show the seam or force layout on every frame; `transform` and nothing
 * else keeps this on the compositor, which is what makes a full-bleed background
 * animation free rather than a permanent frame-rate tax.
 *
 * The motion is deliberately slower and smaller than reads as "animated" — it
 * should register as the page breathing, not as something moving behind your
 * order form. It is background to a surface where people commit money.
 */

interface BackdropImageProps {
  /** Path under /public. */
  src: string;
  className?: string;
}

export function BackdropImage({ src, className }: BackdropImageProps) {
  return (
    <div
      // Decoration: `aria-hidden`, no alt text, nothing focusable. A screen
      // reader describing a background photograph is noise.
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[color:var(--m-background)] ${className ?? ""}`}
    >
      {/*
        A plain <img>, NOT next/image. This is a decorative background that must
        cover its container at any aspect ratio; next/image's value here would be
        the responsive srcset, and a single pre-sized WebP already answers that.
        `fill + object-cover` under a transform animation also fights the
        wrapper next/image injects.

        `.backdrop-drift` is plain CSS in globals.css, NOT a Tailwind utility and
        deliberately not named `animate-backdrop-drift`: `animate-*` is a
        reserved v4 namespace, so such a class is claimed and dropped. The scrim
        on this very component already hit the same class-compiles-to-nothing
        trap, so everything this backdrop needs lives in CSS. The scale also
        lives in the keyframes rather than a `scale-110` class, so one place owns
        the transform — a Tailwind scale utility would simply be overwritten by
        the animation anyway.
      */}
      <img
        src={src}
        alt=""
        className="backdrop-drift h-full w-full object-cover"
        decoding="async"
        // The backdrop should never outrank the card it sits behind for
        // bandwidth on first paint.
        loading="lazy"
        fetchPriority="low"
      />

      {/* Flat wash — the contrast floor, wherever content lands. */}
      <div className="absolute inset-0" style={{ background: "var(--m-scrim)" }} />
      {/* Edge gradient — deepens where the backdrop meets the shell's chrome. */}
      <div className="absolute inset-0" style={{ background: "var(--m-scrim-edge)" }} />
    </div>
  );
}
