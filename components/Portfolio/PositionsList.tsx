"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DUST_USD,
  hiddenDustCount,
  positionFlags,
  unrealizedPct,
  visiblePositions,
  type PositionView,
} from "@/lib/portfolio/positions";
import type { AccountPositions, SpotPosition } from "@/lib/portfolio/types";
import { TokenAvatar } from "./parts";

/**
 * The Positions tab — a row per token the fill ledger can account for: what the
 * wallet holds, what it cost, and what it is worth now.
 *
 * ## A list, not the table every other tab renders
 *
 * Orders, LPs, trades and history are all MARKET-shaped — base/quote, a side, a
 * rate — so they use `MarketCell` and the desktop-table / mobile-`OCard` split.
 * A position is TOKEN-shaped: it has one asset and no pair, and rendering it
 * through a market cell would name a quote token that has nothing to do with the
 * cost basis. So this is the design's own row anatomy — avatar, symbol over
 * quantity, value over change, right-aligned — at every width, which also means
 * there is no second markup tree to keep in step.
 *
 * ## Every number here comes from the endpoint
 *
 * Nothing is derived in the browser except formatting and `unrealizedPct`, which
 * `lib/portfolio/positions.ts` owns and withholds rather than computes when the
 * basis it would divide by is missing. In particular the footer prints
 * `totals` as the gateway summed them — recomputing them client-side would put a
 * second, drift-prone answer next to the first, which is the failure that made
 * `spotTokens.marketCap` a generated column.
 */
