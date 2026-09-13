"use client";

/**
 * Step 2 — which book the coin lists against.
 *
 * The creator selects the quote market and its initial price. The implied fully
 * diluted market cap updates from price × fixed token supply.
 */

import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { cn } from "@/lib/utils";
import { liqToken } from "@/lib/liquidity/mock";
import {
  fmtAmount,
  fmtCompact,
  fmtFee,
  fmtRate,
  impliedMarketCap,
  parseAmount,
} from "@/lib/launch/mock";
import type { QuoteOption, TokenDraft } from "@/lib/launch/types";
import { Callout, Field, GhostButton, Kv, KvRow, KvVal, Lbl, Panel, PrimaryButton } from "./parts";

function PairTokenImage({ token, quote }: { token: TokenDraft; quote: QuoteOption }) {
  const base = token.symbol.trim().toUpperCase() || "TOKEN";
  return (
    <span
      className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--m-border)] bg-[var(--m-surface-2)]"
      aria-label={`${base}/${quote.symbol}`}
    >
      <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={base}
          color={liqToken(base).color}
          logoURI={token.logoPreview ?? undefined}
          size="md"
          className="h-8 w-8 rounded-none"
        />
      </span>
      <span className="absolute inset-y-0 left-1/2 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={quote.symbol}
          color={liqToken(quote.symbol).color}
          size="md"
          className="h-8 w-8 -translate-x-1/2 rounded-none"
        />
      </span>
    </span>
  );
}

export function MarketStep({
  token,
  quote,
  options,
  listingPrice,
  onPriceChange,
  onChange,
  onContinue,
  onBack,
}: {
  token: TokenDraft;
  quote: string;
  options: readonly QuoteOption[];
  listingPrice: string;
  onPriceChange: (price: string) => void;
  onChange: (quote: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const symbol = token.symbol.trim().toUpperCase() || "TOKEN";
  const supply = parseAmount(token.totalSupply);
  const chosen = options.find((o) => o.address === quote) ?? null;
  const price = Number(listingPrice);
  const cap = chosen && Number.isFinite(price) && price > 0 ? impliedMarketCap(supply, price) : 0;

  return (
    <Panel
      className="mx-auto max-w-[1120px]"
      title="Pick the market"
    >
      <Lbl>List against</Lbl>
      {options.length === 0 ? (
        <Callout tone="warn">
          <b className="font-semibold">No quote tokens are enabled right now.</b> The generator only
          lists against quotes an operator has approved, so launching isn&apos;t possible until one
          is.
        </Callout>
      ) : (
        <div className="grid gap-1.5 md:grid-cols-2">
          {options.map((o) => {
            const on = o.address === quote;
            return (
              <button
                key={o.address}
                type="button"
                onClick={() => onChange(o.address)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
                  on
                    ? "border-[var(--m-primary)] bg-[var(--m-surface-selected)]"
                    : "border-[var(--m-border)] bg-[var(--m-surface-2)] hover:border-[var(--m-primary)]",
                )}
              >
                <PairTokenImage token={token} quote={o} />
                <span className="flex flex-col leading-tight">
                  <b className="text-[15px] font-semibold">
                    {symbol}/{o.symbol}
                  </b>
                  <span className="font-mono text-[10.5px] text-[var(--m-text-secondary-2)]">
                    quote market
                  </span>
                </span>
                {on && (
                  <span className="ml-auto font-mono text-[11px] text-[var(--m-primary-fg)]">
                    selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {chosen && (
        <>
          <Lbl>Initial market price</Lbl>
          <Field
            ariaLabel={`Initial ${symbol} price in ${chosen.symbol}`}
            value={listingPrice}
            onChange={onPriceChange}
            inputMode="decimal"
            placeholder="0.00"
            suffix={`${chosen.symbol} per ${symbol}`}
            big
            invalid={listingPrice !== "" && !(price > 0)}
          />
          <p className="mt-1.5 text-[11px] text-[var(--m-text-secondary)]">
            This becomes the opening rate for the orderbook and the center of the initial liquidity range.
          </p>

          <Lbl>Valuation preview</Lbl>
          <Kv>
            <KvRow k="Listing price">
              <KvVal>
                {price > 0 ? <>1 {symbol} = {fmtRate(price)} {chosen.symbol}</> : "—"}
              </KvVal>
            </KvRow>
            <KvRow k="Implied market cap · FDV">
              <KvVal>
                {cap > 0 ? `${fmtAmount(cap)} ${chosen.symbol}` : "—"}
              </KvVal>
            </KvRow>
            <KvRow k="Listing cost paid in">
              <KvVal>{chosen.listingPaymentSymbol ?? `${symbol} (from the new supply)`}</KvVal>
            </KvRow>
            <KvRow k="Starting taker fee">
              <KvVal tone="gold">{fmtFee(chosen.startingTakerFee)}</KvVal>
            </KvRow>
          </Kv>

          <Callout>The market can move immediately after launch. The displayed market cap is an implied valuation, not guaranteed liquidity.</Callout>

          {chosen.graduationTargetQuote > 0 && (
            <Callout tone="gold">
              <b className="font-semibold">Graduation criteria.</b> Progress is based on cumulative
              purchases in the quote token. This market graduates after buyers purchase{" "}
              <b className="font-mono">
                {fmtCompact(chosen.graduationTargetQuote)} {chosen.symbol}
              </b>
              . Iter administrators configure this target in the backend.
            </Callout>
          )}
        </>
      )}

      <PrimaryButton dataTestId="launch-step-market" onClick={onContinue} disabled={!chosen || !(price > 0)}>
        Continue to volatility
      </PrimaryButton>
      <GhostButton onClick={onBack}>Back to token</GhostButton>
    </Panel>
  );
}
