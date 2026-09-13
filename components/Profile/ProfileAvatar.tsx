"use client";

import { addressAvatarGradient, addressGradient, avatarInitial } from "@/lib/portfolio/profile";
import { cn } from "@/lib/utils";

/**
 * A wallet's picture and its cover — the two defaults, and the rule that they differ.
 *
 * ## Why these are components and not two style strings
 *
 * `IdentityCard` computed one gradient and painted it on BOTH surfaces, so the avatar disc
 * read as a circular crop of the banner directly above it: a user with no picture looked
 * identical to a user with no banner. Fixing that in one file would have left the wallet
 * menu — the other place a wallet's face is drawn — free to reintroduce it, and a default
 * avatar that differs between two screens of the same app is worse than one that is
 * merely plain. So the rule lives in one component that both call.
 *
 * ## What makes them different
 *
 * Both derive from the address, so a wallet's two surfaces belong to one identity and
 * harmonise. They are not the same image:
 *
 *   * the banner is a LINEAR wash of `addressGradient`;
 *   * the avatar is a RADIAL one of `addressAvatarGradient` — a rotated pair — carrying
 *     the name's first letter.
 *
 * Different geometry as well as different hues, because at a glance shape reads faster
 * than colour.
 */

export function ProfileAvatar({
  address,
  name,
  src,
  size,
  className,
}: {
  address: string;
  /** Display name, for the initial. Absent or punctuation-led renders a plain disc. */
  name?: string | null;
  /** The uploaded picture, already resolved to an absolute URL. */
  src?: string | null;
  /** Pixel size of the disc. Drives the initial's size too, so the two cannot drift. */
  size: number;
  className?: string;
}) {
  const gradient = addressAvatarGradient(address);
  const initial = avatarInitial(name);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle at 32% 28%, ${gradient.from}, ${gradient.to})`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unknown host
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        // Only when there is no picture, never underneath one: an uploaded avatar with a
        // letter showing through its transparent pixels reads as a bug, not a fallback.
        <span
          aria-hidden
          className="select-none font-extrabold leading-none tracking-[-0.02em] text-[color:var(--m-text-on-media)] drop-shadow-sm"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

export function ProfileBanner({
  address,
  src,
  className,
}: {
  address: string;
  src?: string | null;
  className?: string;
}) {
  const gradient = addressGradient(address);

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- external, unknown host
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
