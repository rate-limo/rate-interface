"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Atoms/Icon";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { chooseMenuPlacement, type MenuPlacement } from "@/lib/chains/menuPlacement";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useChainSwitch } from "@/hooks/useChainSwitch";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";

interface ChainSwitcherProps {
    className?: string;
    /**
     * Offer "All chains" as a scope, alongside the individual networks.
     *
     * Off by default, and deliberately opt-in: cross-chain is a real answer only
     * where the surface below actually reads `chainFilter` (Explore's token
     * directory and the shelves). On a pair or token profile the page is about
     * one market on one chain, and an "All chains" entry there would be a
     * control that reports a choice and changes nothing.
     */
    allChains?: boolean;
    /**
     * Render as a CONTROLLED picker: show this chain as active, and report a
     * choice instead of acting on it.
     *
     * With `value`/`onSelect` set the switcher navigates nowhere and writes no
     * `chainFilter` — the caller owns the state. Pro's market picker needs
     * exactly that: choosing a chain there re-scopes the market list in place,
     * and it is picking a MARKET that navigates. Letting it switch the page
     * instead would move the terminal out from under the open dropdown, and
     * would strand `?base=&quote=` pointing at a market the new chain may not
     * have.
     *
     * Both must be passed together; `value` alone would render a chain as
     * active while selecting it still switched the page.
     */
    value?: string;
    onSelect?: (networkName: string) => void;
    /** Styling for the trigger button. The default is the sidebar's 44x64 pill,
     * which is far too large inline in a panel header. */
    triggerClassName?: string;
}

/**
 * Navbar chain switcher: a dropdown listing `supportedChains` (the single
 * source of truth from Task 2), highlighting the active
 * `displayNetworkName`, and calling `useChainSwitch().switchTo` on select —
 * navigation/landing logic lives entirely in that hook (preserve-market-else-
 * default), this component only renders the list and forwards the pick.
 * Matches the pill/popover styling already used by SearchBar.
 */
