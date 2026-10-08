"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The pool-pricing disclosure, in one place so every surface says the same thing.
 * The risk itself is described in lib/liquidity/poolRisk.ts and on /fees#risks.
 *
 * Copy rules: plain words from the LP's side. "Order book", never the engine's
 * internals; it informs, it never blocks.
 */

export type PoolRiskVariant = "standard" | "thin" | "launch-coin-only" | "graduated";

const WHY =
  "Rate is an order-book DEX, and its pools trade at the book's recent price, averaged over five minutes. " +
  "Orders placed on the book move that price a few percent each, even if they are cancelled later. " +
  "Each order is capped; the total is not. So in a pool with little on one side, someone can push the price " +
  "and then trade against the pool at it: coins bought cheap, or USDC taken. On our contracts this took a few " +
  "minutes and about $2 of gas.";

const HEADLINE: Record<PoolRiskVariant, string> = {
  standard: "Pool prices follow the order book, and others can push them.",
  thin: "This pool has only one side. Others can push its price and trade against it.",
  "launch-coin-only":
    "Your pool has coins but no USDC behind them. Others can push its price down within minutes and buy your coins cheap.",
  graduated: "After graduation, others can push the pool's price and trade against it.",
};

export function PoolRiskNote({
  variant,
  onAddQuote,
  quoteSymbol = "USDC",
  className,
}: {
  variant: PoolRiskVariant;
  /** Launch only: switch the deposit to two-sided. Absent hides the button. */
  onAddQuote?: () => void;
  quoteSymbol?: string;
  className?: string;
}) {
  const strong = variant === "thin" || variant === "launch-coin-only";
  const headline =
    variant === "launch-coin-only"
      ? HEADLINE[variant].replace("USDC", quoteSymbol)
      : HEADLINE[variant];
  return (
    <div
      data-testid="pool-risk-note"
      data-variant={variant}
      role="note"
      className={cn(
        "rounded-[11px] border px-3 py-2.5 text-[12.5px] leading-snug",
        strong
          ? "border-[color-mix(in_srgb,var(--m-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--m-warning)_10%,transparent)]"
          : "border-[var(--m-border)] bg-[var(--m-surface-2)]",
        className,
      )}
    >
      <p className={cn("m-0", strong ? "font-medium text-[var(--m-text-primary)]" : "text-[var(--m-text-secondary)]")}>
        {headline}
      </p>
      {variant === "launch-coin-only" && onAddQuote && (
        <button
          type="button"
          data-testid="pool-risk-add-quote"
          onClick={onAddQuote}
          className="mt-2 rounded-lg border border-[var(--m-border)] bg-[var(--m-surface)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--m-text-primary)] hover:bg-[var(--m-surface-2)]"
        >
          Add {quoteSymbol} too, so there are buyers behind your price
        </button>
      )}
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[12px] text-[var(--m-text-secondary)] underline underline-offset-2">
          Why
        </summary>
        <p className="mb-0 mt-1.5 text-[var(--m-text-secondary)]">
          {WHY}{" "}
          <Link href="/fees#risks" className="underline underline-offset-2">
            More on risks
          </Link>
        </p>
      </details>
    </div>
  );
}
