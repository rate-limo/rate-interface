import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { supportedNetworkName } from "@/lib/routing/chainParams";
import { adjustDecimalLength } from "@/utils/number";
import { getPairBySymbol } from "@/queries/server/pairs";
import { getSpotOrderbook } from "@/queries/server/orderbooks";
import { colonnadeDataUri } from "@/lib/graphics/colonnadePng";
import { colonnadeProfile, columnCountFor, ornamentProfile } from "@/lib/graphics/depthColonnade";
import type { SpotPair } from "@/types";

/**
 * The share card for one Pro market.
 *
 * `/trade/pro` already built a per-market TITLE — price, pair and network — and
 * pointed `openGraph.images` at the static `/api/og`. So the tab said
 * `0.9925 | SKHY/USDC | Rate Arc Testnet` while the thing anyone actually saw
 * in a feed said nothing about the market at all.
 *
 * ## The listing chip is on the IMAGE, deliberately
 *
 * A generic card cannot misrepresent a market because it says nothing about
 * one. This card can. Anyone can mint a coin and open a market here — the
 * codebase is blunt that "this venue lets anyone mint a coin called USDC" — and
 * from the moment this route exists, every such market gets an official-looking
 * Rate card carrying our branding, a real price and a real volume, rendered by
 * us and served from our domain.
 *
 * By the time a reader has taken in the card they have formed the impression,
 * so putting the listing state only on the page behind it is too late. This is
 * the common case rather than the edge one: every market on RISE is currently
 * unverified.
 *
 * ## Colours are fixed, not themed
 *
 * A rendered PNG has no `prefers-color-scheme`. The card commits to Monet's
 * dark values rather than reading tokens that cannot resolve here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Monet dark, mirrored from globals.css. Literals because a rendered image has
 * no cascade to read `--m-*` from. */
const GROUND = "#0D0F12";
const SURFACE = "#14171B";
const SURFACE_2 = "#1B1F24";
const BORDER = "#272C33";
const TEXT = "#E9E7E3";
const TEXT_2 = "#9BA2AA";
const TEXT_3 = "#6D747C";
const SUCCESS = "#6E9E7C";
const ERROR = "#BE7168";
const ACCENT = "#E85D2A"; // Rate orange
const LOGO = "#E85D2A"; // ember
const ON_MEDIA = "#F7F9FC"; // identical in both themes
const GRAPHIC_BID: readonly [number, number, number] = [63, 167, 106];
const GRAPHIC_ASK: readonly [number, number, number] = [76, 141, 255];

const WIDTH = 1200;
const HEIGHT = 630;

/** How long the book fetch may take before the card gives up on it. An OG
 * scraper abandons a slow image, and the colonnade is decoration — a card that
 * arrives with an ornamental silhouette beats one that never arrives. */
const BOOK_BUDGET_MS = 1200;

/**
 * The app's own USD rule, which the existing OG shell already follows: an
 * em-dash for anything that is not a positive finite number, never `$0`. A
 * zero has to mean zero — `PHNX/ETH` has zero quote TVL today, so this fires
 * on a real market rather than a hypothetical one.
 */
function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function initials(symbol: string): string {
  return symbol.trim().slice(0, 2).toUpperCase();
}

function chainInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The colonnade behind the card, as a data URI.
 *
 * Drawn from THIS market's book when one is reachable. `ornamentProfile` is the
 * sanctioned fallback for a surface with no book — its own docstring says a
 * caller reaching for it is stating the silhouette carries no information —
 * which is exactly the honest reading when the depth request did not answer.
 * Never synthesise a book to fill the gap.
 */