export function ChainSwitcher({
    className,
    allChains = false,
    value,
    onSelect,
    triggerClassName,
}: ChainSwitcherProps) {
    const { displayNetworkName: pageNetworkName, chainFilter, setChainFilter } = useMarketPageContext();
    const controlled = value !== undefined && onSelect !== undefined;
    // What this control reports as active. Controlled, that is the caller's
    // value; otherwise the chain the page is on.
    const displayNetworkName = controlled ? value : pageNetworkName;
    const { switchTo } = useChainSwitch();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    /**
     * Which corner the menu grows from — see `lib/chains/menuPlacement`, which
     * holds the rule and the reason. Down-and-right until measured otherwise,
     * so the first paint matches what every trigger in a bar will settle on.
     */
    const [placement, setPlacement] = useState<MenuPlacement>({ up: false, left: true });
    // The build's chain list, minus anything an operator has switched off.
    const visibleChains = useVisibleChains();
    // An operator's uploaded chain logo, preferred over the build-time icon.
    // Until this existed, a logo saved in the panel was never read by the app.
    const { data: chainBrands } = useChainBrand();
    const iconFor = (name: string) => chainIconFrom(chainBrands, name);
    const containerRef = useRef<HTMLDivElement>(null);

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

    /**
     * Cross-chain is a SCOPE, not a network, so it never navigates.
     *
     * `switchTo` changes which chain the page is about — the URL's `?chain=`,
     * the connected wallet's target, the gateway every single-chain read goes
     * to. There is no such thing as navigating to "all of them"; the page still
     * needs one default chain underneath. So this only clears `chainFilter`, and
     * the surfaces that fan out read that.
     */
    function handleSelectAll() {
        setIsOpen(false);
        setQuery("");
        setChainFilter(null);
    }

    function handleSelect(networkName: string) {
        setIsOpen(false);
        setQuery("");
        // Controlled: report and stop. No navigation, no chainFilter, and no
        // early return on "already selected" — a caller may legitimately want
        // the callback either way, and it is theirs to ignore.
        if (controlled) {
            onSelect(networkName);
            return;
        }
        /**
         * Narrow BEFORE navigating, and do it even when the chain is already the
         * display one.
         *
         * Where this switcher offers cross-chain it is the same control as the
         * scope chips under it, and both write `chainFilter`. Skipping the write
         * on `networkName === displayNetworkName` is exactly the case that has to
         * work: scope "All chains" on a page already displaying Arc, picking Arc
         * means "narrow to Arc" — there is nowhere to navigate, and doing nothing
         * would leave a switcher reading "Arc" beside a table showing every chain.
         */
        if (allChains) setChainFilter(networkName);
        if (networkName === displayNetworkName) return;
        switchTo(networkName);
    }

    // What the trigger is currently reporting. Cross-chain has no logo of its
    // own — a chain's mark here would name one of the several being shown.
    const showingAll = !controlled && allChains && chainFilter === null;
    const activeLabel = showingAll ? "All chains" : displayNetworkName;
    const needle = query.trim().toLowerCase();

    function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
        if (event.key === "Escape") {
            setIsOpen(false);
        } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
        }
    }

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <button
                type="button"
                onClick={(event) => {
                    // Measured on the way open, never on a resize: the menu
                    // closes on an outside click anyway, so a placement can
                    // only be stale for a window resized while it is open.
                    setPlacement(
                        chooseMenuPlacement(event.currentTarget.getBoundingClientRect(), {
                            width: window.innerWidth,
                            height: window.innerHeight,
                        }),
                    );
                    setIsOpen((open) => !open);
                }}
                onKeyDown={handleTriggerKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`Chain: ${activeLabel}`}
                title={activeLabel}
                className={cn(
                    "group flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-[0_8px_24px_rgba(0,0,0,.08)] transition-colors hover:border-[color:var(--m-border-strong,var(--m-text-secondary-2))]",
                    triggerClassName ?? "h-11 w-16",
                )}
            >
                {showingAll ? (
                    <span
                        aria-hidden
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
                    >
                        <Layers className="h-4 w-4" />
                    </span>
                ) : (
                    <TokenImageIcon
                        symbol={displayNetworkName}
                        color="#666666"
                        logoURI={iconFor(displayNetworkName)}
                        size="md"
                    />
                )}
                <Icon
                    icon={isOpen ? ChevronUp : ChevronDown}
                    className="h-4 w-4 shrink-0 text-[color:var(--m-text-secondary)]"
                    size={16}
                />
            </button>

            {isOpen && (
                <div
                    role="listbox"
                    aria-label="Select chain"
                    className={cn(
                        "absolute z-50 w-[340px] rounded-3xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2.5 text-[color:var(--m-text-primary)] shadow-[0_18px_48px_rgba(0,0,0,.28)]",
                        placement.up ? "bottom-[calc(100%+0.75rem)]" : "top-[calc(100%+0.75rem)]",
                        placement.left ? "right-0" : "left-0",
                    )}
                >
                    <label className="mb-2 flex h-12 items-center gap-3 rounded-2xl bg-[color:var(--m-surface-2)] px-4 text-[color:var(--m-text-secondary)] focus-within:ring-2 focus-within:ring-[color:var(--m-primary)]/30">
                        <Search aria-hidden className="h-5 w-5 shrink-0" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search networks"
                            aria-label="Search networks"
                            className="min-w-0 flex-1 bg-transparent text-base text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary)]"
                        />
                    </label>
                    <div role="presentation" className="max-h-[25rem] overflow-y-auto">
                    {/* First, and above the networks, because it is the WIDER
                        scope rather than another peer in the list — the same
                        position and the same words the scope chips use, so the
                        two controls in this header cannot describe the page
                        differently. */}
                    {allChains && "all chains".includes(needle) ? (
                        <button
                            type="button"
                            role="option"
                            aria-selected={showingAll}
                            onClick={handleSelectAll}
                            className={cn(
                                "flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left text-base transition-colors",
                                showingAll ? "bg-[color:var(--m-surface-2)]" : "hover:bg-[color:var(--m-surface-2)]",
                            )}
                        >
                            <span
                                aria-hidden
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]"
                            >
                                <Layers className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">All chains</span>
                        </button>
                    ) : null}
                    {visibleChains.filter((networkName) => networkName.toLowerCase().includes(needle)).map((networkName) => {
                        // Which chain the page is ON, and — where cross-chain is
                        // offered — whether the reader has narrowed to it. Marking
                        // a chain selected while the table shows every chain is the
                        // disagreement this control exists to remove.
                        const isActive = networkName === displayNetworkName && !showingAll;
                        return (
                            <button
                                key={networkName}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                // Switching chain changes the whole interface under
                                // you; re-picking the current one changes nothing.
                                data-sound={isActive ? "none" : "notification"}
                                onClick={() => handleSelect(networkName)}
                                className={cn(
                                    "flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left text-base transition-colors",
                                    isActive ? "bg-[color:var(--m-surface-2)]" : "hover:bg-[color:var(--m-surface-2)]",
                                )}
                            >
                                <TokenImageIcon
                                    symbol={networkName}
                                    color="#666666"
                                    logoURI={iconFor(networkName)}
                                    size="md"
                                />
                                <span className="truncate">{networkName}</span>
                            </button>
                        );
                    })}
                    </div>
                </div>
            )}
        </div>
    );
}
