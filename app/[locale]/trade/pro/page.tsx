import { AppShell } from "@/components/Shell/AppShell";
import { TradeDesktopPage } from "@/components/Pages/Trade/DesktopPage";
import { TradeMobilePage } from "@/components/Pages/Trade/MobilePage";
import { TradeModeSwitch } from "@/components/Trade/TradeModeSwitch";
import { TradePageProvider } from "@/contexts/TradePageProvider";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { OrderPageProvider } from "@/contexts/OrderPageProvider";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { getSpotOrderbook, getDefaultPair, getPairBySymbol } from "@/queries/server";
import { getDefaultScale } from "@/queries/client/orderbook";
import { adjustDecimalLength } from "@/utils/number";
import { Metadata } from "next";
import type { SpotPair } from "@/types";
import { Suspense } from "react";
import { Toaster } from "sonner";
import * as motion from "motion/react-client";
import { redirect } from "next/navigation";

/**
 * Trade · Pro — the order-book terminal.
 *
 * The pair-bound gear of the merged Trade surface. Basic (the convert card at
 * `/trade`) takes tokens and can route across several books; this one is a
 * single market, which is why `base`/`quote` live here and not there.
 * Market selection happens through PairPriceTracker's SearchPopover on desktop
 * and MobilePairSearch's bottom sheet below 1200px — two surfaces, each filtering
 * `defaultSpotPairData.pairs` with its own `String.includes`. That list is
 * listing-gated and paginated, so neither can find a market outside it: on RISE,
 * where all four markets are unverified, `/api/pairs/:pageSize/:page` returns
 * totalCount 0 and the picker is empty.
 *
 * PairFavorites is NOT mounted here, or anywhere. This comment claimed it was —
 * it is imported by no file, so the favourites strip it describes has never been
 * on the page.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string; base?: string; quote?: string }>;
}

/**
 * Resolve the pair from the query: base+quote -> exact pair; base only -> base
 * against the default quote; neither -> the network default pair.
 *
 * Null means the market data source answered and has no such market. That is a
 * different condition from a throw, which means it did not answer at all, and
 * the two get different copy — telling someone the indexer is down while it is
 * happily serving is how this page spent its time blaming the wrong component.
 */
async function resolvePair(
  networkName: string,
  base: string | undefined,
  quote: string | undefined,
): Promise<SpotPair | null> {
  if (base && quote) return getPairBySymbol(networkName, base, quote);
  const defaultPair = await getDefaultPair(networkName);
  if (!defaultPair) return null;
  if (base) return getPairBySymbol(networkName, base, defaultPair.quote.symbol);
  return defaultPair;
}

/**
 * The shell with an explanation instead of a terminal. Keeps the gear switch and
 * the sidebar, because the Basic/Pro switch points here and a bare `null` left
 * no way back.
 */