async function backdrop(networkName: string, pair: SpotPair | null): Promise<string> {
  const columnCount = columnCountFor(WIDTH, HEIGHT);
  let columns = ornamentProfile(columnCount);

  if (pair?.base?.id && pair?.quote?.id) {
    try {
      const book = await Promise.race([
        getSpotOrderbook(networkName, pair.base, pair.quote, "1", columnCount, false),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), BOOK_BUDGET_MS)),
      ]);
      const bids = book?.bids?.buckets ?? [];
      const asks = book?.asks?.buckets ?? [];
      if (bids.length || asks.length) {
        columns = colonnadeProfile(
          bids.map((b) => ({ size: Number(b.baseLiquidity) || 0 })),
          asks.map((a) => ({ size: Number(a.baseLiquidity) || 0 })),
          columnCount,
        );
      }
    } catch {
      // Decoration. A failed depth read must not cost the card.
    }
  }

  return colonnadeDataUri({
    width: WIDTH,
    height: HEIGHT,
    columns,
    ground: [13, 15, 18],
    bid: GRAPHIC_BID,
    ask: GRAPHIC_ASK,
    // A haze, not a mural — the card's own text sits over this.
    gain: 0.42,
    coverageRange: [0.3, 0.72],
  });
}

/**
 * LogoMarkV2 in divs rather than SVG.
 *
 * Same twelve columns and the same diagonal wipe as `components/Atoms/
 * LogoMarkV2.tsx`, at the favicon's own coordinates scaled off the 512 viewBox.
 * Built from boxes because Satori's SVG support is a subset and this mark is
 * only ever rectangles on a rounded tile — there is nothing here that needs a
 * path.
 */
function LogoMark({ size }: { size: number }) {
  const k = size / 512;
  const xs = [402.83, 375.29, 347.78, 320.23, 292.72, 265.17, 237.66, 210.12, 182.6, 155.06, 127.55, 100.0];
  const wipe: [number, number, number, number][] = [
    [402.83, 101.29, 148.52, 0.08], [375.29, 110.57, 146.97, 0.16],
    [347.78, 119.86, 148.52, 0.24], [320.23, 135.32, 148.52, 0.32],
    [292.72, 158.54, 145.43, 0.4], [265.17, 186.39, 145.43, 0.48],
    [237.66, 211.13, 145.43, 0.56], [210.25, 231.25, 146.97, 0.64],
    [182.6, 243.61, 145.43, 0.72], [155.06, 259.1, 140.79, 0.8],
    [127.55, 265.28, 145.43, 0.88], [100.0, 279.22, 131.5, 1],
  ];
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: size,
        height: size,
        borderRadius: 64 * k,
        background: LOGO,
      }}
    >
      {xs.map((x) => (
        <div
          key={`ray-${x}`}
          style={{
            position: "absolute",
            left: x * k,
            top: 101.29 * k,
            width: 9.18 * k,
            height: 309.42 * k,
            background: ON_MEDIA,
          }}
        />
      ))}
      {wipe.map(([x, y, h, o]) => (
        <div
          key={`wipe-${x}`}
          style={{
            position: "absolute",
            left: x * k,
            top: y * k,
            width: 9.18 * k,
            height: h * k,
            background: LOGO,
            opacity: o,
          }}
        />
      ))}
    </div>
  );
}

/** A token disc, matching TokenImageIcon's circular mark with initials. */
function Disc({ text, size }: { text: string; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size / 2,
        background: SURFACE_2,
        border: `1px solid ${BORDER}`,
        color: TEXT_2,
        fontSize: size * 0.32,
      }}
    >
      {text}
    </div>
  );
}

/**
 * The pair mark: two overlapping discs with ChainBadge at the quote's lower
 * right — the same construction every row of the app draws. Initials rather
 * than artwork: `ImageResponse` fetches images at render, which is why the
 * explore route restricts itself to absolute http(s) logos. Real marks are a
 * measured follow-up, not a thing to slip in behind a network call here.
 */
