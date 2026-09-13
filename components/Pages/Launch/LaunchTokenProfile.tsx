"use client";

import { useMemo, useRef, useState } from "react";
import { compactNumber } from "@/lib/format/compact";
import {
  ChartMetricCaveat,
  ChartMetricToggle,
  useChartMetric,
} from "@/components/Organisms/TradingView/ChartMetricToggle";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowUpRight, Check, Copy, Share2 } from "lucide-react";
import { formatMarketCap, formatSubscriptDecimal } from "@/utils/number";
import { BreadcrumbNav } from "@/components/Atoms/BreadCrumbNav";

import type { SpotPair, SpotToken } from "@/types";
import { StarButton } from "@/components/Organisms/StarButton";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { GraduationGauge } from "@/components/Launch/GraduationGauge";
import { TokenStatsPanel } from "@/components/Pages/Profile/TokenStatsPanel";
import { TokenActivityPanels } from "@/components/Pages/Profile/TokenActivityPanels";
import { TokenBubbleMap } from "@/components/Pages/Profile/TokenBubbleMap";
import { tokenProfileCoverage } from "@/lib/token/coverage";
import { useQuoteOptions } from "@/hooks/useQuoteOptions";
import { ActionDock, type DockTab } from "@/components/Explore/ActionDock";
import { ThesisChart } from "@/components/Chart/ThesisChart";
import { LiveStat } from "@/components/Atoms/LiveStat";
import { useLiveTokenStats } from "@/hooks/useLiveTokenStats";
import { ChartOverlays } from "@/components/Chart/ChartOverlays";
import { CalloutModal } from "@/components/Social/CalloutModal";
import { useThesisMarks, type MarkFilters } from "@/hooks/useThesisMarks";
import type { ThesisMark } from "@/lib/chart/marks";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import { explorerUrlForNetwork } from "@/lib/search/explorer";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { timeframeToInterval, type ChartTimeframeLabel } from "@/lib/profile/chartInterval";
import { cn } from "@/lib/utils";

// Same four windows this panel has always offered -- mapped to the
// ChartTimeframeLabel/resolution pair timeframeToInterval already defines for
// the token-profile chart (1W stands in for "7D", 1M for "30D": there is no
// dedicated resolution for either, and those are the closest candle sizes
// that still read as that window -- see chartInterval.ts's own docstring).
const PERIODS: readonly [string, ChartTimeframeLabel][] = [
  ["1H", "1h"],
  ["24H", "24h"],
  ["7D", "1W"],
  ["30D", "1M"],
];

// Deterministic rather than Intl `notation: "compact"`: Node's ICU and the
// browser disagree on trailing digits ("$100.0K" vs "$100K"), and this page is
// server-rendered, so the difference surfaced as a hydration error rather than
// as a formatting nit. See lib/format/compact.ts.
function compact(value: number): string {
  return compactNumber(Math.max(0, value || 0));
}

function shortAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Unknown creator";
}


/**
 * The token's USD price, in subscript-zero notation when it is small enough to
 * need it. Launch tokens live squarely in that range, which is why this page in
 * particular has one.
 *
 * Also fixes a null price rendering as `"$—"`: the `??` bound to the optional
 * chain, not to the template, so an unpriced token got a currency symbol in
 * front of its em-dash. A dash means "no figure", and prefixing it with `$`
 * dresses an absent value as a measured one.
 */
function fmtUsdPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const subscript = formatSubscriptDecimal(value);
  return `$${subscript ?? value.toLocaleString(undefined, { maximumFractionDigits: 8 })}`;
}

/**
 * The token page's body.
 *
 * ## The Strapi FAQ is gone; the creator's description is what remains
 *
 * This carried a second prose block — a four-question FAQ built from Strapi's
 * `what_is_it`, `how_it_works`, `hodl_report` and `price_prediction`, which came
 * across when /price folded into this route on 2026-08-31. It was removed with
 * the Strapi integration (2026-09-06), and by then it had already been dead:
 * `CMSLink` pointed at the predecessor project's CMS, which no longer resolves,
 * so the fetch failed on every render and the entry list was always empty.
 * Removing it changes what SHIPS, not what rendered.
 *
 * The page is not left without body copy. The "About {token.name}" block below
 * renders `token.description` — the creator's own `adminTokenMeta.description`,
 * merged into every token response by the gateway's `mergeTokenMeta` — server
 * side, so it is the indexable text a crawler gets. Everything else here renders
 * from client components into numbers, which a crawler sees as an empty
 * document, so that one paragraph is carrying the page.
 */
