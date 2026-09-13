import Link from "next/link";
import { getMarketTapeData, chainColor } from "@/lib/rows/tape";
import type { RowContent } from "@/lib/rows/content";
import { resolveTradingRow } from "@/lib/rows/status";

/**
 * Row 2 — trading information.
 *
 * A full-bleed running tape of live markets, under the notice on every page.
 * The markets are real (see lib/rows/tape) so this reads as a venue rather
 * than decoration, without faking any aggregate figure. Pure CSS marquee: the
 * list is rendered twice and translated -50% for a seamless loop, pauses on
 * hover, and falls back to a static horizontal scroll under
 * prefers-reduced-motion (see .market-tape rules in globals.css).
 *
 * Prices are the token list's LISTING prices, not a live feed — the chain
 * indexers are the live source. `Pages/Home/DesktopPage` notes that a live
 * in-app tape is phase 2; when those prices are wired in, `lib/rows/tape`
 * changes and this markup does not.
 *
 * Visibility and the lead label are resolved by `lib/rows/status`, which is
 * also what apps/admin's `/rows` view reads — see that module for why.
 */
export function TradingRow({ content }: { content?: RowContent | null }) {
  const row = resolveTradingRow(content, getMarketTapeData());
  if (!row) return null;
  const { pairs, leadText } = row;

  // Duplicate the sequence so the -50% translate loops seamlessly.
  const loop = [...pairs, ...pairs];

  return (
    <div className="relative flex h-9 items-stretch overflow-hidden border-b border-white/5 bg-[#0D0F12]">
      {/* Fixed lead label — the count is always readable while pairs scroll past. */}
      <div className="relative z-20 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#0D0F12] px-4 font-mono text-[11px] text-[#9BA2AA]">
        <span className="relative inline-flex h-[7px] w-[7px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--m-logo)] opacity-60" />
          <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[color:var(--m-logo)]" />
        </span>
        <span className="font-semibold text-white">{leadText}</span>
      </div>

      <div className="market-tape relative flex-1 overflow-hidden">
        <div className="market-tape-track flex h-full w-max items-center">
          {loop.map((p, i) => (
            <Link
              key={`${p.slug}-${p.base}-${p.quote}-${i}`}
              href={p.href}
              aria-hidden={i >= pairs.length ? true : undefined}
              tabIndex={i >= pairs.length ? -1 : undefined}
              className="flex items-center gap-2 whitespace-nowrap border-r border-white/[0.06] px-4 font-mono text-[12.5px] text-[#D8D5D0] transition-colors hover:text-white"
            >
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: chainColor(p.network) }}
              />
              <b className="font-semibold text-white">
                {p.base}/{p.quote}
              </b>
              <span className="text-[#8B9299]">{p.priceLabel}</span>
            </Link>
          ))}
        </div>
        {/* Edge fade so items dissolve rather than clip at the right. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-11 bg-gradient-to-l from-[#0D0F12] to-transparent" />
      </div>
    </div>
  );
}