function TradeProUnavailable({
  network,
  networkName,
  unreachable,
}: {
  network: string;
  networkName: string;
  unreachable: boolean;
}) {
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell headerContent={<TradeModeSwitch />}>
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="font-dm-mono text-[11px] tracking-[0.12em] text-[color:var(--m-text-secondary)] uppercase">
              Order book unavailable
            </p>
            <h1 className="mt-3 text-xl font-semibold text-[color:var(--m-text-primary)]">
              {unreachable
                ? `No market data for ${networkName}`
                : `No markets on ${networkName} yet`}
            </h1>
            <p className="mt-2 text-sm text-[color:var(--m-text-secondary)]">
              {unreachable ? (
                <>
                  The indexer that serves depth and pair prices isn&apos;t
                  responding, so there&apos;s no book to show. Basic still works
                  — it quotes from the token list.
                </>
              ) : (
                <>
                  The indexer is responding, but no market has been created on
                  this network yet, so there&apos;s no book to bind to. Basic
                  still works — it quotes from the token list.
                </>
              )}
            </p>
          </div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const network = readDisplaySlug("trade", sp);
  const networkName = supportedNetworkName(network);

  // The page body tolerates an unreachable indexer but generateMetadata used
  // not to, and an unhandled throw here fails the whole route before any of
  // that fallback runs — the reason /trade returned a server error whenever the
  // indexer was down. Degrade to a pair-less title instead.
  let pairTitle: string | null = null;
  let pairDescription: string | null = null;
  // The share card is per-market, so it needs the symbols the title resolved —
  // not `sp.base`/`sp.quote`, which are absent on a default-pair URL and
  // half-present on a base-only one.
  let cardUrl = "/api/og";
  try {
    const pair = await resolvePair(networkName, sp.base, sp.quote);
    if (pair) {
      const formattedPrice = adjustDecimalLength(pair.price, 4);
      pairTitle = `${formattedPrice} | ${pair.base.symbol}/${pair.quote.symbol} | Iter ${networkName}`;
      pairDescription = `Trade ${pair.base.symbol} to ${pair.quote.symbol} and other cryptocurrencies in the world's first cryptocurrency orderbook DEX on ${networkName}. Find real-time live price with technical indicators to help you analyze ${pair.base.symbol}/${pair.quote.symbol} changes.`;
      cardUrl =
        `/api/og/pair?chain=${encodeURIComponent(network)}` +
        `&base=${encodeURIComponent(pair.base.symbol)}` +
        `&quote=${encodeURIComponent(pair.quote.symbol)}`;
    }
  } catch {
    // Swallowed deliberately: metadata is not worth a 500. The card falls back
    // to the generic image with it, rather than naming a market we could not
    // resolve.
  }

  const title = pairTitle ?? `Trade | Iter ${networkName}`;
  const description =
    pairDescription ??
    `Trade on the Iter on-chain order book on ${networkName} — full depth, live chart, and resting orders.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      // PNG, not JPEG — this said `image/jpeg` while `ImageResponse` has always
      // emitted PNG, on a route that now actually renders one.
      images: [{ url: cardUrl, width: 1200, height: 630, type: "image/png", alt: title }],
    },
    twitter: { card: "summary_large_image", images: [cardUrl] },
  };
}

export default async function TradePro({ searchParams }: PageProps) {
  const sp = await searchParams;
  const network = readDisplaySlug("trade", sp);
  const networkName = supportedNetworkName(network);

  // Resolved outside the try below, because `redirect()` signals by throwing and
  // a catch around it would swallow the navigation.
  let pair: SpotPair | null = null;
  let unreachable = false;
  try {
    pair = await resolvePair(networkName, sp.base, sp.quote);
  } catch (error) {
    console.error("Error resolving pair in trade pro page:", error);
    unreachable = true;
  }

  // A named pair that doesn't resolve falls back to the network default once
  // (a different URL, so no loop).
  if (!pair && !unreachable && (sp.base || sp.quote)) {
    redirect(`/trade/pro?chain=${network}`);
  }

  if (!pair) {
    return (
      <TradeProUnavailable
        network={network}
        networkName={networkName}
        unreachable={unreachable}
      />
    );
  }

  try {
    const defaultScale = getDefaultScale(pair.price, pair.scales);
    const orderbook = await getSpotOrderbook(
      networkName,
      pair.base,
      pair.quote,
      defaultScale,
      11,
      false,
    );
    return (
      <MarketPageProvider networkSlugInput={network}>
        <TradePageProvider
          baseInput={pair.base}
          quoteInput={pair.quote}
          pairInput={pair}
          orderbookInput={orderbook}
        >
          <OrderPageProvider>
            <AppShell
              headerContent={
                <>
                  <span className="font-dm-mono text-sm font-medium text-[color:var(--m-text-primary)]">
                    {pair.base.symbol}
                    <span className="text-[color:var(--m-text-secondary)]">
                      /{pair.quote.symbol}
                    </span>
                  </span>
                  <TradeModeSwitch />
                </>
              }
            >
              <div className="relative isolate min-h-full">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  id="trade-desktop-page"
                  className="hidden w-full min-[1200px]:block"
                >
                  <Suspense fallback={<div>Loading...</div>}>
                    <TradeDesktopPage />
                  </Suspense>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  id="trade-tablet-page"
                  className="hidden min-[375px]:block min-[1200px]:hidden"
                >
                  <TradeMobilePage />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  id="trade-mobile-page"
                  className="block min-[375px]:hidden"
                >
                  <TradeMobilePage />
                </motion.div>
              </div>
              <Toaster
                position="bottom-right"
                closeButton
                toastOptions={{
                  style: {
                    background: "var(--m-surface)",
                    border: "1px solid var(--m-border)",
                    borderRadius: "10px",
                    color: "var(--m-text-primary)",
                  },
                }}
              />
            </AppShell>
          </OrderPageProvider>
        </TradePageProvider>
      </MarketPageProvider>
    );
  } catch (error) {
    // The pair resolved but its book did not load, so the market data source is
    // unreachable rather than empty.
    console.error("Error in trade pro page:", error);
    return (
      <TradeProUnavailable
        network={network}
        networkName={networkName}
        unreachable
      />
    );
  }
}
