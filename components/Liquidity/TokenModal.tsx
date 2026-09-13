"use client";

/** Token-picker modal for the pair step. Disables the token already chosen for
 * the other side. Balances are mock (illustrative until wired). */

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { LIQ_UNIVERSE, liqToken } from "@/lib/liquidity/mock";

// Illustrative wallet balances keyed by symbol.
const BAL: Record<string, string> = {
  ETH: "0.90",
  USDC: "540",
  USDT: "0",
  WBTC: "0.05",
  MON: "1,200",
};

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

export function TokenModal({ open, which, disabledSym, chainName, onSelect, onClose }: TokenModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        <div className="max-h-[300px] overflow-auto p-1.5">
          {LIQ_UNIVERSE.map((sym) => {
            const disabled = sym === disabledSym;
            const t = liqToken(sym);
            return (
              <button
                key={sym}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onSelect(sym)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[11px] px-3 py-3 text-left",
                  disabled ? "cursor-not-allowed opacity-40" : "hover:bg-[var(--m-surface-2)]",
                )}
              >
                <TokenImageIcon symbol={sym} color={t.color} chainName={chainName} size="md" />
                <span className="flex flex-col leading-tight">
                  <b className="text-sm font-semibold">{sym}</b>
                  <span className="text-[11px] text-[var(--m-text-secondary-2)]">{t.name}</span>
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-[var(--m-text-secondary)]">
                  {BAL[sym] ?? "0"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
