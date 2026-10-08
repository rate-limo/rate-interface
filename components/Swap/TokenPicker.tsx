"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/swap/tokens";
import type { SwapToken } from "@/lib/swap/types";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { useAllSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { chainIds, chainIdToNetworkName } from "@/consts";

interface TokenPickerProps {
  open: boolean;
  side: "pay" | "get";
  tokens: SwapToken[];
  hub: SwapToken;
  currentSymbol: string;
  otherSymbol: string;
  networkName: string;
  onSelect: (token: SwapToken) => void;
  onClose: () => void;
}

function hopsBetween(a: string, b: string, hub: string): number {
  return a === hub || b === hub ? 1 : 2;
}

function shortAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Native token";
}

export function TokenPicker(props: TokenPickerProps) {
  if (!props.open) return null;
  // SwapCard lives inside desktop trade panels with overflow clipping. Portaling
  // the picker to body lets its backdrop cover the whole app-shell page instead
  // of being constrained to the card's grid cell.
  if (typeof document === "undefined") return null;
  return createPortal(<OpenTokenPicker {...props} />, document.body);
}

function OpenTokenPicker({
  side,
  tokens,
  hub,
  currentSymbol,
  otherSymbol,
  networkName,
  onSelect,
  onClose,
}: TokenPickerProps) {
  const [query, setQuery] = useState("");
  const [networkQuery, setNetworkQuery] = useState("");
  const [networkOpen, setNetworkOpen] = useState(false);

  /**
   * The NETWORK rows resolve the operator's uploaded mark, not the build-time
   * icon.
   *
   * `ChainBadge` already does this for the badge riding each token, which is why
   * those show the upload correctly. These two rows render the chain AS a token
   * (`TokenImageIcon symbol={networkName}`), so that badge never runs and
   * `getChainIconUrl` — the compiled-in `evmNetworks` list — was the whole
   * answer. RISE resolved to a pbs.twimg.com avatar and Arc has no entry there
   * at all, so an operator uploaded both marks in the panel, saw them saved, and
   * this picker kept rendering the shipped icon for one chain and a generated
   * one for the other.
   *
   * The build-time fallback is GONE — `getChainIconUrl` and the `evmNetworks`
   * list behind it are deleted, their only two entries having been dead
   * pbs.twimg.com links. A chain with no uploaded mark renders its initials, the
   * same answer `ChainBadge` gives.
   */
  const { data: chainBrands } = useChainBrand();
  const networkIcon = (name: string) => chainIconFrom(chainBrands, name);
  /**
   * Which chain's tokens this picker is SHOWING — null means ALL of them.
   *
   * All chains is the default because "find me USDC" is not a per-network
   * question. It used to browse one chain at a time, starting on the card's,
   * which meant a token on another network was invisible until you knew to go
   * looking for it.
   *
   * Choosing a network here still never navigates. It narrows this list, and
   * nothing outside the picker moves until a token is actually chosen — at
   * which point `SwapCard.pick` re-homes the card to that token's chain,
   * because a swap cannot span two.
   *
   * ## The RECEIVE side opens on the pay token's chain, not on all of them
   *
   * That re-homing is a reasonable answer on the pay side, where switching
   * network IS the intent. On the receive side it is destructive: there is no
   * bridge and the router routes within one chain, so `SwapCard.pick` has to
   * move the other leg too — and what it moves it to is the new chain's HUB.
   * Pick a RISE token to receive while paying in Arc USDC and the USDC you
   * chose is silently replaced.
   *
   * So this side opens filtered to the chain the card is already on, which is
   * the pay token's. Cross-chain swaps are not possible, so an unfiltered list
   * here offers a choice that cannot be honoured — every row on another chain
   * either fails to quote or quietly rewrites the other half of the trade.
   *
   * It is a DEFAULT, not a lock: the network selector still works, so switching
   * the whole market from this side remains one click for anyone who means it.
   * The pay side is unchanged and still opens on every chain, because "find me
   * USDC" is genuinely not a per-network question when nothing is anchored yet.
   */
  const [browseChain, setBrowseChain] = useState<string | null>(
    side === "get" ? networkName : null,
  );

  const all = useAllSwapTokens(true, browseChain ? [browseChain] : undefined);

  // The prop is the card's own chain list and is all that exists in preview,
  // where there is no live fetch at all.
  const listTokens = all.tokens.length > 0 ? all.tokens : tokens;
  const listLoading = all.isLoading && all.tokens.length === 0;

  /** The card's current chain — a row on any other one will re-home it. */
  const payChainId = chainIds[networkName];
  const chainNameOf = (token: SwapToken): string =>
    chainIdToNetworkName[token.chainId] ?? networkName;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return listTokens;
    return listTokens.filter((token) =>
      [token.symbol, token.name, token.address].some((value) => value.toLowerCase().includes(needle))
    );
  }, [query, listTokens]);
  const visibleChains = useVisibleChains();
  const filteredNetworks = visibleChains.filter((name) => name.toLowerCase().includes(networkQuery.trim().toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-6 backdrop-blur-sm sm:items-center sm:py-10"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-picker-title"
        className="flex max-h-[min(760px,calc(100dvh-3rem))] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-[0_28px_90px_-24px_rgba(8,20,34,.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 pb-4 pt-6 sm:px-8 sm:pt-7">
          <div>
            <h2 id="token-picker-title" className="text-[25px] font-semibold tracking-[-0.025em] text-[color:var(--m-text-primary)]">
              Select a token
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--m-text-secondary-2)]">
              Choose what you want to {side === "pay" ? "pay" : "receive"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close token picker"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] transition-colors hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </header>

        <div className="px-6 sm:px-8">
          <div className="relative">
            <div className="flex h-[66px] items-center gap-3 rounded-[20px] bg-[color:var(--m-surface-2)] px-5 text-[color:var(--m-text-secondary-2)] transition-shadow focus-within:ring-2 focus-within:ring-[color:var(--m-primary)]/45">
            <Search className="h-6 w-6 flex-shrink-0" strokeWidth={1.7} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or paste address"
              className="min-w-0 flex-1 border-0 bg-transparent text-[17px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
            />
            <button type="button" aria-label={`Filter tokens by network, currently ${browseChain ?? "all chains"}`} aria-expanded={networkOpen} onClick={() => setNetworkOpen((open) => !open)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-2.5 py-1.5 font-mono text-[10px] font-semibold text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]">
              {browseChain ? (
                <TokenImageIcon symbol={browseChain} color="#666666" logoURI={networkIcon(browseChain)} size="sm" />
              ) : (
                // "All" is not a chain, so it gets no initials avatar ("AL").
                <Globe className="h-4 w-4" strokeWidth={1.7} aria-hidden />
              )}
              <span className="max-w-[84px] truncate">{browseChain ?? "All chains"}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", networkOpen && "rotate-180")} />
            </button>
            </div>
            {networkOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-[min(320px,calc(100vw-3rem))] overflow-hidden rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2 shadow-2xl">
                <div className="flex items-center gap-2 rounded-[14px] bg-[color:var(--m-surface-2)] px-3 py-2.5">
                  <Search className="h-4 w-4 text-[color:var(--m-text-secondary-2)]" />
                  <input value={networkQuery} onChange={(event) => setNetworkQuery(event.target.value)} placeholder="Search networks" className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]" />
                </div>
                <div className="mt-1 max-h-64 overflow-y-auto">
                  {/* Without this the filter is one-way: every other row SETS a
                      chain, so once one is picked there is no way back to the
                      default. Hidden while searching, because it matches no
                      query and would sit above the results looking like one. */}
                  {networkQuery.trim() === "" && (
                    <button
                      type="button"
                      onClick={() => { setNetworkOpen(false); setBrowseChain(null); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-[13px]",
                        browseChain === null
                          ? "bg-[color:var(--m-surface-2)] font-semibold"
                          : "hover:bg-[color:var(--m-surface-2)]",
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--m-border)] text-[9px] text-[color:var(--m-text-secondary)]">
                        ∗
                      </span>
                      <span className="min-w-0 flex-1 truncate">All chains</span>
                      {browseChain === null && <span className="text-[color:var(--m-primary)]">✓</span>}
                    </button>
                  )}
                  {filteredNetworks.map((name) => {
                    const active = name === browseChain;
                    return (
                      <button key={name} type="button" onClick={() => { setNetworkOpen(false); setNetworkQuery(""); setBrowseChain(name); }} className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-[13px]", active ? "bg-[color:var(--m-surface-2)] font-semibold" : "hover:bg-[color:var(--m-surface-2)]")}>
                        <TokenImageIcon symbol={name} color="#666666" logoURI={networkIcon(name)} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {active && <span className="text-[color:var(--m-primary)]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 py-5">
            {listTokens.slice(0, 4).map((token) => (
              <button
                type="button"
                key={`quick-${token.address}`}
                onClick={() => onSelect(token)}
                className="flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-[20px] bg-[color:var(--m-surface-2)] px-2 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--m-background)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]"
              >
                <TokenImageIcon symbol={token.symbol} color={tokenColor(token.symbol)} logoURI={token.logoURI} size="lg" chainName={chainNameOf(token)} />
                <span className="font-mono text-[13px] font-semibold text-[color:var(--m-text-primary)]">{token.symbol}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-[color:var(--m-border)]">
          <div className="flex items-center gap-2 px-6 pb-2 pt-5 text-[14px] font-medium text-[color:var(--m-text-secondary)] sm:px-8">
            <span aria-hidden="true">◉</span>
            Available tokens
            <span className="ml-auto font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">{filtered.length}</span>
          </div>

          <div className="overflow-y-auto px-3 pb-4 sm:px-5">
            {filtered.map((token) => {
              // Cross-chain picks re-home the card and reset the other side to
              // that chain's hub (SwapCard.pick), so the pair this row really
              // offers is token↔hub — not token↔whatever is loaded right now.
              // Selected/Flip describe the CURRENT pair, which a row on another
              // chain is not part of.
              const crossChain = token.chainId !== payChainId;
              const isCurrent = !crossChain && token.symbol === currentSymbol;
              const isFlip = !crossChain && token.symbol === otherSymbol;
              const against = crossChain ? hub.symbol : otherSymbol;
              const hops = side === "pay"
                ? hopsBetween(token.symbol, against, hub.symbol)
                : hopsBetween(against, token.symbol, hub.symbol);
              return (
                <button
                  type="button"
                  key={token.address}
                  onClick={() => onSelect(token)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[18px] px-3 py-3.5 text-left transition-colors hover:bg-[color:var(--m-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--m-primary)] sm:px-4",
                    isCurrent && "bg-[color:var(--m-surface-2)]"
                  )}
                >
                  <TokenImageIcon symbol={token.symbol} color={tokenColor(token.symbol)} logoURI={token.logoURI} size="lg" chainName={chainNameOf(token)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-[color:var(--m-text-primary)]">{token.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                      {token.symbol} · {shortAddress(token.address)}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                    <span className="block text-[12px] font-semibold text-[color:var(--m-text-secondary)]">
                      {isCurrent ? "Selected" : isFlip ? "Flip sides" : `${hops} ${hops === 1 ? "hop" : "hops"}`}
                    </span>
                    <span className="mt-0.5 block">via Pool.sol</span>
                  </span>
                </button>
              );
            })}

            {listLoading && filtered.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-[15px] font-medium text-[color:var(--m-text-primary)]">Loading tokens…</p>
              </div>
            )}

            {!listLoading && filtered.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-[15px] font-medium text-[color:var(--m-text-primary)]">No token found</p>
                <p className="mt-1 text-[12px] text-[color:var(--m-text-secondary-2)]">Try a symbol, name, or contract address.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
