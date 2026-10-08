import Link from "next/link";
import { getMarketTapeData } from "@/lib/rows/tape";
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import { tokenColor } from "@/lib/swap/tokens";
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
 *
 * ## Every colour here is a LITERAL, and that is not an oversight
 *
 * The strip is deliberately dark at every width and in both themes — a ticker
 * band, not a themed surface — so its background is `#0D0F12` outright. Its ink
 * has to be literal for the same reason, and `text-white` is not: `globals.css`
 * maps `--color-white` to `--m-text-primary`, so the Tailwind `white` token
 * FOLLOWS THE THEME. In dark mode that resolves near-white and everything looks
 * correct; in light mode it resolves to `#1B2027` and the pair names and the
 * lead label render near-black on a near-black bar, while the prices — which
 * were already literal `#8B9299` — stay readable. The row looked like it had
 * lost half its text.
 *
 * `border-white/10` had the same problem one step quieter: a dark hairline on a
 * dark bar is simply absent.
 *
 * So: no `white`, no `--m-*` token, no theme-aware class on this component. If
 * a colour is added here it is a hex, chosen against `#0D0F12`. `NoticeRow`
 * already followed this rule with its `#17130C` chip; this row did not.
 */
export function TradingRow({
  content,
  visibleChains,
}: {
  content?: RowContent | null;
  /**
   * The operator's chain list, resolved once per request by `SiteRows`.
   *
   * Omitted means "no answer available", and the tape falls back to the
   * build's own `SUPPORTED_CHAINS` — the same degrade direction the client
   * hook takes, so an unreachable identity-service costs a filter rather than
   * the whole row.
   */
  visibleChains?: readonly string[];
}) {
  const row = resolveTradingRow(content, getMarketTapeData(visibleChains));
  if (!row) return null;
  const { pairs, leadText } = row;

  // Duplicate the sequence so the -50% translate loops seamlessly.
  const loop = [...pairs, ...pairs];

  return (
    <div className="relative flex h-9 items-stretch overflow-hidden border-b border-[rgba(255,255,255,0.05)] bg-[#0D0F12]">
      {/* Fixed lead label — the count is always readable while pairs scroll past. */}
      <div className="relative z-20 flex shrink-0 items-center gap-2 border-r border-[rgba(255,255,255,0.10)] bg-[#0D0F12] px-4 font-mono text-[11px] text-[#9BA2AA]">
        <span className="relative inline-flex h-[7px] w-[7px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--m-logo)] opacity-60" />
          <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[color:var(--m-logo)]" />
        </span>
        <span className="font-semibold text-[#E9E7E3]">{leadText}</span>
      </div>

      <div className="market-tape relative flex-1 overflow-hidden">
        <div className="market-tape-track flex h-full w-max items-center">
          {loop.map((p, i) => (
            <Link
              key={`${p.slug}-${p.base}-${p.quote}-${i}`}
              href={p.href}
              aria-hidden={i >= pairs.length ? true : undefined}
              tabIndex={i >= pairs.length ? -1 : undefined}
              className="flex items-center gap-2 whitespace-nowrap border-r border-[rgba(255,255,255,0.06)] px-4 font-mono text-[12.5px] text-[#D8D5D0] transition-colors hover:text-[#FFFFFF]"
            >
              {/*
                The pair's own mark, with its network chip at the lower right —
                the same thing every other row of this app draws for a market.

                It was a 7px dot tinted by a per-chain hue from `chainColor`, a
                palette that exists nowhere else in the product: the colour
                identified the chain to nobody, since the legend for it was not
                on screen. `ChainBadge` resolves the operator's own upload and
                degrades to the chain's two-letter initials, so the chip says
                which network in a form a reader can act on.
              */}
              <PairImageIcon
                base={p.base}
                quote={p.quote}
                baseLogoURI={p.baseLogoURI}
                quoteLogoURI={p.quoteLogoURI}
                baseColor={tokenColor(p.base)}
                quoteColor={tokenColor(p.quote)}
                chainName={p.network}
                className="h-[22px] w-[22px]"
              />
              <b className="font-semibold text-[#E9E7E3]">
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