function PairMark({ base, quote, chain }: { base: string; quote: string; chain: string }) {
  const size = 86;
  const badge = 34;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Disc text={base} size={size} />
      <div style={{ display: "flex", position: "relative", marginLeft: -22 }}>
        <Disc text={quote} size={size} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "absolute",
            right: -6,
            bottom: -6,
            width: badge,
            height: badge,
            borderRadius: badge * 0.3,
            background: SURFACE,
            border: `3px solid ${GROUND}`,
            color: TEXT_2,
            fontSize: 13,
          }}
        >
          {chain}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "18px 22px",
        border: `1px solid ${BORDER}`,
        borderRadius: 9,
        // Opaque. These sat at 82% over the colonnade and the dither read
        // straight through the numbers they exist to carry.
        background: SURFACE,
      }}
    >
      <div style={{ display: "flex", color: TEXT_3, fontSize: 15, letterSpacing: 1.6 }}>{label}</div>
      <div style={{ display: "flex", marginTop: 7, fontSize: 28, color: TEXT }}>{value}</div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const network = params.get("chain") ?? "";
  const networkName = supportedNetworkName(network);
  const baseSymbol = params.get("base") ?? "";
  const quoteSymbol = params.get("quote") ?? "";

  let pair: SpotPair | null = null;
  try {
    if (baseSymbol && quoteSymbol) {
      pair = await getPairBySymbol(networkName, baseSymbol, quoteSymbol);
    }
  } catch {
    // Same posture as the page's own generateMetadata, which swallows a resolve
    // failure because "metadata is not worth a 500". A card naming the pair from
    // the query is still a better share than no image.
  }

  const symbol = pair?.symbol ?? (baseSymbol && quoteSymbol ? `${baseSymbol}/${quoteSymbol}` : "Rate");
  const base = pair?.base?.symbol ?? baseSymbol;
  const quote = pair?.quote?.symbol ?? quoteSymbol;
  const change = Number(pair?.dayPriceDifferencePercentage ?? 0);
  const changeColor = change > 0 ? SUCCESS : change < 0 ? ERROR : TEXT_2;
  const changeText = `${change > 0 ? "+" : ""}${Number.isFinite(change) ? change.toFixed(2) : "0.00"}%`;
  const price = Number(pair?.price);
  // Both legs, matching what PairPriceTracker and SpotPairTable render on the
  // page this card links to. A preview and a page disagreeing about volume is
  // worse than either number alone.
  const volume = Number(pair?.dayQuoteVolumeUSD ?? 0) * 2;
  const listed = pair?.verified === true;

  const image = await backdrop(networkName, pair);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: GROUND }}>
        <img src={image} width={WIDTH} height={HEIGHT} style={{ position: "absolute", left: 0, top: 0 }} />
        {/* The scrim, same device and same colour as `--m-scrim`. Weighted to
            the top, where the pair symbol and price sit: the colonnade is a
            backdrop, and at even opacity its capitals cut straight through the
            one line the card exists to say. Lightest at the base so the
            stylobate still reads as ground the card stands on. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WIDTH,
            height: HEIGHT,
            background:
              "linear-gradient(to bottom, rgba(13,15,18,0.95) 0%, rgba(13,15,18,0.90) 46%, rgba(13,15,18,0.62) 78%, rgba(13,15,18,0.42) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "64px 70px",
            color: TEXT,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LogoMark size={36} />
            <div style={{ display: "flex", color: LOGO, fontSize: 22, fontWeight: 700, letterSpacing: 1.8 }}>Rate</div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
              {base && quote ? (
                <PairMark base={initials(base)} quote={initials(quote)} chain={chainInitials(networkName)} />
              ) : null}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -1.6 }}>{symbol}</div>
                <div style={{ display: "flex", marginTop: 10, color: TEXT_2, fontSize: 23 }}>
                  {`Trade Pro · ${networkName}`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 58 }}>
                {/* The page's own formatter, so the card and the <title> it
                    accompanies never print one price two ways. */}
                {Number.isFinite(price) && price > 0 ? adjustDecimalLength(price, 4) : "—"}
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 25, color: changeColor }}>{changeText}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <Stat label="24H VOLUME" value={money(volume)} />
            <Stat label="QUOTE TVL" value={money(pair?.dayQuoteTvlUSD)} />
            <Stat label="QUOTE" value={quote || "—"} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", color: LOGO, fontSize: 17, letterSpacing: 1.8 }}>RATE · ITER.CX</div>
            <div
              style={{
                display: "flex",
                padding: "7px 14px",
                borderRadius: 5,
                fontSize: 15,
                letterSpacing: 1.8,
                color: listed ? SUCCESS : ACCENT,
                background: listed ? "rgba(110,158,124,0.14)" : "rgba(196,169,106,0.15)",
                border: `1px solid ${listed ? "rgba(110,158,124,0.42)" : "rgba(196,169,106,0.45)"}`,
              }}
            >
              {listed ? "LISTED" : "UNLISTED MARKET"}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
