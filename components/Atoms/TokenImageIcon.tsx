"use client";

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { tokenColor } from '@/lib/swap/tokens';
import { chainIconFrom, nativeIconFrom, useChainBrand } from '@/lib/chains/useChainBrand';
import { tokenLogoURI } from '@/lib/tokens/logo';

type TokenSize = 'sm' | 'md' | 'lg';

type TokenImageIconProps = {
  symbol: string;
  color: string;
  logoURI?: string;
  size?: TokenSize;
  className?: string;
  /**
   * Which chain this token is on. Does TWO jobs, and they are separable:
   * it draws the badge below, and it is what lets `nativeIconFrom` recognise the
   * chain's own gas token and prefer the operator's mark for it.
   */
  chainName?: string;
  /**
   * Draw the badge. Default true, so every existing call site is unchanged.
   *
   * `false` is for a caller that needs the chain for RESOLUTION but not for
   * display — the status bar's gas chip is one: it already says "Gas" and sits
   * at 11px, where a network chip on a 16px mark is noise rather than
   * information. Naming the chain and drawing a badge were one prop until that
   * caller existed, which is the only reason they looked like one thing.
   */
  badge?: boolean;
};

// The launch quote options expose symbol/address/price metadata, but not a
// logoURI. Keep the well-known settlement assets recognizable in those cards
// while still allowing chain-specific token-list URIs to take precedence.
const KNOWN_TOKEN_LOGOS: Record<string, string> = {
  ETH: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628",
  WETH: "https://assets.coingecko.com/coins/images/2518/standard/weth.png?1696503332",
  USDC: "https://ethereum-optimism.github.io/data/USDC/logo.png",
};

/**
 * The badge geometry, as PROPORTIONS of the token circle rather than pixels.
 *
 * Half the coin's width, radius 30% of its own, sitting OUTSIDE the coin's lower-right:
 * offset -18% on both axes, so the badge's top-left corner is the only part touching the
 * disc and the rest hangs past it. That corner is what the design turns on. The DOM
 * reference this started from used -2px/-3px on a 48px box (~4%/6%), which tucks the chip
 * inside the coin's silhouette and reads as a sticker ON the token; the supplied artwork
 * has it clearly beside and below, reading as a chip attached to it. The artwork wins.
 *
 * The container is square while the token is a disc, so the corner region is empty by
 * construction — that is the space this occupies, which is why it can hang out this far
 * without covering artwork.
 *
 * They stay proportions because this component is sized by its CALLER — `size` is only
 * a default, and call sites override it with `!h-4 !w-4`, `h-7 w-7`, `h-9 w-9`,
 * `h-16 w-16` and more. A badge in fixed px is correct at exactly one of those and
 * wrong everywhere else; a percentage tracks whatever the container actually renders,
 * including overrides this file never sees.
 */
const BADGE_FILL = 'h-[50%] w-[50%] rounded-[30%] -bottom-[18%] -right-[18%]';

/** Initials only. Explicit because a percentage-sized badge inherits the row's
 *  font-size otherwise, and two letters at 16px inside a 9px chip overflow it. */
const BADGE_FILL_TEXT: Record<TokenSize, string> = {
  sm: 'text-[4px]',
  md: 'text-[6px]',
  lg: 'text-[7px]',
};

const CONTAINER_SIZE: Record<TokenSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

