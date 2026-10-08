"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { ShareCardModal } from "@/components/Share/ShareCardModal";
import { fetchReferralCode } from "@/lib/referral/link";
import { rateCardUrl, rateLine, rateShareText, rateShareUrl, sideOf } from "@/lib/rateCard/share";
import { cn } from "@/lib/utils";

/**
 * "Share my rate" for one resting order: the card, an X post, a link that
 * credits the sharer.
 *
 * The referral code is fetched when the sheet OPENS, not when the row renders:
 * a table of twenty orders must not make twenty requests for a code nobody
 * asked to share. If the lookup fails the link is shared without one — the card
 * still works, the sharer just isn't credited, which beats a share button that
 * does nothing.
 */
export function ShareRateButton({
  chainSlug,
  order,
  className,
}: {
  chainSlug: string;
  order: { account: string; pair: string; isBid: boolean; orderId: number; price: number; baseSymbol: string; quoteSymbol: string };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || code) return;
    let live = true;
    fetchReferralCode(order.account)
      .then((r) => live && setCode(r.code))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, code, order.account]);

  const key = { chain: chainSlug, address: order.account, pair: order.pair, side: sideOf(order.isBid), orderId: order.orderId };

  return (
    <>
      <button
        type="button"
        aria-label="Share my rate"
        title="Share my rate"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center justify-center text-dark-grey-1 transition-colors hover:text-white", className)}
      >
        <Share2 className="h-4 w-4" aria-hidden />
      </button>
      <ShareCardModal
        open={open}
        onOpenChange={setOpen}
        title="Share my rate"
        label={`I'd ${key.side} ${order.baseSymbol} at ${rateLine(order.price, order.baseSymbol, order.quoteSymbol)}`}
        text={rateShareText(key.side, order.price, order.baseSymbol, order.quoteSymbol)}
        build={(origin) => ({ shareUrl: rateShareUrl(origin, key, code), cardUrl: rateCardUrl(origin, key) })}
        downloadName={`rate-${order.baseSymbol}-${order.quoteSymbol}.png`.toLowerCase()}
      />
    </>
  );
}
