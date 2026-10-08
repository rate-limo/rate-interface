import { AppToaster } from "@/components/Shell/AppToaster";
import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { BackdropImage } from "@/components/Shell/BackdropImage";
import { TradeModeSwitch } from "@/components/Trade/TradeModeSwitch";
import { SwapCard } from "@/components/Swap/SwapCard";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

/**
 * Trade · Basic — the convert card, and the app's default trading entry.
 *
 * Swap merged into Trade here (2026-07-29, finishing the Basic/Advanced model
 * the swap spec already called for). `/swap` now redirects to this route.
 *
 * Deliberately NOT pair-bound: this reads no `base`/`quote`. The card converts
 * between tokens and the router may cross several books to do it — a multi-hop
 * route has no single pair to name, so binding the card to one would misdescribe
 * what it does. The order book at `/trade/pro` is the pair-bound gear.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

/**
 * Backdrop still for the Basic trade page — a local asset, drifting slowly.
 *
 * Was a CloudFront video until 2026-08-14. It looked right but its loop was not
 * seamless (last frame ≠ first), so the whole background jump-cut on every pass;
 * a still has no seam to get wrong. Also 355KB here against 44MB there, on the
 * page where the swap card is already competing for first-paint bandwidth.
 *
 * Served from /public rather than the CDN because it is small enough that a
 * second origin, a second DNS lookup and a third-party dependency all buy
 * nothing.
 */
const TRADE_BACKDROP_IMAGE = "/images/trade-backdrop.webp";

// Static metadata — no live query. The indexers (the live price/quote source) are
// down, and the swap universe is derived from the token list client-side, so we
// keep this dependency-free (unlike the Pro page, which reads getDefaultPair).
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("trade", await searchParams);
  const networkName = supportedNetworkName(network);
  const title = `Trade | Rate ${networkName}`;
  const description = `Swap any token to any token on ${networkName} — the router finds the path across the on-chain order book, fills what it can now, and lets you rest the remainder as a limit or provide it as single-sided liquidity. Self-custody, routed via Pool.sol.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: "/api/og",
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: "Rate",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/api/og"],
    },
  };
}

export default async function TradeBasic({ searchParams }: PageProps) {
  const network = readDisplaySlug("trade", await searchParams);
  const networkName = supportedNetworkName(network);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell headerContent={<TradeModeSwitch />}>
        {/* `relative isolate` was already here and is what BackdropImage needs:
            it scopes the video's -z-10 to this container, so the backdrop covers
            the page area and never slides under the shell's sidebar, header or
            status bar. `min-h-full` alone would let the video stop short of the
            fold on a tall viewport with a short card, so this run also pins the
            container to the viewport minus the shell's chrome. */}
        <div className="relative isolate min-h-full min-[1200px]:min-h-[calc(100dvh-100px)]">
          <BackdropImage src={TRADE_BACKDROP_IMAGE} />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="trade-basic-page"
            className="w-full"
          >
            {/* 430px on mobile — the card design that works there is unchanged.
                880px from 900px up, where SwapCard lays itself out in two
                columns; centred so a wide monitor doesn't get a wide form. */}
            <div className="mx-auto w-full max-w-[430px] px-4 py-10 sm:py-14 min-[900px]:max-w-[880px]">
              <SwapCard networkName={networkName} networkSlug={network} />
            </div>
          </motion.div>
        </div>
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