export function TokenImageIcon({
  symbol,
  color,
  logoURI,
  size = 'sm',
  className,
  chainName,
  badge = true,
}: TokenImageIconProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // `symbol` is typed required, but it reaches this atom from indexer rows and
  // token lists where a market can legitimately be missing one. The lookup runs
  // on every render, so an undefined symbol here takes down the whole page --
  // fall through to the logo mark instead.
  //
  // `tokenLogoURI` rather than a bare trim, so the predecessor token list's
  // `placeholder_token.png` counts as NO logo. It is a live URL serving a grey
  // disc, so without this it loads successfully and wins over both the
  // well-known logo below and the `LogoMarkV2` fallback — which is exactly how
  // every launched coin came to wear someone else's placeholder. See
  // lib/tokens/logo.ts.
  const listLogoURI = tokenLogoURI(logoURI) || (symbol ? KNOWN_TOKEN_LOGOS[symbol.trim().toUpperCase()] : undefined);

  // The GAS TOKEN's mark, when this token is the chain's own gas token and an
  // operator uploaded one. A different image from the chain's mark on the badge
  // below — see `nativeIconFrom`, and `chainMeta.nativeCurrencyLogoURI`'s own
  // docstring for why conflating the two claims the rollup issued the ether.
  //
  // Only when the caller NAMED the chain. Without `chainName` this component
  // genuinely does not know which network the token is on, and the portfolio is
  // cross-chain — guessing from the displayed chain would put one chain's gas
  // mark on another chain's token. No name, no substitution.
  const { data: brands } = useChainBrand();
  const resolvedLogoURI = nativeIconFrom(brands, chainName, symbol, listLogoURI);

  // Keyed on the URL that FAILED rather than a boolean plus a reset effect. The
  // effect version ran on mount as well as on change, and the mount order is
  // ref -> effect: the ref detected an already-failed cached image, then the
  // effect immediately cleared the flag it had just set. The one case the ref
  // exists for was the one case it could not survive, and a dead URL rendered
  // the browser's broken-glyph instead of the fallback. Keying by URL makes a
  // change un-fail by construction, so there is no ordering left to get wrong.
  const showImage = Boolean(resolvedLogoURI) && failedUrl !== resolvedLogoURI;

  return (
    <div
      className={cn('relative overflow-visible rounded-full', CONTAINER_SIZE[size], className)}
      title={showImage ? undefined : `${symbol} token image unavailable`}
    >
      {/* A faint disc under the artwork. The reference carries one, and it is what stops
          a slow or transparent logo reading as a hole in the row. `rounded-[inherit]`
          throughout, because callers square this component off with `rounded-none`. */}
      <span aria-hidden className="absolute inset-0 rounded-[inherit] bg-[color:var(--m-surface-2)]" />
      <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {showImage ? (
          <img
            src={resolvedLogoURI}
            alt={symbol}
            onError={() => setFailedUrl(resolvedLogoURI ?? null)}
            // `onError` alone is not enough. When the URL has already failed
            // once, the browser serves the failure FROM CACHE, so the element
            // is `complete` before React attaches the handler and the event
            // never fires again -- the image stays a broken glyph for the rest
            // of the session. A cached failure is observable as `complete` with
            // a zero `naturalWidth`, which is what these two catch: the ref runs
            // at mount for an already-settled image, `onLoad` for one that
            // settles later.
            ref={(node) => {
              if (node?.complete && node.naturalWidth === 0) setFailedUrl(resolvedLogoURI ?? null);
            }}
            onLoad={(event) => {
              if (event.currentTarget.naturalWidth === 0) setFailedUrl(resolvedLogoURI ?? null);
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          /**
           * A coin with no artwork wears its own initials, not ours.
           *
           * This drew `LogoMarkV2` — the Iter logomark — which put the venue's brand on
           * every unbranded third-party coin: SK Hynix, Google, Nvidia and Dogecoin all
           * rendering as Iter. That is the same error as the standardweb3
           * `placeholder_token.png` this replaced, with our logo instead of theirs, and
           * it reads as a claim about the coin rather than as "no artwork yet".
           *
           * The tint is `tokenColor(symbol)` — the same deterministic per-symbol hash the
           * swap card colours its rows with, so one coin is one colour everywhere. It is
           * NOT the `color` prop: several call sites pass a literal (`#fff`,
           * `var(--m-logo)`), which would be illegible behind white text, and the prop is
           * read nowhere else in this component.
           */
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center font-dm-mono font-bold leading-none text-[color:var(--m-text-on-media)]"
            style={{
              backgroundColor: tokenColor(symbol),
              // Two characters, matching `ChainBadge` directly below — the same rule for
              // the same job, so a row's token mark and its network mark agree.
              fontSize: size === 'sm' ? 8 : size === 'md' ? 12 : 15,
            }}
          >
            {symbol.trim().slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      {badge && chainName && (
        <ChainBadge chainName={chainName} size={size} fill />
      )}
    </div>
  );
}

/**
 * Small network marker shared by token icons and two-token pair compositions.
 *
 * A ROUNDED SQUARE, not a circle. That is the whole point of the shape: the token is a
 * disc, so a second disc on its edge reads as a smaller coin, while a squircle reads as
 * a chip belonging to the thing it sits on. Radius is 30% of the badge's own width, and
 * the ring is the surface colour so the badge separates from the artwork underneath
 * rather than blending into it.
 *
 * `fill` is what `TokenImageIcon` passes: size and offset become percentages of the
 * token circle, so the badge scales with whatever the caller sized that circle to, and
 * overhangs its lower-right edge. Without `fill` the badge is a fixed size — that is the
 * standalone case (PairsTable, PoolsTable, TransactionsTable, PairProfile), where the
 * parent is not a token circle and a percentage would resolve against something
 * unrelated.
 *
 * ## The badge RESOLVES its own artwork, and `logoURI` is only a fallback
 *
 * Every caller used to pass `getChainIconUrl(name)` — the BUILD-TIME `evmNetworks`
 * list — and all fifteen of them did. So an operator could upload a chain mark in the
 * panel, see it saved, and watch every token row, pair row, pool row and transaction
 * row keep rendering the shipped icon. The switcher was taught to read the operator's
 * upload on 2026-09-03; these were not, and this badge is where a chain mark actually
 * appears in the product.
 *
 * Fixing it at the fifteen call sites would mean fifteen components each remembering
 * to ask, and the sixteenth forgetting. The badge is the thing that knows what a chain
 * looks like, so it does the asking. One shared fetch, so N rows cost one request.
 *
 * The build-time fallback is gone entirely as of the same day: `getChainIconUrl` and
 * the `evmNetworks` list behind it are deleted, because the only two icons in that
 * list were dead URLs and a fallback nothing can fill is not a fallback. A chain with
 * no uploaded mark renders the initials below.
 */
export function ChainBadge({
  chainName,
  size = 'sm',
  fill = false,
}: {
  chainName: string;
  size?: TokenSize;
  fill?: boolean;
}) {
  // This badge already had a no-image fallback -- the initials below -- but it
  // only covered a MISSING url, never a DEAD one, so a 404 rendered a broken
  // glyph on every row that carries a chain badge. Same cached-failure handling
  // as TokenImageIcon above; see the comment there for why `onError` is not
  // sufficient on its own.
  // Same URL-keyed shape as TokenImageIcon above, for the same reason: the reset
  // effect this replaces undid the ref's cached-failure detection on mount.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // The operator's upload is the ONLY source. There was a `logoURI` prop taking
  // a build-time icon as a fallback; every caller filled it from
  // `getChainIconUrl`, which resolved into a list whose two entries were dead
  // pbs.twimg.com links. Both are deleted — see the note above.
  const { data: brands } = useChainBrand();
  const resolved = chainIconFrom(brands, chainName);
  const initials = chainName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Keyed on the URL that failed, so a swap from the build-time icon to an
  // operator upload un-fails by construction — same rule as TokenImageIcon.
  const showImage = Boolean(resolved) && failedUrl !== resolved;
  // Border stays in px: border-width takes no percentage, and the reference's 1.5px at
  // 48px reads correctly across the range this renders at.
  const ring = size === 'sm' ? 'border' : 'border-[1.5px]';
  const fixed =
    size === 'lg' ? 'h-4 w-4 rounded-[30%] text-[6px]'
    : size === 'md' ? 'h-3.5 w-3.5 rounded-[30%] text-[5px]'
    : 'h-3 w-3 rounded-[30%] text-[4px]';

  return (
    <span
      title={chainName}
      className={cn(
        'absolute z-10 flex items-center justify-center overflow-hidden font-dm-mono font-bold leading-none text-white shadow-sm',
        ring,
        'border-[color:var(--m-surface)]',
        // With artwork the badge is just a frame — a tinted fill would sit under a
        // logo that already carries its own colour. Without it, the fill IS the badge.
        showImage ? 'bg-[color:var(--m-surface)]' : 'bg-[var(--m-primary)]',
        fill ? cn(BADGE_FILL, BADGE_FILL_TEXT[size]) : cn('bottom-0 right-0', fixed),
      )}
    >
      {showImage ? (
        <img
          src={resolved}
          alt=""
          onError={() => setFailedUrl(resolved ?? null)}
          ref={(node) => {
            if (node?.complete && node.naturalWidth === 0) setFailedUrl(resolved ?? null);
          }}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth === 0) setFailedUrl(resolved ?? null);
          }}
          // `contain`, not `cover`: a network mark is a logo with its own padding and is
          // often not square, so cropping it to fill the chip clips the glyph.
          className="h-full w-full object-contain"
        />
      ) : (
        initials
      )}
    </span>
  );
}
