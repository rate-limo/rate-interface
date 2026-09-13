"use client";

import { useEffect, useState } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { CLPriceChart } from "@/components/Liquidity/CLPriceChart";
import type { ChartPeriod } from "@/lib/liquidity/types";
import { liqToken } from "@/lib/liquidity/mock";
import { parseAmount } from "@/lib/launch/mock";
import type { LaunchLiquidityDraft, TokenDraft, QuoteOption } from "@/lib/launch/types";
import { cn } from "@/lib/utils";
import { Callout, Field, GhostButton, Panel, PrimaryButton } from "./parts";

const LOCKS: LaunchLiquidityDraft["lockDuration"][] = ["30 days", "90 days", "180 days", "1 year"];

export function LaunchLiquidityStep({
  token,
  quote,
  initial,
  onBack,
  onDraftChange,
  onContinue,
}: {
  token: TokenDraft;
  quote: QuoteOption;
  initial: LaunchLiquidityDraft | null;
  onBack: () => void;
  onDraftChange?: (draft: LaunchLiquidityDraft) => void;
  onContinue: (draft: LaunchLiquidityDraft) => void;
}) {
  const symbol = token.symbol.trim().toUpperCase() || "TOKEN";
  const rate = quote.listingPrice || 1;
  const totalSupply = parseAmount(token.totalSupply);
  const quoteReference = Math.max(totalSupply * rate, 0.00000001);
  const [low, setLow] = useState(initial?.low ?? rate);
  const [high, setHigh] = useState(initial?.high ?? rate * 1.35);
  const [fullRange, setFullRange] = useState(initial?.fullRange ?? false);
  const [zoom, setZoom] = useState(0.35);
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const defaultBaseAmount = totalSupply > 0 ? totalSupply * 0.9 : 0;
  const defaultQuoteAmount = 0;
  const [baseAmount, setBaseAmount] = useState(initial?.baseAmount ?? formatAmount(defaultBaseAmount));
  const [quoteAmount, setQuoteAmount] = useState(initial?.quoteAmount ?? formatAmount(defaultQuoteAmount));
  const [basePercent, setBasePercent] = useState(() => initial?.baseAmount ? (parseAmount(initial.baseAmount) / Math.max(totalSupply, 1)) * 100 : 90);
  const [quotePercent, setQuotePercent] = useState(() => initial?.quoteAmount ? (parseAmount(initial.quoteAmount) / quoteReference) * 100 : 0);
  const [locked, setLocked] = useState(initial?.locked ?? true);
  const [lockDuration, setLockDuration] = useState<LaunchLiquidityDraft["lockDuration"]>(initial?.lockDuration ?? "90 days");
  const ready = Number(baseAmount.replace(/,/g, "")) > 0 || Number(quoteAmount.replace(/,/g, "")) > 0;
  useEffect(() => {
    onDraftChange?.({ baseAmount, quoteAmount, low, high, fullRange, locked, lockDuration });
  }, [baseAmount, quoteAmount, low, high, fullRange, locked, lockDuration, onDraftChange]);
  const updateBasePercent = (next: number) => {
    const percent = clamp(next, 0, 100);
    setBasePercent(percent);
    setBaseAmount(formatAmount(totalSupply * percent / 100));
  };
  const updateQuotePercent = (next: number) => {
    const percent = clamp(next, 0, 100);
    setQuotePercent(percent);
    setQuoteAmount(formatAmount(quoteReference * percent / 100));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
      <CLPriceChart
        baseSym={symbol}
        quoteSym={quote.symbol}
        baseLogoURI={token.logoPreview ?? undefined}
        rate={rate}
        low={low}
        high={high}
        isFullRange={fullRange}
        zoom={zoom}
        period={period}
        initialPreset="ask"
        isLaunch
        onRangeChange={(nextLow, nextHigh, full) => {
          setFullRange(full);
          if (!full) {
            setLow(nextLow);
            setHigh(nextHigh);
          }
        }}
        onZoom={setZoom}
        onPeriod={setPeriod}
      />

      <Panel title="Initial liquidity" className="flex flex-col">
        <p className="mb-3 text-[12px] leading-5 text-[var(--m-text-secondary)]">
          Seed the first concentrated range for {symbol}/{quote.symbol}. The range starts around the listing rate.
        </p>
        <div className="mb-2 flex items-center gap-2.5 rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3 py-2">
          <TokenImageIcon symbol={symbol} color={liqToken(symbol).color} logoURI={token.logoPreview ?? undefined} size="md" />
          <span className="text-[13px] font-medium text-[var(--m-text-primary)]">{symbol}</span>
          <span className="ml-auto text-[11px] text-[var(--m-text-secondary)]">Base token</span>
        </div>
        <Field
          ariaLabel={`${symbol} amount`}
          value={baseAmount}
          onChange={(value) => {
            setBaseAmount(value);
            setBasePercent(clamp((parseAmount(value) / Math.max(totalSupply, 1)) * 100, 0, 100));
          }}
          inputMode="decimal"
          placeholder="0.00"
          suffix={symbol}
          big
          leading={<TokenImageIcon symbol={symbol} color={liqToken(symbol).color} logoURI={token.logoPreview ?? undefined} size="sm" />}
        />
        <AmountSlider label={`${symbol} allocation`} value={basePercent} detail={`${basePercent.toFixed(2)}% of total supply`} onChange={updateBasePercent} />
        <div className="mt-2">
          <Field
            ariaLabel={`${quote.symbol} amount`}
            value={quoteAmount}
            onChange={(value) => {
              setQuoteAmount(value);
              setQuotePercent(clamp((parseAmount(value) / quoteReference) * 100, 0, 100));
            }}
            inputMode="decimal"
            placeholder="0.00"
            suffix={quote.symbol}
            big
            leading={<TokenImageIcon symbol={quote.symbol} color={liqToken(quote.symbol).color} size="sm" />}
          />
        </div>
        <AmountSlider label={`${quote.symbol} allocation`} value={quotePercent} detail={`${quotePercent.toFixed(2)}% of full-supply quote value`} onChange={updateQuotePercent} />

        <div className="mt-4 rounded-[12px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-3.5">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium text-[var(--m-text-primary)]">Lock initial liquidity</span>
              <span className="mt-1 block text-[11px] leading-4 text-[var(--m-text-secondary)]">Prevent this launch position from being withdrawn during the lock.</span>
            </span>
            <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} className="mt-1 size-4 accent-[var(--m-primary)]" />
          </label>
          {locked && (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {LOCKS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setLockDuration(duration)}
                  className={cn(
                    "rounded-[8px] border px-2 py-2 font-mono text-[10.5px] transition-colors",
                    lockDuration === duration
                      ? "border-[var(--m-primary)] bg-[var(--m-surface-selected)] text-[var(--m-primary-fg)]"
                      : "border-[var(--m-border)] text-[var(--m-text-secondary)] hover:text-[var(--m-text-primary)]",
                  )}
                >
                  {duration}
                </button>
              ))}
            </div>
          )}
        </div>

        <Callout>Initial liquidity supports the orderbook and becomes the backing liquidity used for graduation.</Callout>
        <div className="mt-auto pt-2">
          <PrimaryButton
            dataTestId="launch-step-liquidity"
            disabled={!ready}
            onClick={() => onContinue({ baseAmount, quoteAmount, low, high, fullRange, locked, lockDuration })}
          >
            Review launch
          </PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </Panel>
    </div>
  );
}

function AmountSlider({ label, value, detail, onChange }: { label: string; value: number; detail: string; onChange: (value: number) => void }) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 flex items-center justify-between gap-3 text-[10.5px] text-[var(--m-text-secondary)]">
        <span>{label}</span>
        <span className="font-mono text-[var(--m-text-primary)]">{detail}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer accent-[var(--m-primary)]"
      />
    </label>
  );
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: 8, useGrouping: false });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
