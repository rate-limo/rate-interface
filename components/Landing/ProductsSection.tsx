import Image from "next/image";
import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { Button } from "@components/Landing/ui/Button";
import { EarnDepositCard } from "@components/Landing/EarnDepositCard";
import { DEFAULT_CHAIN_SLUG, buildPageUrl } from "@/lib/routing/chainParams";

/**
 * What Rate sells — Launch, Trade, Earn — shown, not told.
 *
 * One short line per product and a picture that proves it. The pictures are
 * real screens from the app on Arc Testnet (public/images/landing), not
 * mock-ups:
 *
 *   app-book.webp   the Pro order book: an ask, POOL rows (LP liquidity resting
 *                   on the same book, ±0.10%), the spread, POOL, a bid
 *   app-launch.webp the auction launch flow, "Open with a fair price."
 *
 * Re-shoot them when those screens change; a screenshot that no longer matches
 * the app is a small lie on the front page.
 *
 * Earn is not a screenshot: it is EarnDepositCard, the app's own measured
 * "Estimated APY" for a one-token deposit, or an em-dash with the reason.
 *
 * Claims stay inside the brand book's rules: no promised profit, no invented
 * yield number, and the auction is fixed-price (it does not discover a price).
 */

/** AMM vs order book in one glance: on a curve, size moves your price; on the book you name it. */
function CurveVsBook() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <figure className="flex flex-col rounded-2xl border border-dark-grey-3 bg-black-300 p-5">
        <figcaption className="font-mono-brand text-[11px] tracking-[0.14em] text-dark-grey-1 uppercase">AMM curve</figcaption>
        <svg viewBox="0 0 240 150" className="mt-3 h-auto w-full" role="img" aria-label="On an AMM curve, a bigger trade slides to a worse price">
          <path d="M20 14 C 40 96, 90 126, 228 134" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" className="text-white" />
          <circle cx="48" cy="74" r="5" fill="var(--m-primary)" />
          <path d="M56 80 C 80 104, 110 116, 150 124" fill="none" stroke="var(--m-error)" strokeWidth="2.5" strokeDasharray="5 4" markerEnd="url(#cvb-arrow)" />
          <circle cx="158" cy="127" r="5" fill="var(--m-error)" />
          <defs>
            <marker id="cvb-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--m-error)" />
            </marker>
          </defs>
        </svg>
        <p className="mt-3 text-sm text-dark-grey-1">The curve picks your price. Size makes it worse.</p>
      </figure>
      <figure className="relative flex flex-col rounded-2xl border border-[color:var(--m-accent)]/40 bg-black-300 p-5">
        <figcaption className="font-mono-brand text-[11px] tracking-[0.14em] text-[color:var(--m-accent-text)] uppercase">Rate order book</figcaption>
        <div className="relative mt-3 overflow-hidden rounded-lg">
          <Image src="/images/landing/app-book.webp" alt="Rate's order book on Arc Testnet: limit orders at 1.02 and 0.98 with pool liquidity resting between them" width={610} height={390} className="h-auto w-full" />
        </div>
        <p className="mt-3 text-sm text-dark-grey-1">You name the price. LP liquidity rests on the same book.</p>
      </figure>
    </div>
  );
}

function Shot({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-dark-grey-3 bg-black-300 shadow-[0_30px_80px_-48px_rgba(0,0,0,.7)]">
      <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full" />
    </div>
  );
}

const ROWS = [
  {
    n: "01 · Launch",
    title: "Launch with a real market.",
    line: "Same order book from day one. One price for every buyer.",
    cta: "Launch a token",
    href: (slug: string) => buildPageUrl("create", { slug }),
    visual: <Shot src="/images/landing/app-launch.webp" alt="Rate's auction launch flow: Open with a fair price" width={1600} height={886} />,
  },
  {
    n: "02 · Trade",
    title: "Your price, or no fill.",
    line: "A fully onchain order book. Not a curve.",
    cta: "Set your rate",
    href: (slug: string) => buildPageUrl("trade", { slug, pro: true }),
    visual: <CurveVsBook />,
  },
  {
    n: "03 · Earn",
    title: "Get paid to hold.",
    line: "Deposit one token. Trades that fill against it pay you the fee.",
    cta: "Provide liquidity",
    href: (slug: string) => buildPageUrl("pool", { slug, provide: true }),
    visual: <EarnDepositCard />,
  },
];

export function ProductsSection() {
  const slug = DEFAULT_CHAIN_SLUG;
  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display text-4xl font-medium tracking-tight text-white sm:text-5xl md:text-6xl">
            Launch. Trade. Earn.
          </h2>
        </Reveal>

        <div className="mt-16 flex flex-col gap-20 md:gap-28">
          {ROWS.map((row, i) => (
            <Reveal key={row.n}>
              <div className={`grid items-center gap-8 lg:gap-14 ${i % 2 === 1 ? "lg:grid-cols-[1.2fr_0.8fr]" : "lg:grid-cols-[0.8fr_1.2fr]"}`}>
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <span className="font-mono-brand text-xs tracking-[0.14em] text-[color:var(--m-accent-text)] uppercase">{row.n}</span>
                  <h3 className="font-display mt-3 text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl">{row.title}</h3>
                  <p className="mt-3 max-w-sm text-lg leading-relaxed text-dark-grey-1">{row.line}</p>
                  <div className="mt-7">
                    <Button href={row.href(slug)} variant={row.n.endsWith("Earn") ? "solid" : "outline"}>
                      {row.cta}
                    </Button>
                  </div>
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : undefined}>{row.visual}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