export function PositionsList({
  data,
  isLoading,
}: {
  data: AccountPositions;
  isLoading: boolean;
}) {
  const [view, setView] = useState<PositionView>("open");
  const [showDust, setShowDust] = useState(false);

  const rows = visiblePositions(data.positions, view, showDust);
  const hiddenDust = hiddenDustCount(data.positions, view);
  const closedCount = data.positions.filter((p) => positionFlags(p).closed).length;
  const openCount = data.positions.length - closedCount;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--m-border)] px-3.5 py-2.5">
        <span className="font-mono text-[12px] text-[color:var(--m-text-secondary-2)]">
          {isLoading ? "…" : `${rows.length} of ${view === "closed" ? closedCount : openCount}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Hidden rather than disabled in the Closed view: no closed row is
              ever dust, so the control has nothing to act on there, and a
              checked-but-disabled box reads as "showing dust, cannot stop". */}
          {view === "open" && (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[color:var(--m-text-secondary)]">
              <input
                type="checkbox"
                checked={showDust}
                onChange={() => setShowDust((on) => !on)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--m-primary)]"
              />
              Show dust
              {hiddenDust > 0 && !showDust && (
                <span className="font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                  {hiddenDust}
                </span>
              )}
            </label>
          )}
          <div className="flex gap-0.5 rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-0.5">
            {(["open", "closed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "rounded-[7px] px-3 py-1 text-[12.5px] capitalize transition-colors",
                  view === v
                    ? "bg-[color:var(--m-surface)] font-medium text-[color:var(--m-text-primary)] shadow-sm"
                    : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[color:var(--m-border)] px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        <span>Token</span>
        <span>{view === "closed" ? "Realised" : "Position"}</span>
      </div>

      {isLoading ? (
        <EmptyState>Loading positions…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{emptyMessage(view, data.positions.length, hiddenDust, closedCount)}</EmptyState>
      ) : (
        <div className="flex flex-col">
          {rows.map((position) => (
            <PositionRow key={position.token} position={position} view={view} />
          ))}
        </div>
      )}

      <Footer data={data} />
    </div>
  );
}

function emptyMessage(
  view: PositionView,
  total: number,
  hiddenDust: number,
  closedCount: number,
): string {
  if (total === 0) {
    return "No positions yet. A position appears once the fill ledger has seen this wallet trade the token — a balance that arrived by transfer or airdrop is in Assets, not here.";
  }
  if (view === "closed") return "Nothing closed yet. Positions stay here once sold to zero.";
  if (hiddenDust > 0) {
    return `Every open position is below $${DUST_USD}. Tick “Show dust” to see ${hiddenDust === 1 ? "it" : `all ${hiddenDust}`}.`;
  }
  return `No open positions${closedCount > 0 ? ` — ${closedCount} closed` : ""}.`;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 py-8 text-center text-[13px] text-[color:var(--m-text-secondary)]">
      {children}
    </p>
  );
}

/**
 * One position.
 *
 * The four states the design calls out are independent, so a row wears every
 * marker that applies rather than being assigned one label. A closed position
 * with `untrackedSold > 0` is the case that makes this matter: its realised PnL
 * is the number most likely to be incomplete, and it must still say so.
 */
function PositionRow({ position, view }: { position: SpotPosition; view: PositionView }) {
  const flags = positionFlags(position);
  const pct = unrealizedPct(position);

  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-[color:var(--m-border)] px-3.5 py-3 last:border-b-0 hover:bg-[color:var(--m-surface-2)]">
      <TokenAvatar symbol={position.symbol} logoURI={position.logoURI ?? undefined} size="md" />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-medium">
          <span className="min-w-0 truncate" title={position.token}>
            {position.symbol}
          </span>
          {flags.partialBasis && (
            <Tag tone="warn" title="More was sold than the ledger saw bought, so part of this token arrived by transfer, airdrop or LP withdrawal at a cost nobody can know.">
              partial basis
            </Tag>
          )}
          {flags.unpriced && (
            <Tag tone="mute" title="No live price for this token, so its value is unknown — not zero. It is left out of the totals below.">
              unpriced
            </Tag>
          )}
          {flags.closed && (
            <Tag tone="mute" title="Sold to zero. The realised PnL survives the position, which is why the row does.">
              closed
            </Tag>
          )}
          {flags.dust && (
            <Tag tone="mute" title={`Worth less than $${DUST_USD}.`}>
              dust
            </Tag>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[12px] text-[color:var(--m-text-secondary-2)]">
          {subLine(position, flags)}
        </div>
      </div>

      <div className="text-right">
        {view === "closed" ? (
          <div className={cn("font-mono text-[14.5px] tabular-nums", toneClass(position.realizedPnlUSD))}>
            {signedUsd(position.realizedPnlUSD)}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "font-mono text-[14.5px] tabular-nums",
                position.valueUSD === null && "text-[color:var(--m-text-secondary-2)]",
              )}
            >
              {/* Null renders a dash, never $0.00: the difference between "we
                  have no price" and "it is worthless" is the whole point of
                  the unpriced state. */}
              {position.valueUSD === null ? "—" : usd(position.valueUSD)}
            </div>
            <div
              className={cn(
                "mt-0.5 font-mono text-[12px] tabular-nums",
                pct === null ? "text-[color:var(--m-text-secondary-2)]" : toneClass(pct),
              )}
            >
              {pct === null ? "—" : `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%`}
              {pct !== null && position.unrealizedPnlUSD !== null && (
                <> · {signedUsd(position.unrealizedPnlUSD)}</>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The quantity line.
 *
 * `avgEntryUSD` is suppressed on a closed row. The endpoint hands back a hard
 * `0` there (`amount > 0 ? costUSD / amount : 0`), and printing `avg $0.00`
 * would assert a basis of zero — precisely the lie the whole partial-basis
 * treatment exists to avoid. A partial-basis row names the untracked amount
 * instead of an average that only covers part of the holding.
 *
 * An open position can also reach a zero basis without any untracked inflow: a
 * fill whose priced leg valued at nothing accumulates cost 0 against a real
 * amount. That says "no basis was recorded", which is a different sentence from
 * "the average entry was zero" — so it gets one.
 */
function subLine(position: SpotPosition, flags: ReturnType<typeof positionFlags>): string {
  if (flags.closed) {
    const traded = `${position.tradeCount} ${position.tradeCount === 1 ? "trade" : "trades"}`;
    return `closed · ${traded}`;
  }
  const held = `${amount(position.amount)} ${position.symbol}`;
  if (flags.partialBasis) return `${held} · ${amount(position.untrackedSold)} arrived untracked`;
  if (!(position.avgEntryUSD > 0)) return `${held} · no cost basis recorded`;
  return `${held} · avg ${usdPrice(position.avgEntryUSD)}`;
}

function Footer({ data }: { data: AccountPositions }) {
  const { totals } = data;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3 text-[12.5px] text-[color:var(--m-text-secondary)]">
      <Stat label="Value" value={usd(totals.valueUSD)} />
      <Stat
        label="Unrealised"
        value={signedUsd(totals.unrealizedPnlUSD)}
        tone={toneClass(totals.unrealizedPnlUSD)}
      />
      {/* The one total that covers every row — realised PnL is banked and needs
          no live price, so the "priced rows only" caveat beside the two above
          does not apply to it. Labelled so a reader does not carry the
          qualifier across all three. */}
      <Stat
        label="Realised · all rows"
        value={signedUsd(totals.realizedPnlUSD)}
        tone={toneClass(totals.realizedPnlUSD)}
      />
      {totals.unpricedCount > 0 && (
        <Stat
          label="Left out · unpriced"
          value={String(totals.unpricedCount)}
          title="Value and Unrealised cover the priced rows only. These have no live price, so they are counted rather than summed."
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: string;
  title?: string;
}) {
  return (
    <span title={title}>
      {label}{" "}
      <b className={cn("font-mono font-medium tabular-nums text-[color:var(--m-text-primary)]", tone)}>
        {value}
      </b>
    </span>
  );
}

function Tag({
  tone,
  title,
  children,
}: {
  tone: "warn" | "mute";
  title: string;
  children: ReactNode;
}) {
  const color = tone === "warn" ? "var(--m-warning)" : "var(--m-text-secondary-2)";
  return (
    <span
      title={title}
      className="inline-block rounded-[5px] border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {children}
    </span>
  );
}

function toneClass(value: number): string {
  if (value > 0) return "text-[color:var(--m-success)]";
  if (value < 0) return "text-[color:var(--m-error)]";
  return "text-[color:var(--m-text-secondary-2)]";
}

function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${usd(Math.abs(value))}`;
}

/**
 * A per-unit price, which on this venue spans nine orders of magnitude. Two
 * decimals would print `$0.00` for a real memecoin entry, so sub-cent prices
 * keep significant digits instead of a fixed scale.
 */
function usdPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  if (Math.abs(value) >= 0.01) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${value.toLocaleString("en-US", { maximumSignificantDigits: 3 })}`;
}

/** Token quantities, compacted above a million so a supply-scale holding still fits the line. */
function amount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
