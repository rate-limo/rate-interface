"use client";

import Link from "next/link";
import { ogPassConfig } from "@/lib/ogpass/mock";
import { useCountdown } from "@/components/OgPass/useCountdown";
import type { RowContent } from "@/lib/rows/content";
import { resolveNoticeRow } from "@/lib/rows/status";

/**
 * Row 1 — the notice.
 *
 * A slim announcement strip at the very top of every page, currently carrying
 * the OG Pass sale with the same hydration-safe countdown as the pass page:
 * "starts in Nd Nh" before the sale, "is LIVE" after. Its copy and destination
 * are operator-set, so it is the notice SLOT rather than an OG-Pass-specific
 * banner — point it anywhere.
 *
 * The copy is resolved by `lib/rows/status`, not here, so apps/admin's `/rows`
 * view reports this row by running the same function rather than a second copy
 * of these fallbacks.
 */
export function NoticeRow({ content }: { content?: RowContent | null }) {
  const config = ogPassConfig();
  const countdown = useCountdown(config.saleStartsInSec);

  const row = resolveNoticeRow(content, countdown);
  if (!row) return null;

  const { text: label, detail, ctaLabel, href } = row;

  return (
    <Link
      href={href}
      /* Graphite, not emerald (2026-08-05). This strip sits above every page, so
         it set the colour temperature for the whole product before a single
         page rendered — a saturated green gradient with a mint CTA was the
         loudest thing on screen and the first thing anyone saw. It stays a
         fixed dark bar in both modes; only its hue changed. The status dot is
         now the only colour here, which is what makes it read as a status. */
      className="flex items-center gap-3 px-4 py-[10px] text-[13px] text-[#DCDAD5] transition-[filter] [background:linear-gradient(90deg,#12161A,#1B2027)] hover:brightness-125"
    >
      <span
        className={
          countdown.isLive
            ? "h-2 w-2 shrink-0 rounded-full bg-[#6E9E7C]"
            : "h-2 w-2 shrink-0 rounded-full bg-[#E85D2A]"
        }
      />
      <b className="font-mono font-bold tabular-nums">{label}</b>
      {detail && <span className="hidden text-[#9BA2AA] sm:inline">· {detail}</span>}
      <span className="ml-auto shrink-0 rounded-[8px] bg-[#E85D2A] px-3 py-[6px] font-mono text-[12px] font-semibold text-[#17130C]">
        {ctaLabel}
      </span>
    </Link>
  );
}
