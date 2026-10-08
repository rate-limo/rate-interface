import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { parseRateCardKey, rateCardUrl, rateLine } from "@/lib/rateCard/share";
import { resolveRateCard } from "@/lib/rateCard/resolve";

/**
 * Where a shared "my rate" card lands — `/rate?chain=&address=&pair=&side=&order=&ref=`.
 *
 * The card is the unfurl (`generateMetadata` points crawlers at
 * `/api/og/rate`), and the page is the next step for whoever clicked it: the
 * same card, and one button to set their own rate on the same market.
 *
 * `?ref=` needs no handling here. `RefCapture` is mounted in AppShell and
 * stashes it from any page, so the sharer is credited when this visitor's first
 * order goes in — the card is a referral link that happens to say something.
 */
type SearchParams = Record<string, string | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const key = parseRateCardKey(await searchParams);
  const title = "My rate | Rate";
  const description = "Don't trade. Let the market come to you.";
  if (!key) return { title, description, robots: { index: false, follow: true } };
  const image = rateCardUrl("", key);
  return {
    title,
    description,
    // One page per order: nothing a search result wants.
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: "A Rate limit order card" }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image, alt: "A Rate limit order card" }] },
  };
}

export default async function RateCardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const key = parseRateCardKey(params);
  const order = key ? await resolveRateCard(key) : null;
  const slug = key?.chain;
  const known = order && order.state !== "unknown" ? order : null;

  const tradeHref = known
    ? buildPageUrl("trade", { slug, pro: true, base: known.baseSymbol, quote: known.quoteSymbol })
    : buildPageUrl("trade", { slug });
  const heading = known
    ? known.state === "filled"
      ? `Filled at ${rateLine(known.price, known.baseSymbol, known.quoteSymbol)}`
      : `Waiting for ${rateLine(known.price, known.baseSymbol, known.quoteSymbol)}`
    : "Set your rate.";

  return (
    <MarketPageProvider networkSlugInput={slug}>
      <AppShell>
        <section className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-12 text-center md:py-16">
          {key ? (
            // eslint-disable-next-line @next/next/no-img-element -- the card is a generated route, not a static asset
            <img
              src={rateCardUrl("", key)}
              alt=""
              width={1200}
              height={630}
              className="w-full rounded-2xl border border-[color:var(--m-border)] shadow-[0_24px_60px_-32px_rgba(0,0,0,.6)]"
            />
          ) : null}
          <h1 className="font-display mt-10 text-3xl font-semibold tracking-tight text-balance text-[color:var(--m-text-primary)] sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-[color:var(--m-text-secondary)]">
            Don&apos;t trade. Pick the price you want, place it as a limit order, and walk away. It
            fills only at your rate.
          </p>
          <Link
            href={tradeHref}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-[color:var(--m-primary)] px-6 py-3 font-mono-brand text-xs font-medium tracking-[0.14em] text-[color:var(--m-on-primary)] uppercase hover:bg-[color:var(--m-primary-hover)]"
          >
            {known ? `Set your rate on ${known.baseSymbol}/${known.quoteSymbol}` : "Set your rate"}
          </Link>
        </section>
      </AppShell>
    </MarketPageProvider>
  );
}
