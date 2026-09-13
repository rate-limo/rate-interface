import { defaultConnectedChain, networkNameToSlug, slugToNetworkName, supportedChains } from "@/consts";
import { isLocale, routing } from "@/i18n/routing";

export const DEFAULT_CHAIN_SLUG = networkNameToSlug[defaultConnectedChain];

export type PageKind =
  | "explore"
  | "home"
  | "swap"
  | "trade"
  | "portfolio"
  | "pool"
  | "pair"
  | "launch"
  | "create"
  | "welcome"
  | "iter"
  | "pass"
  | "rewards"
  | "token"
  // A wallet's public profile, /profile/[address].
  | "profile"
  // Money in and money out. Pages rather than dialogs since 2026-09-08 — see
  // components/Transfer for why.
  | "deposit"
  | "withdraw";

export type ExploreSection = "tokens" | "launches" | "pools" | "auctions" | "transactions";

/**
 * A section of Explore. Chain-less, like Explore itself.
 *
 * These routes render the SAME cross-chain page — `ExploreDirectoryPage` mounts
 * `HomeDesktopPage` with a tab preselected — so a chain in the URL was already
 * only pinning the display chain, and once `readDisplaySlug("explore")` stopped
 * reading it (SCHEME.explore) it would have become a parameter the page ignores
 * outright. That is the exact failure `SCHEME.home` warns about: a control that
 * appears to work and changes nothing.
 */
