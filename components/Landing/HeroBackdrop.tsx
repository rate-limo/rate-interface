import Image from "next/image";

import { DepthColonnade } from "@components/Graphics/DepthColonnade";

/**
 * Hero background texture, swapped per theme -- Monet's "Cliff Walk at
 * Pourville" (1882) for light, Whistler's "A Seascape, Shipping by Moonlight"
 * (c.1866) for dark (both public domain; a day/night marine pair).
 *
 * Selection is done in CSS via the `dark` class that next-themes sets on
 * <html> from its blocking inline script -- BEFORE first paint -- not in JS.
 * Both canvases render; the wrong one is held at opacity 0 by a `dark:`
 * variant. This is deliberate: the previous version gated on a mounted/
 * resolvedTheme effect, so a light-mode visitor was served the dark nocturne
 * on first paint and only swapped to the Monet after hydration. Keying off
 * the class instead means the correct painting is chosen at first paint for
 * both themes, with no flash. The container's own `bg-black-400` is theme-
 * reactive (light background in light mode), so nothing dark shows while the
 * image is still loading either.
 */
const LIGHT_SCRIM =
  "linear-gradient(90deg, var(--m-background) 0%, color-mix(in srgb, var(--m-background) 35%, transparent) 30%, color-mix(in srgb, var(--m-background) 6%, transparent) 55%, transparent 82%), linear-gradient(0deg, color-mix(in srgb, var(--m-background) 55%, transparent) 0%, color-mix(in srgb, var(--m-background) 8%, transparent) 26%, transparent 50%)";
const DARK_SCRIM =
  "linear-gradient(90deg, var(--m-background) 0%, color-mix(in srgb, var(--m-background) 55%, transparent) 38%, color-mix(in srgb, var(--m-background) 15%, transparent) 62%, transparent 100%), linear-gradient(0deg, var(--m-background) 0%, color-mix(in srgb, var(--m-background) 20%, transparent) 30%, transparent 55%)";

/**
 * Centred content needs a radial scrim, not a directional one. The two above
 * hold an opaque LEFT edge and fade rightward, which is correct under
 * left-aligned copy and wrong the moment the copy moves to the middle — it
 * leaves the headline over the brightest part of the canvas and darkens the
 * empty margin instead. These darken the CENTRE, behind the copy and the card,
 * and go fully transparent at the edges so the painting reads in the margins.
 *
 * Get the direction wrong and the hero goes flat grey, which is what the first
 * version of this did: opaque at the edges, clear in the middle, so the only
 * part of the canvas left visible was the part covered by the card. The images
 * already sit at 0.5 / 0.55 opacity, so any scrim over the whole width leaves
 * nothing to see.
 *
 * The trailing linear stop is a bottom fade into --m-background, so the
 * section ends on the page colour rather than a hard cut through the canvas.
 */
const LIGHT_SCRIM_CENTERED =
  "radial-gradient(46% 62% at 50% 38%, var(--m-background) 0%, color-mix(in srgb, var(--m-background) 72%, transparent) 52%, color-mix(in srgb, var(--m-background) 18%, transparent) 80%, transparent 100%), linear-gradient(0deg, var(--m-background) 0%, transparent 20%)";
const DARK_SCRIM_CENTERED =
  "radial-gradient(46% 62% at 50% 38%, var(--m-background) 0%, color-mix(in srgb, var(--m-background) 74%, transparent) 52%, color-mix(in srgb, var(--m-background) 22%, transparent) 80%, transparent 100%), linear-gradient(0deg, var(--m-background) 0%, transparent 20%)";

export function HeroBackdrop({
  variant = "left",
  art = "painting",
}: {
  /** `centered` swaps the directional scrims for radial ones. */
  variant?: "left" | "centered";
  /**
   * `colonnade` replaces the paintings with the generated depth graphic.
   *
   * It takes NO scrim, and that is the point of it rather than an omission.
   * Every constant in this file exists to hold a photograph back from the copy
   * on top of it — two directional scrims, two radial ones, a Ken Burns drift,
   * and in `Hero` a halo that has to be subtractive in light and additive in
   * dark because a dark-on-dark gradient erases nothing. The colonnade is
   * generated from `--m-background` outward, so its contrast under the headline
   * is a gain parameter instead of a gradient fighting an image.
   */
  art?: "painting" | "colonnade";
}) {
  const centered = variant === "centered";

  if (art === "colonnade") {
    return (
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-black-400">
        <DepthColonnade falloff="radial" gain={0.62} />
        {/* The section still has to end on the page colour rather than a hard
            cut through the stylobate. This is the one gradient the generated
            backdrop keeps, and it touches the bottom edge only. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(0deg, var(--m-background) 0%, transparent 22%)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-black-400">
      {/* Light -- Monet, "Cliff Walk at Pourville" */}
      <Image
        src="/images/hero-cliff.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-drift object-cover object-[58%_18%] opacity-50 dark:opacity-0"
      />
      {/* Dark -- Whistler, "A Seascape, Shipping by Moonlight" */}
      <Image
        src="/images/hero-nocturne.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-drift object-cover object-[55%_45%] opacity-0 dark:opacity-55"
      />
      {/* Scrim over the painting -- lighter in light mode so more of the
          canvas shows through; the left edge stays opaque enough for the
          headline. Toggled by the same class, so no flash. */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{ backgroundImage: centered ? LIGHT_SCRIM_CENTERED : LIGHT_SCRIM }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ backgroundImage: centered ? DARK_SCRIM_CENTERED : DARK_SCRIM }}
      />
    </div>
  );
}
