"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, Loader2, Search, TrendingUp, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import { tokenColor } from "@/lib/swap/tokens";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";
import { isUnlisted } from "@/lib/search/listing";
import { isAddressQuery, toChecksumAddress, truncateAddress } from "@/lib/search/address";
import { explorerUrlForNetwork } from "@/lib/search/explorer";
import { clearRecents, pushRecent, readRecents, writeRecents } from "@/lib/search/recents";
import {
    buildResultPath,
    buildResultTarget,
    clampHighlightIndex,
    filterByTab,
    flattenSearchResults,
    SEARCH_TABS,
    SEARCH_TAB_LABELS,
    tabCounts,
    walletTargetLabel,
    type SearchNavItem,
    type SearchTab,
    type SearchWalletResult,
    type WalletTargetContext,
} from "@/components/Organisms/SearchBar/searchNav";
import type { SearchPairResult, SearchTokenResult } from "@/queries/server/search";
import { pairToResult, tokenToResult } from "@/lib/search/trendingRow";

/**
 * The global search modal — tokens, pools and wallets behind one field.
 *
 * ## Why this replaced the two surfaces that were here
 *
 * `ExploreSearch` (the field in the top bar and the mobile drawer) filtered
 * `MarketPageProvider`'s already-loaded lists with `String.includes`. It could
 * only ever find what the current page had already fetched — roughly the first 20
 * tokens — so searching for anything outside that window returned nothing, which
 * is indistinguishable from "does not exist".
 *
 * Meanwhile `Organisms/SearchBar` had the real thing — `/api/search` through
 * `useSearch`, debounced, with a stale-response guard, listed-first ordering, the
 * unlisted chip and keyboard navigation — and was imported by nothing. This modal
 * is the mount that engine never had. `SearchBar` itself remains as the inline
 * dropdown form for any page that wants one.
 *
 * ## One flattened list is what keeps the keyboard honest
 *
 * Rows are rendered from `visibleItems` — the tab-filtered flatten — and the
 * highlight index points into that same array. Render from one list and navigate
 * another and Enter opens a different row than the one under the cursor, silently.
 * If you add a group here, add it to `flattenSearchResults`, in the same order.
 *
 * ## Scope: typed results are cross-chain, the zero-query list is not
 *
 * `useSearch` fans out across every served chain, so a typed hit can come from any
 * of them and each row is stamped with its origin by `fetchChainSearch`. The
 * zero-query lists are different: recents and trending come from
 * `MarketPageProvider`, which holds ONE chain — the one being displayed.
 *
 * Both still need the badge, and for the same reason: the same symbol exists on
 * several chains as different contracts, so an unbadged row is indistinguishable
 * from a row for the other chain's token. The trending adapters below therefore
 * stamp `displayNetworkName` rather than leaving `chain` unset.
 *
 * They did leave it unset until 2026-09-10, and the badge is rendered from that
 * field — `ChainChip` guards on `result.chain`, and `TokenImageIcon` /
 * `PairImageIcon` only draw a `ChainBadge` when handed a `chainName`. So the
 * modal's OPENING state, the one every user sees before typing, was the one state
 * with no chain marks anywhere, while typed results had them.
 */

const TRENDING_LIMIT = 4;

/** Marks a hit that Iter has not listed. Ordering sorts these last; this labels them. */
function UnlistedChip() {
    return (
        <span
            title="Not listed by Iter — anyone can deploy a token and open a market"
            className="shrink-0 rounded-[5px] border border-[color:var(--m-text-secondary-2)] px-1 py-px font-dm-mono text-[9px] uppercase text-[color:var(--m-text-secondary-2)]"
        >
            unlisted
        </span>
    );
}

/**
 * Which chain a hit is on.
 *
 * Search is cross-chain, and the same symbol exists on several chains as
 * different contracts — so without this two rows both reading "USDC" open
 * different markets and look identical while doing it. The row already routes to
 * its own chain (`buildResultTarget`); this is what tells the reader which one
 * before they click.
 *
 * Shows the leading word — "RISE Testnet" is too wide for a chip beside a
 * symbol — with the full name on hover.
 */
