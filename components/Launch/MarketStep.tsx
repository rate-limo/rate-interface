"use client";

/**
 * Step 2 — which book the coin lists against, and the dev buy.
 *
 * The starting price is NOT a choice: the contract sets it so the whole supply
 * is worth the quote option's `startingMarketCap`. The one market decision the
 * creator makes is how much to buy at that price — required, between the
 * option's `minDevBuy` and 10% of supply. The five ladder steps are shown as
 * facts: the contract places them, from `startingMarketCap` to
 * `graduationMarketCap`.
 */

import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { cn } from "@/lib/utils";
import { liqToken } from "@/lib/liquidity/mock";
import { fmtAmount, fmtCompact, fmtFee, fmtRate } from "@/lib/launch/mock";
import { clearsListingFloor, devBuyRefusal, devBuyView } from "@/lib/launch/devBuy";
import { LAUNCH_SUPPLY_TEXT, type QuoteOption, type TokenDraft } from "@/lib/launch/types";
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
  devBuy,
  onDevBuyChange,
  onChange,
  onContinue,
  onBack,
  launchReady,
}: {
  token: TokenDraft;
  quote: string;
  options: readonly QuoteOption[];
  devBuy: string;
  onDevBuyChange: (amount: string) => void;
  onChange: (quote: string) => void;
  onContinue: () => void;
  onBack: () => void;
  /** False while this network still runs the previous launch contract. */
  launchReady?: boolean;
}) {
  const symbol = token.symbol.trim().toUpperCase() || "TOKEN";
  // Supply is fixed at 1B, so a quote whose start market cap can't price 1B
  // coins above the contract's floor (ETH, a stock token) can't be launched
  // against here at all: those pairs go through an auction or a pool launch.
  const usable = options.filter((o) => clearsListingFloor(o));
  const chosen = usable.find((o) => o.address === quote) ?? null;
  const view = chosen ? devBuyView(chosen, LAUNCH_SUPPLY_TEXT, devBuy) : null;
  const typed = devBuy.trim() !== "";

  return (
    <Panel className="mx-auto max-w-[1120px]" title="Pick the market and your buy">
      <Lbl>List against</Lbl>
      {launchReady === false ? (
        <Callout tone="warn">
          <b className="font-semibold">Launching on this network returns shortly.</b> It&apos;s
          moving to the new launch flow. Pick another network to launch now.
        </Callout>
      ) : options.length === 0 ? (
        <Callout tone="warn">
          <b className="font-semibold">No quote tokens are enabled right now.</b> The generator only
          lists against quotes an operator has approved, so launching isn&apos;t possible until one
          is.
        </Callout>
      ) : usable.length === 0 ? (
        <Callout tone="warn">
          <b className="font-semibold">None of the enabled quote tokens can price a 1B-supply launch.</b>{" "}
          Their starting price would round to zero. To list against one of them, run an auction or
          launch a pool instead.
        </Callout>
      ) : (
        <div className="grid gap-1.5 md:grid-cols-2">
          {usable.map((o) => {
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

      {chosen && view && (
        <>
          <Lbl>Starts at</Lbl>
          <Kv>
            <KvRow k="Market cap">
              <KvVal>
                {fmtAmount(view.startingMarketCap)} {chosen.symbol}
              </KvVal>
            </KvRow>
            <KvRow k="Price">
              <KvVal>
                {view.price > 0 ? (
                  <>
                    1 {symbol} = {fmtRate(view.price)} {chosen.symbol}
                  </>
                ) : (
                  "—"
                )}
              </KvVal>
            </KvRow>
            <KvRow k="Taker fee">
              <KvVal tone="gold">{fmtFee(chosen.startingTakerFee)} · makers free</KvVal>
            </KvRow>
          </Kv>

          <Lbl>Your dev buy</Lbl>
          <Field
            ariaLabel={`Dev buy in ${chosen.symbol}`}
            dataTestId="launch-dev-buy"
            value={devBuy}
            onChange={onDevBuyChange}
            inputMode="decimal"
            placeholder={String(view.min)}
            suffix={chosen.symbol}
            big
            invalid={typed && !view.check.ok}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px]">
            <span className="text-[var(--m-text-secondary)]">
              {view.check.ok || (typed && view.check.reason !== "priceTooLow") ? (
                <>
                  {fmtAmount(view.amount)} {chosen.symbol} buys{" "}
                  <b className="font-mono font-semibold text-[var(--m-text-primary)]">
                    {fmtCompact(view.coins)} {symbol}
                  </b>{" "}
                  ({view.sharePct.toFixed(2)}% of supply) at the starting price
                </>
              ) : (
                <>
                  Minimum {fmtAmount(view.min)} {chosen.symbol}, up to 10% of supply
                </>
              )}
            </span>
            <span className="flex shrink-0 gap-1.5 font-mono">
              <button
                type="button"
                className="rounded-md border border-[var(--m-border)] px-2 py-0.5 text-[var(--m-text-secondary)] hover:border-[var(--m-primary)]"
                onClick={() => onDevBuyChange(String(view.min))}
              >
                min
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--m-border)] px-2 py-0.5 text-[var(--m-text-secondary)] hover:border-[var(--m-primary)]"
                onClick={() => onDevBuyChange(String(view.max))}
              >
                max {fmtAmount(view.max)}
              </button>
            </span>
          </div>
          {typed && !view.check.ok && (
            <p className="mt-1 text-[11.5px] text-[var(--m-error)]">{devBuyRefusal(view.check.reason)}</p>
          )}

          <Lbl>Then 80% sells in five steps</Lbl>
          <Kv>
            {view.ladder.map((step, i) => (
              <KvRow key={i} k={`Step ${i + 1}`}>
                <KvVal>
                  {fmtAmount(step.marketCap)} {chosen.symbol} cap · {step.supplyPct.toFixed(0)}% of supply
                </KvVal>
              </KvRow>
            ))}
          </Kv>
          <Callout>
            The rest of the supply and everything raised wait until all five steps sell. Then
            anyone can graduate the coin: it all goes into the pool, and fee and volatility
            become yours to set.
          </Callout>
        </>
      )}

      <PrimaryButton dataTestId="launch-step-market" onClick={onContinue} disabled={!chosen || !view?.check.ok}>
        Continue to review
      </PrimaryButton>
      <GhostButton onClick={onBack}>Back to token</GhostButton>
    </Panel>
  );
}