export function LaunchTokenProfile({
  token,
  pairs,
  thresholdUsd,
  networkName,
  networkSlug,
}: {
  token: SpotToken;
  pairs: SpotPair[];
  thresholdUsd: number;
  networkName: string;
  networkSlug: string;
}) {
  // The chain chip renders the network AS a token, so `ChainBadge` — which
  // resolves the operator's upload itself — never runs here, and this has to ask
  // for it. Same shape as the network rows in Swap/TokenPicker. There is no
  // build-time fallback any more: `getChainIconUrl` is deleted, so a chain with
  // no upload falls through to initials.
  const { data: chainBrands } = useChainBrand();

  // Undefined for a chain the registry has no explorer for, which hides the link
  // rather than pointing at a host that does not exist. Same `/address/` shape
  // `searchNav.ts` builds for a wallet.
  const explorerBase = explorerUrlForNetwork(networkName);
  const tokenExplorerHref = explorerBase
    ? `${explorerBase.replace(/\/$/, "")}/address/${token.id}`
    : undefined;
  const [period, setPeriod] = useState<ChartTimeframeLabel>("24h");

  /**
   * What the chart draws on top of the candles, and the callout a click opened.
   *
   * Held HERE rather than inside the chart because the controls sit under it and
   * the modal sits outside it — a chart that owned this state would have to
   * render both, and the modal would be unmounted every time the chart
   * remounted on a timeframe change.
   */
  const [markFilters, setMarkFilters] = useState<MarkFilters>({ friendsOnly: false, minUsd: 0 });
  const [showMarks, setShowMarks] = useState(true);
  const [openCallout, setOpenCallout] = useState<ThesisMark | null>(null);

  const chart = useChartMetric(token);

  /**
   * The header's four figures, re-asked on a timer.
   *
   * 15 seconds, and the number is the cache's rather than a preference: the
   * gateway classes `/token/` as `hourly` — `max-age=10, s-maxage=30,
   * stale-while-revalidate=120` — so polling faster than ten seconds is served
   * from the browser's own cache and buys nothing but requests. Behind a shared
   * cache the effective floor is thirty. Nothing INVALIDATES on a trade
   * anywhere in that chain; the row simply becomes re-readable when its TTL
   * lapses, which is what makes this a poll and not a subscription.
   */
  const { stats } = useLiveTokenStats({ networkName, address: token.id, initial: token });

  const { address: viewer } = useAccount();
  // One query, whose count the overlay label reads and whose rows the chart
  // draws. Fetching in the chart as well would give the page two answers to
  // "how many callouts are on this chart".
  //
  // The whole history rather than the visible range: panning would otherwise
  // refetch on every drag, and the route's own cap is what keeps a long history
  // from being an unbounded answer.
  const { marks } = useThesisMarks({
    networkName,
    symbol: chart.chartSymbol,
    from: 0,
    to: Math.floor(Date.now() / 1000) + 86_400,
    viewer,
    filters: markFilters,
    enabled: showMarks,
  });
  const [copied, setCopied] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("buy");

  // Deepest market first — but ALL of them are kept. A token can be quoted in
  // several tokens (USDC, ETH, whatever the generator's admin-approved quote
  // registry currently allows), and this used to take [0] and silently discard
  // the rest: the ticket, the tape and the trade link all spoke for one market
  // with nothing on screen admitting the others existed.
  const sortedPairs = useMemo(
    () =>
      [...pairs].sort((a, b) => {
        // Listed markets outrank unlisted ones REGARDLESS of depth, because
        // `[0]` below is the market this page opens on. `getBasePairs` returns
        // both halves now, and a pre-graduation market frequently has the larger
        // seeded TVL — sorting on depth alone would make an unlisted market the
        // default view of a token that has a listed one.
        const listed = (p: SpotPair) => (p.verified === true ? 1 : 0);
        if (listed(a) !== listed(b)) return listed(b) - listed(a);
        // Nullable on rows the indexer has not priced; NaN sorts unpredictably
        // and would shuffle the list between renders.
        return (Number(b.dayQuoteTvlUSD) || 0) - (Number(a.dayQuoteTvlUSD) || 0);
      }),
    [pairs],
  );
  /**
   * The chosen MARKET, by pair id — never by its quote token's id.
   *
   * A quote id cannot identify a market here. Two of a token's markets can be
   * quoted in tokens that share a symbol, and if they share an ADDRESS this
   * lookup returns the first every time: the picker highlighted the second row
   * and the card behind it never changed, which reads exactly as a control that
   * does not work.
   */
  const [pairId, setPairId] = useState<string | null>(null);
  const pair = useMemo(
    () => sortedPairs.find((p) => p.id === pairId) ?? sortedPairs[0],
    [sortedPairs, pairId],
  );
  // What this profile can honestly show. A token Iter did not launch has no
  // indexed transfer history, so its holder panels are omitted with a reason
  // rather than rendered empty — see lib/token/coverage.ts.
  const coverage = tokenProfileCoverage(token);
  // Which tokens a market may be quoted in, straight from AssetGenerator's
  // admin-configured registry. Only consulted when this token has NO market yet:
  // where a market exists, the pairs above are the answer, and offering a quote
  // with no pair behind it would name a market nobody can trade.
  const { options: quoteOptions } = useQuoteOptions(networkName);
  const listableIn = quoteOptions
    .filter((q) => q.enabled)
    // A token is never its own quote. Without this, /token/USDC — USDC being the
    // one quote RISE currently enables — offers to quote USDC in USDC.
    .filter((q) => q.address.toLowerCase() !== token.id.toLowerCase())
    .map((q) => q.symbol);
  /**
   * What graduation actually grades on: LIFETIME quote spent buying this token.
   *
   * This read `dayQuoteTvlUSD` — resting bid depth — which is the wrong quantity
   * twice over: a 24h window, and one that EMPTIES as those bids fill. A launch
   * that sold through its book drove its own progress bar back to zero, which is
   * why a traded coin showed "$0 / $100K locked".
   *
   * `null` is not 0. The column is written by a broker from 2026-09-06 and is
   * absent on older rows until the backfill runs, so "not measured yet" has to
   * render differently from "nobody has bought any" — see `graduationMeasured`.
   */
  const graduationUsd = pair?.buyQuoteVolumeUSD ?? null;
  const graduationMeasured = graduationUsd !== null;
  const profileUrl = typeof window !== "undefined" ? window.location.href : "";
  // Absolute, because navigator.share and the clipboard both need a url a
  // recipient can open; origin comes from the browser so it is right in every
  // environment rather than hardcoded per deploy.
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/token/${encodeURIComponent(token.symbol)}?chain=${networkSlug}`
      : "";
  const shareText = useMemo(() => {
    const price = Number(token.priceUSD);
    const cap = Number(token.marketCap);
    const bits = [
      Number.isFinite(price) && price > 0 ? `Price $${price < 0.01 ? price.toPrecision(2) : price.toFixed(4)}` : null,
      Number.isFinite(cap) && cap > 0 ? `Market cap ${formatMarketCap(cap)}` : null,
    ].filter(Boolean);
    return bits.length ? `${token.symbol} · ${bits.join(" · ")}` : `${token.symbol} on ${networkName}`;
  }, [token.priceUSD, token.marketCap, token.symbol, networkName]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(token.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is optional; the address remains visible for manual copy.
    }
  };

  // navigator.share allows exactly one open sheet per document: invoking it
  // again before the first settles throws InvalidStateError, which a double
  // click produces on its own — and on desktop Chrome the sheet can stay open
  // long enough to make that easy. The ref guards it rather than React state
  // because it is read and written within one click handler, before any render.
  const sharing = useRef(false);

  const share = async () => {
    if (!navigator.share) {
      await copyAddress();
      return;
    }
    if (sharing.current) return;
    sharing.current = true;
    try {
      // Share the CANONICAL url, not window.location.href: the address bar
      // carries whatever transient params the user arrived with (?ref=, utm),
      // and those travel into every reshare and into the unfurled card's link.
      // `text` is what clients show beside the preview, so it repeats the two
      // numbers the card leads with rather than restating the title.
      await navigator.share({
        title: `${token.name} (${token.symbol}) on Iter`,
        text: shareText,
        url: shareUrl,
      });
    } catch (error) {
      // Dismissing the sheet rejects with AbortError. That is the user saying
      // no, not a failure, and it must not reach the console as unhandled.
      if ((error as Error)?.name !== "AbortError") await copyAddress();
    } finally {
      sharing.current = false;
    }
  };

  return (
    <main className="min-h-full bg-[var(--m-background)] text-[var(--m-text-primary)]">
      <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Carried from /price when it folded into this route: a crawler reading
            this page otherwise finds no navigational context at all, because
            everything above is an icon row. */}
        <BreadcrumbNav token={token} networkName={networkName} />
        <div className="mb-5 flex items-center justify-between gap-3 text-[11px] font-dm-mono text-[var(--m-text-secondary-2)]">
          <Link href={buildPageUrl("explore")} className="transition-colors hover:text-[var(--m-text-primary)]">← Explore</Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--m-border)] px-2.5 py-1">
            <TokenImageIcon symbol={networkName} color="#666" logoURI={chainIconFrom(chainBrands, networkName)} size="sm" />
            {networkName}
          </span>
        </div>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="rounded-[20px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-0 items-center gap-4">
                  <TokenImageIcon symbol={token.symbol} logoURI={token.logoURI} color="var(--m-logo)" size="lg" chainName={networkName} className="h-16 w-16 rounded-[18px]" />
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-[clamp(25px,4vw,38px)] font-semibold tracking-[-0.04em]">{token.name}</h1>
                      <span className="font-dm-mono text-sm text-[var(--m-text-secondary)]">${token.symbol}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--m-text-secondary-2)]">
                      {/* Only a coin launched here HAS a creator. For anything else this
                          rendered "Created by Unknown creator", which invents a fact about
                          a token whose deployer we simply never saw. */}
                      {coverage.launchedOnIter && (
                        <>
                          <span>Created by</span>
                          <span className="font-dm-mono text-[var(--m-text-secondary)]">{shortAddress(token.creator)}</span>
                        </>
                      )}
                      {/* "launching" is a claim about a launch on Iter. Applied to a token
                          that arrived any other way it contradicts the holder notice further
                          down the same page, so an off-venue token reads as unlisted instead. */}
                      {token.verified ? (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--m-success)_16%,transparent)] px-2 py-0.5 font-dm-mono text-[9px] uppercase text-[var(--m-success)]">listed</span>
                      ) : coverage.launchedOnIter ? (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--m-warning)_16%,transparent)] px-2 py-0.5 font-dm-mono text-[9px] uppercase text-[var(--m-warning)]">launching</span>
                      ) : (
                        <span className="rounded-full bg-[var(--m-surface-2)] px-2 py-0.5 font-dm-mono text-[9px] uppercase text-[var(--m-text-secondary-2)]">unlisted</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {/*
                    The watchlist control, which this page did not have.

                    `StarButton` was only ever mounted on ROWS — Explore's token
                    table, the balances table, the pair rail — so a token could
                    be starred from a list and not from its own page, which is
                    where someone decides they care about it. The page is also
                    the one surface reachable from a shared link, where the row
                    that could have starred it is nowhere in sight.

                    Keyed on the token ADDRESS, never the symbol: anyone can mint
                    a coin called USDC here, and a symbol-keyed list would let a
                    counterfeit take the real token's place in it. That is the
                    button's own documented rule, and it is why `id` is the id.
                  */}
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--m-border)] text-[var(--m-text-secondary)] hover:bg-[var(--m-surface-2)]">
                    <StarButton id={token.id} symbol={token.symbol} option="token" size={15} />
                  </span>
                  <button type="button" onClick={() => void copyAddress()} aria-label="Copy token address" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--m-border)] text-[var(--m-text-secondary)] hover:bg-[var(--m-surface-2)]"><Copy size={15} /></button>
                  <button type="button" onClick={() => void share()} aria-label="Share token profile" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--m-border)] text-[var(--m-text-secondary)] hover:bg-[var(--m-surface-2)]"><Share2 size={15} /></button>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <LiveStat
                  label="Price"
                  value={fmtUsdPrice(stats.priceUSD)}
                  compare={stats.priceUSD}
                />
                {/* No `compare`: a market cap that rose is not good news the way
                    a price that rose is — it is the same fact stated twice, and
                    colouring it would read as a second signal. */}
                <LiveStat
                  label="Market cap"
                  value={stats.marketCap ? `$${compact(stats.marketCap)}` : "—"}
                />
                <LiveStat
                  label="24h"
                  value={`${stats.dayChangePct >= 0 ? "+" : ""}${stats.dayChangePct.toFixed(2)}%`}
                  compare={stats.dayChangePct}
                  tone={stats.dayChangePct >= 0 ? "positive" : "negative"}
                />
                {/* Volume only ever rises within a window, so a direction here
                    would be green on every single tick. */}
                <LiveStat label="24h volume" value={`$${compact(stats.dayVolumeUSD)}`} />
              </div>
              {copied && <p className="mt-3 text-right font-dm-mono text-[10px] text-[var(--m-success)]">Address copied</p>}
            </div>

            <div className="mt-5 rounded-[20px] border border-[var(--m-border)] bg-[var(--m-surface)] p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold">{chart.active ? "Market cap" : "Price"}</h2>
                  <p className="mt-1 text-[11px] text-[var(--m-text-secondary-2)]">
                    {chart.active ? `Price × total supply for ${token.symbol}` : `Live USD price for ${token.symbol}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Same control the token profile carries — see ChartMetricToggle.
                      A launched coin's supply is fixed, so here it is exact and the
                      caveat below never renders; it exists for the tokens this page
                      can also show that were not minted by CoinGenerator. */}
                  <ChartMetricToggle
                    metric={chart.metric}
                    setMetric={chart.setMetric}
                    hasKnownSupply={chart.hasKnownSupply}
                    hasFixedSupply={chart.hasFixedSupply}
                    symbol={token.symbol}
                  />
                  <div className="flex rounded-full bg-[var(--m-surface-2)] p-1">
                    {PERIODS.map(([label, key]) => <button key={key} type="button" onClick={() => setPeriod(key)} className={cn("rounded-full px-3 py-1.5 font-dm-mono text-[10px]", period === key ? "bg-[var(--m-primary)] text-[var(--m-on-primary)]" : "text-[var(--m-text-secondary)]")}>{label}</button>)}
                  </div>
                </div>
              </div>
              {chart.active && !chart.hasFixedSupply && (
                <ChartMetricCaveat symbol={token.symbol} className="mb-3" />
              )}
              <div className="h-[440px] overflow-hidden rounded-[14px]">
                <ThesisChart
                  networkName={networkName}
                  symbol={chart.chartSymbol}
                  resolution={timeframeToInterval(period)}
                  marks={marks}
                  // Only meaningful for the `:MCAP` ticker, which has no bar
                  // room of its own — see the chart's own note.
                  marketCapSupply={token.totalSupply}
                  onOpenCallout={setOpenCallout}
                />
              </div>

              <ChartOverlays
                className="mt-3"
                filters={markFilters}
                onChange={setMarkFilters}
                showMarks={showMarks}
                onShowMarksChange={setShowMarks}
                hasViewer={Boolean(viewer)}
                count={marks.length}
              />

              {/* Outside the chart, so a timeframe change cannot unmount an open
                  modal — see the state's own note above. */}
              <CalloutModal
                mark={openCallout}
                networkName={networkName}
                tokenAddress={token.id}
                tokenSymbol={token.symbol}
                open={openCallout !== null}
                onOpenChange={(next) => {
                  if (!next) setOpenCallout(null);
                }}
              />

              {/* The callout composer used to sit here, under the chart. It has moved into
                  the trade flow's Result step: a call is a claim about a trade you just
                  made, so the moment to write one is while that trade is on screen —
                  not on a page you have to come back to and re-find the fill in a
                  dropdown. Removing it from here is what stops the same control
                  existing in two places with two different eligibility messages. */}
            </div>

            {/* Directly under the chart, which is where the reference design puts
                them and where they belong: the chart says what the price did, these
                say who did it. Left is positions, right is the live tape. */}
            <TokenActivityPanels
              className="mt-5"
              networkName={networkName}
              address={token.id}
              pair={pair ?? null}
              symbol={token.symbol}
              showTraders={coverage.traderBoard}
            />

            {/* Under the tables: the same holders, but as a graph. The tables rank;
                this shows the relationships a ranking cannot — wallets funded from one
                source sit in a visible cluster.

                Omitted entirely for a token Iter did not launch. The panel above
                already explains why, and a second card saying the same thing would
                turn one honest limitation into a wall of apology. */}
            {coverage.holderGraph && (
              <TokenBubbleMap
                className="mt-5"
                networkName={networkName}
                address={token.id}
                symbol={token.symbol}
                // `creator` is what marks a coin as one of ours — the same test
                // TokensTable uses to route launched tokens.
                launchedHere={Boolean(token.creator)}
              />
            )}

            <div className="mt-5 rounded-[20px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-6">
              <h2 className="text-[16px] font-semibold">About {token.name}</h2>
              <p className="mt-3 max-w-[70ch] whitespace-pre-wrap text-[13px] leading-6 text-[var(--m-text-secondary)]">{token.description || "The creator has not added a description yet."}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2 font-dm-mono text-[10px] text-[var(--m-text-secondary-2)]"><span className="rounded-full border border-[var(--m-border)] px-2.5 py-1">{token.decimals} decimals</span><span className="rounded-full border border-[var(--m-border)] px-2.5 py-1">Supply {compact(token.totalSupply)}</span><span className="rounded-full border border-[var(--m-border)] px-2.5 py-1">{networkName}</span></div>
            </div>
          </div>

          <aside className="space-y-5">
            {/* Act, then read. The dock is the Explore spec's one ticket for all
                three reading surfaces — Explore, pair profiles, token profiles —
                and this page was the last of the three not mounting it. The stats
                below it are what the ticket is judged on, so they sit together and
                above the launch/graduation detail that was already here. */}
            {/* Only shown when there is a choice to make. One market needs no
                picker, and a single inert chip is noise that implies otherwise. */}
            <ActionDock
              pair={pair ?? null}
              pairs={sortedPairs}
              onPairChange={setPairId}
              tab={dockTab}
              onTabChange={setDockTab}
            />

            {/* Unlisted, not hidden — and never unlabelled. This rail can now bind
                a pre-graduation market (the lookup behind it was listing-gated,
                so it used to show "Pick a market to continue" instead), and the
                one rule that travels with showing those anywhere is that they
                say so. Same wording as the pair profile's chip. */}
            {pair && pair.verified !== true && (
              <p className="-mt-3 px-1 text-[11px] leading-5 text-[color:var(--m-text-secondary-2)]">
                <span className="mr-1.5 rounded-full border border-[var(--m-border)] px-2 py-0.5 font-dm-mono text-[10px] uppercase tracking-wide">
                  Unlisted
                </span>
                This market has not reached the listing threshold, so it is absent
                from rankings. It trades normally.
              </p>
            )}

            {/* The dock's "Pick a market to continue" is a dead end on a token
                that HAS no market. The generator's quote registry is the honest
                next thing to say: these are the tokens it could be listed
                against. Registry state, not a promise that a market exists. */}
            {!pair && listableIn.length > 0 && (
              <div className="rounded-[16px] border border-[var(--m-border)] bg-[var(--m-surface)] p-4">
                <div className="text-[12px] font-semibold text-[var(--m-text-primary)]">
                  No market yet
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-[var(--m-text-secondary)]">
                  {token.symbol} has no pair to trade in. Markets on Iter can be quoted in{" "}
                  {listableIn.length === 1
                    ? listableIn[0]
                    : `${listableIn.slice(0, -1).join(", ")} or ${listableIn[listableIn.length - 1]}`}
                  , as currently allowed by the launch contract.
                </p>
              </div>
            )}

            <TokenStatsPanel networkName={networkName} address={token.id} />

            {/* A graduation gauge measures progress toward listing a coin launched
                here. On a token that arrived some other way it reported "$0 / $100K
                locked" — a made-up milestone for a launch that never happened. */}
            {coverage.launchedOnIter && (
            <div className="rounded-[20px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5">
              <h2 className="text-[16px] font-semibold">Launch progress</h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--m-text-secondary)]">
                Quote spent buying this token moves it toward its first listed market.
              </p>
              <div className="mt-5">
                <GraduationGauge boughtUsd={graduationUsd ?? 0} thresholdUsd={thresholdUsd} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
                {/* An em-dash while the figure has never been written, rather than
                    `$0`: a coin nobody has bought and a coin nobody has MEASURED
                    are different claims, and only one of them is the token's fault. */}
                <Metric label="Bought with quote" value={graduationMeasured ? `$${compact(graduationUsd)}` : "—"} />
                <Metric label="Graduation target" value={`$${compact(thresholdUsd)}`} />
              </div>
              {/* No Trade link here. The action dock sits directly above this card on the
                  same rail and is a live buy/sell ticket, so a second button that only
                  NAVIGATES to a trading surface competes with the one that trades. Only
                  the no-market case keeps a CTA: with no pair the dock can offer nothing
                  but "Pick a market", and seeding quote liquidity is the actual next step
                  — it is what moves the gauge this card is about. */}
              {!pair && (
                <Link
                  href={buildPageUrl("pool", { slug: networkSlug, provide: true, base: token.symbol, quote: "USDC" })}
                  className="mt-5 flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--m-primary)] px-4 text-[13px] font-semibold text-[var(--m-on-primary)] hover:bg-[var(--m-primary-hover)]"
                >
                  Provide liquidity
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
            )}

            <div className="rounded-[20px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5">
              <h2 className="text-[16px] font-semibold">Market details</h2>
              <Detail label="Token contract" value={shortAddress(token.id)} copy={token.id} explorerHref={tokenExplorerHref} />
              <Detail label="Pair" value={pair?.symbol ?? "No pair yet"} />
              <Detail label="Created" value={token.listingDate ? new Date(token.listingDate * 1000).toLocaleDateString() : "—"} />
              <Detail label="Network" value={networkName} />
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="rounded-[12px] bg-[var(--m-surface-2)] px-3 py-2.5"><div className="text-[10px] text-[var(--m-text-secondary-2)]">{label}</div><div className={cn("mt-1 font-dm-mono text-[13px] tabular-nums", tone === "positive" && "text-[var(--m-success)]", tone === "negative" && "text-[var(--m-error)]")}>{value}</div></div>;
}