function ChainChip({ chain }: { chain: string }) {
    return (
        <span
            title={chain}
            className="shrink-0 rounded-[5px] border border-[color:var(--m-border)] px-1 py-px font-dm-mono text-[9px] uppercase text-[color:var(--m-text-secondary)]"
        >
            {chain.split(" ")[0]}
        </span>
    );
}

function GroupHeading({
    icon: IconCmp,
    children,
    action,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        // presentation: these sit INSIDE role="listbox", where any element that is
        // not an option breaks the listbox↔option relationship a screen reader walks.
        <div
            role="presentation"
            className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1"
        >
            <span className="flex items-center gap-1.5 font-dm-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--m-text-secondary)]">
                {IconCmp && <IconCmp className="h-3 w-3" />}
                {children}
            </span>
            {action}
        </div>
    );
}

function ResultRow({
    item,
    active,
    walletCtx,
    onSelect,
    onHover,
}: {
    item: SearchNavItem;
    active: boolean;
    walletCtx: WalletTargetContext;
    onSelect: () => void;
    onHover: () => void;
}) {
    const external = item.kind === "wallet" && Boolean(walletCtx.explorerUrl);

    return (
        <button
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={onHover}
            onFocus={onHover}
            // onMouseDown, not onClick: the input keeps focus for keyboard nav, and a
            // click that first blurs the field would race the dialog's own close.
            onMouseDown={(e) => {
                e.preventDefault();
                onSelect();
            }}
            className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                active ? "bg-[color:var(--m-surface-2)]" : "hover:bg-[color:var(--m-surface-2)]",
            )}
        >
            {/* `chainName` rather than a bare mark: `chain` is always set on a
                result precisely because the same symbol exists on several chains
                as different contracts, and the badge is how every other row in
                the app says which one. The ChainChip beside the name stays — a
                chip is the label for the badge, the same pairing the withdraw
                list uses. */}
            {item.kind === "token" && (
                <TokenImageIcon
                    symbol={item.result.symbol}
                    color={tokenColor(item.result.symbol)}
                    logoURI={item.result.logoURI}
                    size="sm"
                    chainName={item.result.chain}
                />
            )}
            {/* A pair drew two letters of its BASE in a grey circle, which named
                half the market and showed none of it. `PairImageIcon` is what
                every other pair row in the app uses.

                The halves fall back to hued initials here: `/api/search` returns
                each side as an ADDRESS, with no logo, so there is no artwork to
                pass. That is the component's own documented fallback rather than
                a gap — and it still carries the chain badge, which the grey
                circle never did. */}
            {item.kind === "pair" && (
                <PairImageIcon
                    base={item.result.baseSymbol}
                    quote={item.result.quoteSymbol}
                    baseLogoURI={item.result.baseLogoURI ?? undefined}
                    quoteLogoURI={item.result.quoteLogoURI ?? undefined}
                    baseColor={tokenColor(item.result.baseSymbol)}
                    quoteColor={tokenColor(item.result.quoteSymbol)}
                    chainName={item.result.chain}
                    className="h-7 w-7"
                />
            )}
            {item.kind === "wallet" && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
                    <Wallet className="h-3.5 w-3.5 text-[color:var(--m-text-secondary)]" />
                </span>
            )}

            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium text-[color:var(--m-text-primary)]">
                    {item.kind === "token" && item.result.symbol}
                    {item.kind === "pair" && `${item.result.baseSymbol}/${item.result.quoteSymbol}`}
                    {item.kind === "wallet" && truncateAddress(item.result.address)}
                    {item.kind !== "wallet" && item.result.chain && (
                        <ChainChip chain={item.result.chain} />
                    )}
                    {item.kind !== "wallet" && isUnlisted(item.result) && <UnlistedChip />}
                </span>
                <span className="truncate text-xs text-[color:var(--m-text-secondary)]">
                    {item.kind === "token" && item.result.name}
                    {item.kind === "pair" && item.result.symbol}
                    {item.kind === "wallet" && walletTargetLabel(item.result.address, walletCtx)}
                </span>
            </span>

            {external && (
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[color:var(--m-text-secondary)]" />
            )}
        </button>
    );
}

