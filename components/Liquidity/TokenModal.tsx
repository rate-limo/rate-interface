"use client";

/**
 * Token picker for the pair step.
 *
 * ## It used to show five invented tokens
 *
 * `LIQ_UNIVERSE` was `["ETH", "WBTC", "USDC", "USDT", "MON"]` with a hardcoded
 * balance map beside it — 0.90 ETH, 540 USDC, 1,200 MON. None of it came from a
 * deployment. MON is the giveaway: Monad was removed from `SUPPORTED_CHAINS`
 * because its matching engine returns `0x`, so the picker was offering a pool on
 * a chain the app does not serve, while the tokens actually deployed on RISE and
 * Arc were not in the list at all.
 *
 * Both halves were wrong in the same way and only one of them looks harmless.
 * A fabricated LIST offers markets that cannot exist; a fabricated BALANCE is a
 * statement about the user's money that happens to be false, rendered in the
 * same type and the same place as a real one. The deposit panel's source list
 * makes the identical argument in `lib/transfer/sourceBalances.ts`.
 *
 * ## Two sources, because they answer different questions
 *
 * - **The list** is `useLiveSwapTokens` — the same `/api/gateway/swap/tokens`
 *   read the swap picker trusts, sharing its query key so opening this modal on
 *   a chain the card already loaded is a cache hit. It does not need a wallet,
 *   which matters: browsing pools before connecting is normal, and a picker that
 *   empties itself when disconnected reads as a broken page.
 * - **The balances** are `tokenListWithBalance` off the market context, already
 *   fetched for the shell. Keyed by ADDRESS, never by symbol — this venue lets
 *   anyone mint a coin called USDC, and a symbol join is exactly how a
 *   counterfeit inherits the real token's balance.
 *
 * ## Missing is not zero
 *
 * A disconnected wallet has no balance to show, so the column is BLANK rather
 * than `0`. "You hold none of this" and "we have not asked" are different
 * claims, and the old map made the second look like the first for every token
 * it had never heard of.
 *
 * ## Symbols, and the one thing this picker cannot fix
 *
 * `onSelect` emits a SYMBOL because the whole liquidity flow is symbol-keyed —
 * `resolveRate`, `ConfirmFlow` and `CLPriceChart` all match on it. So two
 * deployments sharing a symbol cannot be told apart downstream, and this list
 * deduplicates rather than rendering two identical-looking rows that collapse to
 * the same state on click. Address-keying that flow is a real change and a
 * separate one; until then the dedupe keeps the picker honest about what a click
 * can actually select.
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { liqToken } from "@/lib/liquidity/mock";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { tokenLogoURI } from "@/lib/tokens/logo";

export interface TokenModalProps {
  open: boolean;
  which: "base" | "quote";
  /** the symbol picked for the opposite side — disabled here */
  disabledSym: string;
  /** The network these tokens live on, so each mark carries its chip like every
   *  other token surface. Required for the reason `TokenSelect` gives. */
  chainName: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}

interface Row {
  symbol: string;
  name: string;
  logoURI?: string;
  /** Undefined means "not read", which renders blank. Never defaulted to 0. */
  balance?: number;
}

/** Held first, largest first, then alphabetical so the long tail is scannable. */
function byHolding(a: Row, b: Row): number {
  const held = (r: Row) => (r.balance !== undefined && r.balance > 0 ? 0 : 1);
  if (held(a) !== held(b)) return held(a) - held(b);
  if (held(a) === 0) {
    const diff = (b.balance ?? 0) - (a.balance ?? 0);
    if (diff !== 0) return diff;
  }
  return a.symbol.localeCompare(b.symbol);
}

/**
 * Balances are small and large in the same list, so a fixed decimal count prints
 * either noise or `0` for a real holding. Four significant-ish digits, grouped.
 */
function formatBalance(value: number): string {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  const decimals = value < 1 ? 4 : value < 1000 ? 2 : 0;
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function TokenModal({ open, which, disabledSym, chainName, onSelect, onClose }: TokenModalProps) {
  const [query, setQuery] = useState("");
  const { data: listed, isLoading } = useLiveSwapTokens(chainName, open);
  // Optional, not required: this modal is cheap to mount and should not be able
  // to take down a page over a provider it only wants a nicety from.
  const market = useOptionalMarketPageContext();
  const balances = market?.tokenListWithBalance;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reopening with a stale filter looks like a list that lost its tokens.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const byAddress = new Map<string, number>();
    for (const token of balances ?? []) {
      if (typeof token.id === "string") byAddress.set(token.id.toLowerCase(), token.balance);
    }

    const bySymbol = new Map<string, Row>();
    for (const token of listed ?? []) {
      const balance = byAddress.get(token.address.toLowerCase());
      const row: Row = {
        symbol: token.symbol,
        name: token.name,
        // The one place that decides whether a logoURI is real — an empty
        // string and the predecessor list's placeholder both read as absent.
        logoURI: tokenLogoURI(token.logoURI),
        balance,
      };
      const existing = bySymbol.get(token.symbol);
      // On a symbol collision keep the one the wallet actually holds — it is the
      // one a user picking that symbol means. See the header on why this list
      // has to collapse them at all.
      if (!existing || (row.balance ?? 0) > (existing.balance ?? 0)) bySymbol.set(token.symbol, row);
    }

    const needle = query.trim().toLowerCase();
    return [...bySymbol.values()]
      .filter(
        (r) =>
          needle === "" ||
          r.symbol.toLowerCase().includes(needle) ||
          r.name.toLowerCase().includes(needle),
      )
      .sort(byHolding);
  }, [listed, balances, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(10,20,32,.4)] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[340px] max-w-full overflow-hidden rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] shadow-lg">
        <div className="flex items-center justify-between border-b border-[var(--m-border)] px-4 py-3.5 text-sm font-semibold">
          <span>Select {which} token</span>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer text-base text-[var(--m-text-secondary-2)]">
            ✕
          </button>
        </div>

        <div className="border-b border-[var(--m-border)] px-3 py-2.5">
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or symbol"
            aria-label="Search tokens"
            className="w-full rounded-lg border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3 py-2 text-sm outline-none placeholder:text-[var(--m-text-secondary-2)] focus:border-[var(--m-primary)]"
          />
        </div>

        <div className="max-h-[300px] overflow-auto p-1.5">
          {isLoading && rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-[var(--m-text-secondary-2)]">
              Loading {chainName} tokens…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-[var(--m-text-secondary-2)]">
              {query.trim()
                ? `No token on ${chainName} matches “${query.trim()}”.`
                : `No tokens found on ${chainName}.`}
            </p>
          ) : (
            rows.map((row) => {
              const disabled = row.symbol === disabledSym;
              return (
                <button
                  key={row.symbol}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onSelect(row.symbol)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[11px] px-3 py-3 text-left",
                    disabled ? "cursor-not-allowed opacity-40" : "hover:bg-[var(--m-surface-2)]",
                  )}
                >
                  <TokenImageIcon
                    symbol={row.symbol}
                    logoURI={row.logoURI}
                    color={liqToken(row.symbol).color}
                    chainName={chainName}
                    size="md"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <b className="text-sm font-semibold">{row.symbol}</b>
                    <span className="truncate text-[11px] text-[var(--m-text-secondary-2)]">{row.name}</span>
                  </span>
                  <span className="ml-auto pl-2 font-mono text-xs tabular-nums text-[var(--m-text-secondary)]">
                    {/* Blank, not "0", when nothing has been read — see the header. */}
                    {row.balance === undefined ? "" : formatBalance(row.balance)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
