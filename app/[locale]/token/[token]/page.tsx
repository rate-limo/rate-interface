import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { LaunchTokenProfile } from "@/components/Pages/Launch/LaunchTokenProfile";
import { getTokenByAddress, getTokenBySymbol } from "@/queries/server/tokens";
import { getBasePairs } from "@/queries/server/pairs";
import { getLiquidityOverview } from "@/lib/liquidity/poolStats";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import type { SpotToken } from "@/types";

/**
 * The token page. One route, replacing /price/[token] and /coin/[token].
 *
 * Those two split the same subject by how a token had arrived: /price was the
 * symbol-keyed SEO page, /coin the address-keyed launch profile, and
 * `TokensTable` picked between them per row on whether `creator` was set — so
 * one row led to a page you could trade from and the row beneath it did not.
 *
 * This keeps /coin's body (it accepts an address, which /price could not
 * resolve at all, and it carries the ActionDock) and what remains of /price's
 * SEO surface: the descriptive title and the breadcrumb. Both old paths redirect
 * permanently from next.config.ts, so the search equity follows.
 *
 * The Strapi FAQ came across too and has since been REMOVED with that
 * integration — it had been fetching a CMS that no longer resolves, so it
 * rendered nothing either way. The page's indexable body copy is now the
 * creator's own `description`, which `LaunchTokenProfile` renders server side;
 * see its note.
 */

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ chain?: string }>;
}

/** Address or symbol — /coin accepted both and inbound launch links are addresses. */
async function resolveToken(networkName: string, tokenKey: string): Promise<SpotToken> {
  return tokenKey.startsWith("0x")
    ? await getTokenByAddress(networkName, tokenKey)
    : await getTokenBySymbol(networkName, tokenKey);
}

/**
 * Compact USD for share copy. Returns null rather than "$0" when there is no
 * figure — a zero here is indistinguishable from a token that really is worth
 * nothing, and the caller drops the clause instead.
 */
function fmtUsd(value: unknown, opts: { precise?: boolean } = {}): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (opts.precise) return n < 0.01 ? `$${n.toPrecision(2)}` : `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const network = readDisplaySlug("token", await searchParams);
  const networkName = supportedNetworkName(network);
  const tokenKey = decodeURIComponent(token);

  // A lookup failure must not take down metadata — it degrades to the neutral
  // title instead, the same call /coin already made.
  let meta: SpotToken | null = null;
  try {
    meta = await resolveToken(networkName, tokenKey);
  } catch {
    meta = null;
  }

  const symbol = meta?.symbol ?? tokenKey;
  const name = meta?.name ?? symbol;

  // /price's title, kept verbatim in shape because it is the one search results
  // already show for these tokens, and this route is where that traffic now
  // lands. The launch wording is additive: "launch profile" is a claim about a
  // launch on Iter, and this route also serves tokens that arrived any other
  // way, so it is gated on the same `creator` column the page's own gate uses.
  const launched = Boolean(meta?.creator);
  const title = `${symbol} – ${name} Price, ${symbol} Price Chart & Marketcap in ${networkName} – Iter`;

  // Lead with the live numbers. A share card whose description is generic prose
  // reads as a brochure; the figures are the reason anyone opens a token link,
  // and this is the line that renders under the image in every chat client.
  // Both degrade rather than print "$0", which is indistinguishable from a real
  // zero on a token that simply has not traded yet.
  const priceLine = fmtUsd(meta?.priceUSD, { precise: true });
  const capLine = fmtUsd(meta?.marketCap);
  const facts = [
    priceLine ? `Live ${symbol} price: ${priceLine}.` : `${symbol} is not priced yet.`,
    capLine ? `Market cap ${capLine}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const description = `${facts} Trade ${symbol} on ${networkName} via Iter.${
    launched ? ` Track its launch progress and graduation.` : ""
  }`;

  const canonical = `/token/${encodeURIComponent(tokenKey)}?chain=${encodeURIComponent(network)}`;
  const image = `/api/og/explore?kind=token&token=${encodeURIComponent(token)}&network=${encodeURIComponent(networkName)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      // Declared explicitly: several scrapers render a card only once they know
      // the dimensions, rather than waiting to fetch and measure the image.
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image, alt: title }] },
  };
}

export default async function TokenPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const network = readDisplaySlug("token", await searchParams);
  const networkName = supportedNetworkName(network);
  const tokenKey = decodeURIComponent(token);
  const tokenData = await resolveToken(networkName, tokenKey);

  const [{ pairs }, overview] = await Promise.all([
    getBasePairs(networkName, tokenData.symbol),
    getLiquidityOverview(networkName),
  ]);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <LaunchTokenProfile
          token={tokenData}
          pairs={pairs ?? []}
          thresholdUsd={overview.thresholdUsd}
          networkName={networkName}
          networkSlug={network}
        />
      </AppShell>
    </MarketPageProvider>
  );
}
