"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Atoms/Icon";
import { IconButton } from "@/components/Atoms/IconButton";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useSearch } from "@/hooks/useSearch";
import { buildResultPath, clampHighlightIndex, flattenSearchResults, listedFirst, type SearchNavItem } from "./searchNav";
import { isUnlisted } from "@/lib/search/listing";

interface SearchBarProps {
    className?: string;
    placeholder?: string;
}

/**
 * Navbar token/pair search: a debounced input (debouncing lives in
 * `useSearch`) bound to the active chain's `/api/search` route, with a
 * Tokens/Pairs grouped dropdown, ↑/↓ keyboard nav, Enter to select, Esc
 * and click-outside to close. Visually matches the existing pill-input
 * (see the now-superseded NavSearchButton) and popover surface (see
 * SearchPopover's PopoverContent) so it doesn't introduce a new design
 * language.
 */
/**
 * Marks a hit that Iter has not listed.
 *
 * `/api/search` is an identity lookup and stays ungated on purpose, so unlisted
 * tokens and markets have always been reachable here. Without this chip they
 * were indistinguishable from reviewed ones — the results are sorted after the
 * listed hits (see listedFirst), but ordering is not a label.
 */
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

export function SearchBar({ className, placeholder = "Search" }: SearchBarProps) {
    const router = useRouter();
    const { displayNetworkSlug } = useMarketPageContext();
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { tokens, pairs, isLoading } = useSearch(query);
    const items = useMemo(() => flattenSearchResults(tokens, pairs), [tokens, pairs]);
    // The rendered order MUST match flattenSearchResults' order, or the keyboard
    // highlight index points at a different row than the one under the cursor.
    const orderedTokens = useMemo(() => listedFirst(tokens), [tokens]);
    const orderedPairs = useMemo(() => listedFirst(pairs), [pairs]);

    // A fresh result set arrives -> reset the highlight to the top match
    // (or none, if empty) rather than carrying over a stale index.
    useEffect(() => {
        setHighlightIndex(items.length > 0 ? 0 : -1);
    }, [items]);

    useEffect(() => {
        if (!isOpen) return;
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const trimmedQuery = query.trim();
    const showPanel = isOpen && trimmedQuery !== "";

    function selectItem(item: SearchNavItem) {
        router.push(buildResultPath(displayNetworkSlug, item));
        setIsOpen(false);
        setQuery("");
        inputRef.current?.blur();
    }

    // Warms the destination route on hover/focus so the click-to-paint
    // latency the design calls out is mostly hidden by the time the trader
    // actually clicks. A speculative `getSpotOrderbook` warm for pair
    // results was considered too (per the design's REST latency-hiding
    // goal) but `getSpotOrderbook` takes full `SpotToken` objects (id-keyed)
    // for base/quote plus step/depth/isSingleSide, none of which a search
    // result carries — resolving those first adds a second round trip
    // before the warm could even fire, defeating the point. Left as a
    // follow-up; route prefetch is the primary win called out in the brief.
    function prefetchItem(item: SearchNavItem) {
        router.prefetch(buildResultPath(displayNetworkSlug, item));
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightIndex((current) => clampHighlightIndex(current, 1, items.length));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightIndex((current) => clampHighlightIndex(current, -1, items.length));
        } else if (event.key === "Enter") {
            if (highlightIndex >= 0 && items[highlightIndex]) {
                event.preventDefault();
                selectItem(items[highlightIndex]);
            }
        } else if (event.key === "Escape") {
            setIsOpen(false);
            inputRef.current?.blur();
        }
    }

    function handleClear() {
        setQuery("");
        setIsOpen(false);
    }

    return (
        <div ref={containerRef} className={cn("relative w-full", className)}>
            <div className="bg-black-300 hover:bg-black-200 group text-dark-grey-1 relative flex items-center rounded-full p-3">
                <Icon icon={Search} className="mr-3 h-5 w-5 shrink-0 group-hover:text-white" size={20} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    role="combobox"
                    aria-expanded={showPanel}
                    aria-controls="navbar-search-results"
                    aria-autocomplete="list"
                    className="placeholder:text-dark-grey-1 flex-1 bg-transparent text-sm text-white focus:outline-none group-hover:placeholder:text-white"
                />
                {isLoading && trimmedQuery !== "" && (
                    <Icon icon={Loader2} className="text-dark-grey-1 mr-1 h-4 w-4 shrink-0 animate-spin" size={16} />
                )}
                <IconButton
                    icon={X}
                    onClick={handleClear}
                    label="Clear search"
                    className={cn("shrink-0 group-hover:text-white", query ? "" : "opacity-0")}
                    size={18}
                />
            </div>

            {showPanel && (
                <div
                    id="navbar-search-results"
                    role="listbox"
                    className="bg-neutral-dark-default border-neutral-light-white-12 absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-96 overflow-y-auto rounded-3xl border p-2 text-white shadow-lg"
                >
                    {isLoading && items.length === 0 && (
                        <div className="text-dark-grey-1 px-4 py-6 text-center text-sm">Searching…</div>
                    )}
                    {!isLoading && items.length === 0 && (
                        <div className="text-dark-grey-1 px-4 py-6 text-center text-sm">
                            No results for &ldquo;{trimmedQuery}&rdquo;
                        </div>
                    )}

                    {tokens.length > 0 && (
                        <div className="mb-1">
                            <div className="text-dark-grey-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                                Tokens
                            </div>
                            {orderedTokens.map((token) => {
                                const index = items.findIndex(
                                    (item) => item.kind === "token" && item.result.id === token.id,
                                );
                                return (
                                    <button
                                        key={token.id}
                                        type="button"
                                        role="option"
                                        aria-selected={index === highlightIndex}
                                        onMouseEnter={() => {
                                            setHighlightIndex(index);
                                            prefetchItem({ kind: "token", result: token });
                                        }}
                                        onFocus={() => prefetchItem({ kind: "token", result: token })}
                                        onClick={() => selectItem({ kind: "token", result: token })}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm",
                                            index === highlightIndex ? "bg-black-300" : "hover:bg-black-300",
                                        )}
                                    >
                                        <TokenImageIcon symbol={token.symbol} color="#666666" logoURI={token.logoURI} size="sm" />
                                        <span className="flex min-w-0 flex-col">
                                            <span className="flex items-center gap-1.5 truncate font-medium">
                                                {token.symbol}
                                                {isUnlisted(token) && <UnlistedChip />}
                                            </span>
                                            <span className="text-dark-grey-1 truncate text-xs">{token.name}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {pairs.length > 0 && (
                        <div>
                            <div className="text-dark-grey-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                                Pairs
                            </div>
                            {orderedPairs.map((pair) => {
                                const index = items.findIndex(
                                    (item) => item.kind === "pair" && item.result.id === pair.id,
                                );
                                return (
                                    <button
                                        key={pair.id}
                                        type="button"
                                        role="option"
                                        aria-selected={index === highlightIndex}
                                        onMouseEnter={() => {
                                            setHighlightIndex(index);
                                            prefetchItem({ kind: "pair", result: pair });
                                        }}
                                        onFocus={() => prefetchItem({ kind: "pair", result: pair })}
                                        onClick={() => selectItem({ kind: "pair", result: pair })}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm",
                                            index === highlightIndex ? "bg-black-300" : "hover:bg-black-300",
                                        )}
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <span className="flex items-center gap-1.5 truncate font-medium">
                                                {pair.baseSymbol}/{pair.quoteSymbol}
                                                {isUnlisted(pair) && <UnlistedChip />}
                                            </span>
                                            <span className="text-dark-grey-1 truncate text-xs">{pair.symbol}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