export function SearchModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const {
        displayNetworkName,
        displayNetworkSlug,
        address: connectedAddress,
        topVolumeTokenData,
        defaultTokenData,
        defaultSpotPairData,
    } = useMarketPageContext();

    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<SearchTab>("all");
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [recents, setRecents] = useState<SearchNavItem[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const { tokens, pairs, isLoading } = useSearch(query);
    const trimmed = query.trim();
    const hasQuery = trimmed !== "";

    const walletCtx = useMemo<WalletTargetContext>(
        () => ({
            connectedAddress,
            explorerUrl: explorerUrlForNetwork(displayNetworkName),
        }),
        [connectedAddress, displayNetworkName],
    );

    // The wallet hit is resolved locally — no request, and no dependency on the
    // search response landing. A valid address is an answer the client already has.
    const walletHit = useMemo<SearchWalletResult | null>(() => {
        if (!isAddressQuery(trimmed)) return null;
        const checksummed = toChecksumAddress(trimmed);
        if (!checksummed) return null;
        return { type: "wallet", id: checksummed.toLowerCase(), address: checksummed };
    }, [trimmed]);

    const items = useMemo(
        () => flattenSearchResults(tokens, pairs, walletHit),
        [tokens, pairs, walletHit],
    );
    const counts = useMemo(() => tabCounts(items), [items]);
    const visibleItems = useMemo(() => filterByTab(items, tab), [items, tab]);

    const trendingTokens = useMemo(() => {
        const source = topVolumeTokenData?.tokens?.length
            ? topVolumeTokenData.tokens
            : (defaultTokenData?.tokens ?? []);
        // An arrow, not a bare `.map(tokenToResult)`: `map` passes (value, index,
        // array), so a point-free reference would hand the INDEX to `chain` and
        // stamp every row with a number.
        return source
            .slice(0, TRENDING_LIMIT)
            .map((token) => tokenToResult(token, displayNetworkName));
    }, [topVolumeTokenData, defaultTokenData, displayNetworkName]);

    const trendingPairs = useMemo(
        () =>
            (defaultSpotPairData?.pairs ?? [])
                .slice(0, TRENDING_LIMIT)
                .map((pair) => pairToResult(pair, displayNetworkName)),
        [defaultSpotPairData, displayNetworkName],
    );

    const zeroQueryItems = useMemo<SearchNavItem[]>(() => {
        const trending = flattenSearchResults(trendingTokens, trendingPairs);
        return [...recents, ...trending];
    }, [recents, trendingTokens, trendingPairs]);

    /**
     * The rows actually on screen, and the array every keyboard interaction
     * indexes into. Declared BEFORE the effects below, which depend on it —
     * rendering one list while navigating another is the bug this whole file is
     * arranged to prevent.
     */
    const rows = hasQuery ? visibleItems : zeroQueryItems;

    // Recents are read in an effect, never during render: the server cannot know
    // them, so rendering them on the first pass is a hydration mismatch. Same rule
    // as the consent banner and the OG Pass countdown.
    useEffect(() => {
        if (open) setRecents(readRecents());
    }, [open]);

    // A fresh result set (or a tab change) resets the highlight to the top match
    // rather than carrying over an index that now points somewhere else.
    //
    // Keyed on `rows`, NOT on `visibleItems`. `rows` is the zero-query list when
    // there is no query, and keying on the search results left the highlight at -1
    // while recents were on screen — so Enter did nothing until the user pressed ↓
    // first, on the one view where every row is something they picked before.
    useEffect(() => {
        setHighlightIndex(rows.length > 0 ? 0 : -1);
    }, [rows]);

    // Keep the highlighted row in view under keyboard navigation.
    //
    // `offsetTop` is measured from the nearest POSITIONED ancestor, so the list
    // container carries `relative`. Without it the offset parent is DialogContent
    // (which is `fixed`) and every row's offsetTop silently includes the search row
    // and tab strip — compared against a scrollTop that starts at 0, that
    // over-scrolls by ~98px and pushes the highlighted row off the top.
    //
    // Scoped to the list rather than `scrollIntoView`, which walks up to the
    // document and can yank the page behind the dialog.
    useEffect(() => {
        const list = listRef.current;
        if (!list || highlightIndex < 0) return;
        const row = list.querySelector<HTMLElement>(`[data-row-index="${highlightIndex}"]`);
        if (!row) return;
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        if (rowTop < list.scrollTop) list.scrollTop = rowTop;
        else if (rowBottom > list.scrollTop + list.clientHeight) {
            list.scrollTop = rowBottom - list.clientHeight;
        }
    }, [highlightIndex]);

    const selectItem = useCallback(
        (item: SearchNavItem) => {
            const target = buildResultTarget(displayNetworkSlug, item, walletCtx);
            // A wallet on a chain with no explorer has nowhere to go. The row already
            // says so; clicking it must be a no-op rather than a navigation to "".
            if (!target) return;

            setRecents((prev) => {
                const next = pushRecent(prev, item);
                writeRecents(next);
                return next;
            });

            onOpenChange(false);
            setQuery("");
            setTab("all");

            if (target.external) {
                window.open(target.href, "_blank", "noopener,noreferrer");
            } else {
                router.push(target.href);
            }
        },
        [displayNetworkSlug, walletCtx, onOpenChange, router],
    );

    const prefetchItem = useCallback(
        (item: SearchNavItem) => {
            const path = buildResultPath(displayNetworkSlug, item);
            // "" means external or unresolvable — there is no route to warm.
            if (path) router.prefetch(path);
        },
        [displayNetworkSlug, router],
    );

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((current) =>
                clampHighlightIndex(current, event.key === "ArrowDown" ? 1 : -1, rows.length),
            );
        } else if (event.key === "Enter") {
            if (highlightIndex >= 0 && rows[highlightIndex]) {
                event.preventDefault();
                selectItem(rows[highlightIndex]);
            }
        } else if (event.key === "Tab" && hasQuery) {
            // Tab cycles the tabs rather than leaving the field — the field is the
            // only thing in here you type into, so escaping it is never the intent.
            event.preventDefault();
            const i = SEARCH_TABS.indexOf(tab);
            const next = event.shiftKey
                ? (i - 1 + SEARCH_TABS.length) % SEARCH_TABS.length
                : (i + 1) % SEARCH_TABS.length;
            setTab(SEARCH_TABS[next]);
        }
    }

    function handleClearRecents() {
        clearRecents();
        setRecents([]);
    }

    const recentCount = recents.length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                // Radix focuses the first focusable child on open, which would be the
                // close button; the field is the only sensible target here.
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    inputRef.current?.focus();
                }}
                className="top-[8%] max-h-[84vh] w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-0 sm:max-w-[560px]"
            >
                <DialogTitle className="sr-only">Search tokens, pools and wallets</DialogTitle>

                {/* pr-12 clears DialogContent's own close button, pinned top-right. */}
                <div className="flex items-center gap-3 border-b border-[color:var(--m-border)] px-4 py-3 pr-12">
                    <Search className="h-5 w-5 shrink-0 text-[color:var(--m-text-secondary)]" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search tokens, pools, and wallets"
                        role="combobox"
                        aria-controls="search-modal-results"
                        aria-expanded={rows.length > 0}
                        aria-autocomplete="list"
                        className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--m-text-primary)] placeholder:text-[color:var(--m-text-secondary)] focus:outline-none"
                    />
                    {isLoading && hasQuery && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--m-text-secondary)]" />
                    )}
                    {/* Naming the chain is what stops "no results" reading as "does not
                        exist" when the token is simply on another network. */}
                    <span className="shrink-0 rounded-full border border-[color:var(--m-border)] px-2 py-0.5 font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                        {displayNetworkName}
                    </span>
                </div>

                {hasQuery && (
                    <div
                        role="tablist"
                        aria-label="Result categories"
                        className="flex gap-5 border-b border-[color:var(--m-border)] px-4"
                    >
                        {SEARCH_TABS.map((t) => (
                            <button
                                key={t}
                                type="button"
                                role="tab"
                                aria-selected={tab === t}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    setTab(t);
                                }}
                                className={cn(
                                    "-mb-px border-b-2 py-2.5 text-sm transition-colors",
                                    tab === t
                                        ? "border-[color:var(--m-primary)] font-semibold text-[color:var(--m-text-primary)]"
                                        : "border-transparent text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                                )}
                            >
                                {SEARCH_TAB_LABELS[t]}
                                {t !== "all" && counts[t] > 0 && (
                                    <span className="ml-1.5 font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                                        {counts[t]}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                <div
                    ref={listRef}
                    id="search-modal-results"
                    role="listbox"
                    aria-label="Search results"
                    // `relative` is load-bearing: it makes this the offset parent the
                    // scroll-into-view effect measures rows against. See that effect.
                    className="relative max-h-[min(60vh,26rem)] overflow-y-auto pb-2"
                >
                    {hasQuery ? (
                        <>
                            {isLoading && visibleItems.length === 0 && (
                                <p className="px-4 py-8 text-center text-sm text-[color:var(--m-text-secondary)]">
                                    Searching…
                                </p>
                            )}
                            {!isLoading && visibleItems.length === 0 && (
                                <div className="px-4 py-8 text-center">
                                    <p className="text-sm text-[color:var(--m-text-secondary)]">
                                        No {tab === "all" ? "results" : SEARCH_TAB_LABELS[tab].toLowerCase()} for
                                        &ldquo;{trimmed}&rdquo;
                                    </p>
                                    <p className="mt-1 text-xs text-[color:var(--m-text-secondary-2)]">
                                        {tab === "wallets"
                                            ? "Wallets are found by pasting a full address."
                                            : `Searching ${displayNetworkName} — try another chain.`}
                                    </p>
                                </div>
                            )}
                            {visibleItems.map((item, i) => (
                                <div
                                    key={`${item.kind}-${item.result.id}`}
                                    role="presentation"
                                    data-row-index={i}
                                >
                                    {/* Headings only on the All tab: inside a single-kind tab
                                        they label a list that is already only that kind. */}
                                    {tab === "all" &&
                                        (i === 0 || visibleItems[i - 1].kind !== item.kind) && (
                                            <GroupHeading>
                                                {item.kind === "token"
                                                    ? "Tokens"
                                                    : item.kind === "pair"
                                                      ? "Pools"
                                                      : "Wallet"}
                                            </GroupHeading>
                                        )}
                                    <ResultRow
                                        item={item}
                                        active={i === highlightIndex}
                                        walletCtx={walletCtx}
                                        onSelect={() => selectItem(item)}
                                        onHover={() => {
                                            setHighlightIndex(i);
                                            prefetchItem(item);
                                        }}
                                    />
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {recentCount > 0 && (
                                <GroupHeading
                                    icon={Clock}
                                    action={
                                        <button
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                handleClearRecents();
                                            }}
                                            className="text-xs text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
                                        >
                                            Clear
                                        </button>
                                    }
                                >
                                    Recent searches
                                </GroupHeading>
                            )}
                            {zeroQueryItems.map((item, i) => (
                                <div
                                    key={`${item.kind}-${item.result.id}`}
                                    role="presentation"
                                    data-row-index={i}
                                >
                                    {i === recentCount && (
                                        <GroupHeading icon={TrendingUp}>By 24h volume</GroupHeading>
                                    )}
                                    <ResultRow
                                        item={item}
                                        active={i === highlightIndex}
                                        walletCtx={walletCtx}
                                        onSelect={() => selectItem(item)}
                                        onHover={() => {
                                            setHighlightIndex(i);
                                            prefetchItem(item);
                                        }}
                                    />
                                </div>
                            ))}
                            {zeroQueryItems.length === 0 && (
                                <p className="px-4 py-8 text-center text-sm text-[color:var(--m-text-secondary)]">
                                    Search a token, a pool, or paste a wallet address.
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--m-border)] px-4 py-2 font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                    <span>
                        <kbd className="rounded border border-[color:var(--m-border)] px-1">↑</kbd>
                        <kbd className="ml-0.5 rounded border border-[color:var(--m-border)] px-1">↓</kbd> move
                    </span>
                    <span>
                        <kbd className="rounded border border-[color:var(--m-border)] px-1">↵</kbd> open
                    </span>
                    {hasQuery && (
                        <span>
                            <kbd className="rounded border border-[color:var(--m-border)] px-1">tab</kbd> category
                        </span>
                    )}
                    <span>
                        <kbd className="rounded border border-[color:var(--m-border)] px-1">esc</kbd> close
                    </span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