export function buildExploreSectionUrl(section: ExploreSection): string {
  return `/explore/${section}`;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface BuildOpts {
  slug?: string;
  base?: string;
  quote?: string;
  token?: string;
  /** Profile only: the wallet whose page to link to. */
  address?: string;
  /**
   * Trade only: target the Pro gear (`/trade/pro`, the order-book terminal)
   * instead of Basic (`/trade`, the convert card). Only Pro is pair-bound, so
   * base/quote are dropped when this is false — Basic ignores them.
   */
  pro?: boolean;
  /**
   * Pool only: target the provide/launch flow (`/pool/new`) instead of the
   * overview (`/pool`). Same split as trade's Basic/Pro — the bare route reads,
   * the deeper one acts — and only the flow takes a pair.
   */
  provide?: boolean;
  /** Pool only: add funds to an existing pair via `/pool/deposit`. */
  deposit?: boolean;
}

// How each page carries the chain in the query string. The old "from-to" scheme
// (?fromchain=&tochain=) went away with the Swap→Trade merge: swap was its only
// user, and ?tochain= was already inert.
type ChainScheme = "single" | "none";

const SCHEME: Record<PageKind, ChainScheme> = {
  /**
   * "none" since 2026-09-04, because Explore is a CROSS-CHAIN surface and had
   * been carrying a single chain in its URL that contradicted its own contents.
   *
   * Its lists already fan out to every served chain — `useMultichainTokens` and
   * `useMultichainPairs`, with `chainFilter` null by default — so the tape, the
   * shelves and the market table have been showing the union for some time.
   * What `?chain=` still did was pin the DISPLAY chain, so the sidebar's Explore
   * link read `/explore?chain=arc-testnet` and the page presented one network's
   * name over aggregated rows.
   *
   * Same scheme as `portfolio` and for the same reason: a page whose answer
   * spans every chain cannot name one in its address without lying about what
   * it shows. `readDisplaySlug` still resolves DEFAULT_CHAIN_SLUG, so every
   * server-side read on this route is unchanged; only the URL stops making a
   * claim the page does not honour.
   */
  explore: "none",
  // The SOCIAL surface, not the landing page (`[locale]/page.tsx` is that).
  // "none" because `home/page.tsx` hardcodes DEFAULT_CHAIN_SLUG and never reads
  // searchParams: giving it a chain param the page ignores would let the chain
  // switcher appear to work while changing nothing. Move this to "single" in
  // the same commit that makes the feed read the param, not before.
  home: "none",
  // Redirect-only since Swap merged into Trade (2026-07-29): /swap forwards to
  // /trade. The kind stays so existing callers keep compiling, and it now uses
  // trade's single-chain scheme rather than the old from-to pair.
  swap: "single",
  trade: "single",
  portfolio: "none",
  /*
   * "none", the same as `portfolio`, and for the same reason: these pages are
   * scoped to a WALLET, which is one address across every chain. The network is
   * a field ON the page — a deposit picks its chain the way it picks its asset,
   * and the two are chosen together because an asset carries its chain.
   *
   * A deep link still names one: `?asset=` and `?chain=` are read as ordinary
   * search params, so a gas-shortfall CTA can open the page already pointed at
   * the chain the transaction failed on.
   */
  deposit: "none",
  withdraw: "none",
  pool: "single",
  // The pair PROFILE — a reading surface, always bound to one market on one chain.
  // Distinct from /trade/pro, which is where you act on that market.
  pair: "single",
  // Launch DISCOVERY — the grid of what other people launched. Chain-scoped
  // because a launch belongs to the chain it deployed on.
  launch: "single",
  // Token creation, and the auction pages under it. Chain-scoped like pool: a
  // launch deploys to one chain. Split from `launch` so one word stops meaning
  // both "make one" and "see the ones that exist".
  create: "single",
  // First-run onboarding. Chain-scoped so the app opens on the chain the user
  // signed in against, rather than snapping to the default on their first click.
  welcome: "single",
  iter: "single",
  pass: "single",
  rewards: "single",
  token: "single",
  /**
   * A wallet's public profile. "single" because the page READS the param — the
   * order `home` above insists on.
   *
   * Mixed by nature, which is why it takes a chain at all: identity, follows,
   * posts and the balance series come from the shared identity database and are
   * the same from any gateway, while positions and PnL fan out across every
   * chain. But Coins created, Activity, Rewards and Volume are read from ONE
   * gateway, so the chain decides what those four show.
   */
  profile: "single",
};

const ALL_KINDS = Object.keys(SCHEME) as PageKind[];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Split a leading locale segment off a pathname.
 *
 * Every helper below reads the FIRST path segment, so a prefixed locale makes
 * them all wrong at once: `/ko/trade` reports its kind as "ko", which is not a
 * PageKind, so `pageKindFromPathname` returns null — the sidebar and tab bar
 * stop highlighting, and `setSourceChainOnUrl` treats the page as chain-less and
 * silently stops switching chains. 97 call sites depend on this family, and none
 * of them would throw; they would just quietly do nothing.
 *
 * The default locale carries no prefix (`localePrefix: "as-needed"`), so for
 * English this returns the path untouched.
 */
export function stripLocale(pathname: string): { locale: string | null; rest: string } {
  const segs = pathname.split("/").filter(Boolean);
  const first = segs[0];
  if (first && isLocale(first)) {
    return { locale: first, rest: `/${segs.slice(1).join("/")}` };
  }
  return { locale: null, rest: pathname };
}

/**
 * Re-attach a locale prefix, if there was one.
 *
 * The default locale never gets one — emitting `/en/trade` would create a
 * second address for every page and split share links and caches between them.
 * So a hand-typed `/en/trade` canonicalizes back to `/trade`, which is also what
 * next-intl's `as-needed` prefix does on the way in.
 *
 * Exported for tests: with `en` as the only configured locale the prefixing
 * branch is unreachable through the public helpers, and it is exactly the branch
 * that has to work on the day a second locale is added.
 */
export function withLocale(locale: string | null, path: string): string {
  if (!locale || locale === routing.defaultLocale) return path;
  return `/${locale}${path === "/" ? "" : path}`;
}

export function pageKindFromPathname(pathname: string): PageKind | null {
  const seg = stripLocale(pathname).rest.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return ALL_KINDS.find((k) => k === seg) ?? null;
}

/**
 * Which Trade gear a pathname is on, or null if it isn't Trade at all.
 *
 * `/trade` is Basic (the convert card) and `/trade/pro` is the order-book
 * terminal. Note pageKindFromPathname() returns "trade" for both, which is what
 * keeps the sidebar and tab bar highlighting Trade in either gear.
 */
export function tradeGearFromPathname(
  pathname: string,
): "basic" | "pro" | null {
  const segs = stripLocale(pathname).rest.split("/").filter(Boolean);
  if (segs[0] !== "trade") return null;
  return segs[1] === "pro" ? "pro" : "basic";
}

export function readDisplaySlug(kind: PageKind, sp: SearchParamsRecord): string {
  if (SCHEME[kind] === "single") return first(sp.chain) ?? DEFAULT_CHAIN_SLUG;
  return DEFAULT_CHAIN_SLUG;
}

/**
 * A slug from `readDisplaySlug`, resolved to a network name that is SAFE TO
 * FETCH AGAINST — `PonderLinks` (and every gateway helper keyed off a network
 * name) only has an entry for a chain in `supportedChains`. Falls back to
 * `defaultConnectedChain` when the slug names a chain that isn't currently
 * supported, or isn't a chain at all.
 *
 * ## Why `readDisplaySlug` itself does not do this
 *
 * `readDisplaySlug` is a pure URL reader by design and its own test pins that:
 * `readDisplaySlug("swap", { chain: "base-sepolia" })` returns `"base-sepolia"`
 * verbatim, a slug this app has never heard of. Making it validate would break
 * that contract and remove the one place a slug that isn't registered ANYWHERE
 * yet — a chain being brought up locally — can still be typed into a URL and
 * read back unchanged. Validation belongs at the point a slug is about to
 * become a live network name, which is here.
 *
 * ## Why this was missing, and what it did
 *
 * `slugToNetworkName` and `chainIds` still carry entries for chains removed
 * from `supportedChains` (Monad, Somnia, MegaETH — see PonderLinks's own
 * comment on why). Every one of the 14 page files under `app/[locale]` used to
 * do `slugToNetworkName[network] ?? someFallback` directly, which only guards
 * an UNKNOWN slug — `slugToNetworkName["monad-testnet"]` resolves fine, to
 * `"Monad Testnet"`, a name with no `PonderLinks` entry. `/trade?chain=monad-
 * testnet` reached `getTokens("Monad Testnet", ...)`, which built
 * `${undefined}/api/tokens/1000/1`, threw `ERR_INVALID_URL`, and the page
 * 500'd. `contexts/MarketPageProvider.tsx` already had the correct guard for
 * its own client-side resolution (`chainName`); this is that same check,
 * available to every server component that resolves a slug the same way.
 */
export function supportedNetworkName(slug: string): string {
  const name = slugToNetworkName[slug];
  return name && supportedChains.includes(name) ? name : defaultConnectedChain;
}

export function buildPageUrl(kind: PageKind, opts: BuildOpts = {}): string {
  const slug = opts.slug ?? DEFAULT_CHAIN_SLUG;
  if (kind === "portfolio") return "/portfolio";
  /*
   * Wallet-scoped, so chain-less for the same reason as portfolio. A caller
   * that knows the network appends `?chainId=` itself; the page reads it as an
   * ordinary search param.
   *
   * Note this list and SCHEME above are two statements of the same fact, and
   * only this one is load-bearing for output — declaring "none" in SCHEME
   * without a return here still emits `?chain=`, which is how these two shipped
   * disagreeing for one commit.
   */
  if (kind === "deposit") return "/deposit";
  if (kind === "withdraw") return "/withdraw";
  // Chain-less for the same reason as portfolio — see SCHEME.home.
  if (kind === "home") return "/home";
  // Cross-chain, so it names no chain — see SCHEME.explore. The `/explore/...`
  // section routes are chain-less for the same reason; see
  // `buildExploreSectionUrl`.
  if (kind === "explore") return "/explore";
  // One token page, keyed by address OR symbol. It replaced /price (symbol-only,
  // the SEO price page) and /coin (the launch profile) on 2026-08-31: the same
  // table used to branch between them on whether a token had a `creator`, so
  // one row went to a page you could trade from and its neighbour did not.
  //
  // ALWAYS token-bound since 2026-09-03. The bare `/token` index was deleted —
  // it duplicated `/explore/tokens`, and on a chain whose pairs are all
  // unverified it rendered a directory of tokens none of which it would let you
  // trade. A caller with no token wants the directory, so that is where it goes,
  // the same shape `profile` already uses for a wallet-less link.
  if (kind === "token") {
    return opts.token
      ? `/token/${opts.token}?chain=${slug}`
      // The directory is Explore's tokens section, which is cross-chain.
      : `/explore/tokens`;
  }
  // Always address-bound: /profile with no wallet is not a page. Callers
  // without an address have nothing to link to.
  if (kind === "profile") {
    return opts.address ? `/profile/${opts.address}?chain=${slug}` : `/portfolio`;
  }
  // "swap" resolves to Trade's Basic gear — the convert card lives there now.
  if (kind === "trade" || kind === "swap") {
    const p = new URLSearchParams({ chain: slug });
    // Basic converts between tokens and can route across several books, so it
    // has no pair to bind; only Pro carries base/quote.
    if (opts.pro) {
      if (opts.base) p.set("base", opts.base);
      if (opts.quote) p.set("quote", opts.quote);
      return `/trade/pro?${p.toString()}`;
    }
    return `/trade?${p.toString()}`;
  }
  if (kind === "pair") {
    // Always pair-bound: a profile with no market is not a page, it is a 404. Callers
    // that lack base/quote should link to /explore instead.
    const p = new URLSearchParams({ chain: slug });
    if (opts.base) p.set("base", opts.base);
    if (opts.quote) p.set("quote", opts.quote);
    return `/pair?${p.toString()}`;
  }
  if (kind === "pool") {
    const p = new URLSearchParams({ chain: slug });
    if (opts.deposit) {
      if (opts.base) p.set("base", opts.base);
      if (opts.quote) p.set("quote", opts.quote);
      return `/pool/deposit?${p.toString()}`;
    }
    // Only the flow takes a pair; the overview is market-wide and ignores it.
    if (opts.provide) {
      if (opts.base) p.set("base", opts.base);
      if (opts.quote) p.set("quote", opts.quote);
      return `/pool/new?${p.toString()}`;
    }
    return `/pool?${p.toString()}`;
  }
  return `/${kind}?chain=${slug}`;
}

// For switchToConnectedNetwork: set the SOURCE chain param for the current page,
// preserving the path and any other params. Portfolio (no chain) is a no-op.
export function setSourceChainOnUrl(
  pathname: string,
  search: string,
  newSlug: string,
): string {
  // The locale is split off to read the kind, then put back — switching chains
  // must not drop the language the user is reading in.
  const { locale, rest } = stripLocale(pathname);
  const kind = pageKindFromPathname(pathname);
  if (!kind) return search ? `${pathname}${search}` : pathname;
  if (SCHEME[kind] === "none") return search ? `${pathname}${search}` : pathname;
  const params = new URLSearchParams(search);
  params.set("chain", newSlug);
  return `${withLocale(locale, rest)}?${params.toString()}`;
}

// For the prefetch effect: same page, each other chain in the source param.
export function siblingChainUrls(
  pathname: string,
  search: string,
  otherSlugs: string[],
): string[] {
  const kind = pageKindFromPathname(pathname);
  if (!kind || SCHEME[kind] === "none") return [];
  return otherSlugs.map((slug) => setSourceChainOnUrl(pathname, search, slug));
}