/**
 * One label/value row, optionally copyable and optionally linked to the explorer.
 *
 * The copy button used to be `onClick={() => void navigator.clipboard.writeText(copy)}`
 * and nothing else. It worked, and it looked broken: nothing on screen changed,
 * so the only way to learn whether it had copied was to paste somewhere. The
 * `void` also discarded the promise, so a denied permission or a non-secure
 * context failed in complete silence — which is exactly when the user needs to
 * be told, because then they have to select the text by hand.
 */
function Detail({
  label,
  value,
  copy,
  explorerHref,
}: {
  label: string;
  value: string;
  copy?: string;
  /** The chain's explorer URL for this value, when the registry knows one. */
  explorerHref?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const onCopy = async () => {
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(copy);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--m-border)] py-3 text-[12px]">
      <span className="text-[var(--m-text-secondary)]">{label}</span>
      <span className="flex items-center gap-1.5 font-dm-mono text-[var(--m-text-primary)]">
        {state === "copied" ? (
          <span className="text-[var(--m-success)]">Copied</span>
        ) : state === "failed" ? (
          <span className="text-[var(--m-error)]">Copy blocked</span>
        ) : (
          value
        )}
        {copy && (
          <button
            type="button"
            onClick={() => void onCopy()}
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            className="grid h-6 w-6 place-items-center rounded-md text-[var(--m-text-secondary-2)] transition-colors hover:bg-[var(--m-surface-2)] hover:text-[var(--m-text-primary)]"
          >
            {state === "copied" ? <Check size={12} className="text-[var(--m-success)]" /> : <Copy size={12} />}
          </button>
        )}
        {/* Only when the registry knows an explorer for this chain. A dead link
            to a host that does not exist is worse than no link. */}
        {explorerHref && (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${label} on the block explorer`}
            title="View on the block explorer"
            className="grid h-6 w-6 place-items-center rounded-md text-[var(--m-text-secondary-2)] transition-colors hover:bg-[var(--m-surface-2)] hover:text-[var(--m-text-primary)]"
          >
            <ArrowUpRight size={13} />
          </a>
        )}
      </span>
    </div>
  );
}

