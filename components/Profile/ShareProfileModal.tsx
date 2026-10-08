"use client";

import { ShareCardModal } from "@/components/Share/ShareCardModal";
import { profileShareCardUrl, profileShareText, profileShareUrl } from "@/lib/profile/share";

/**
 * The share sheet for a wallet's public profile. The sheet itself — preview,
 * Post on X, copy image, copy link, download — is `ShareCardModal`; its doc
 * carries why each action exists.
 */
export function ShareProfileModal({
  open,
  onOpenChange,
  address,
  chainSlug,
  displayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  chainSlug: string | null;
  displayName: string | null;
}) {
  return (
    <ShareCardModal
      open={open}
      onOpenChange={onOpenChange}
      title="Share profile"
      label={displayName?.trim() || `${address.slice(0, 6)}…${address.slice(-4)}`}
      text={profileShareText(displayName, address)}
      build={(origin) => ({
        shareUrl: profileShareUrl(origin, address, chainSlug),
        cardUrl: profileShareCardUrl(origin, address, chainSlug),
      })}
      downloadName={`iter-${address.slice(0, 10)}.png`}
    />
  );
}
