"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { money } from "@/components/Portfolio/parts";
import { seriesDirection, sparkGeometry } from "@/lib/profile/sparkline";
import {
  TIMEFRAME_DAYS,
  useBalanceHistory,
  type Timeframe,
} from "@/hooks/useBalanceHistory";

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M"];
const VIEW_W = 300;
const VIEW_H = 40;

/**
 * Portfolio value, with 1D / 1W / 1M.
 *
 * ## The headline number and the chart come from different places, on purpose
 *
 * `valueUsd` is computed NOW from `/positions` — live prices against current
 * holdings, the same figure the tabs below are consistent with. The chart is
 * `accountBalanceDayBuckets`, a series of past readings the wallet itself
 * recorded. Showing the recorded latest as the headline would make the number
 * go stale the moment a price moved, and would disagree with the positions
 * table on the same screen.
 *
 * So: live value on top, recorded history underneath, and the change is
 * measured within the history because that is the only thing with a past.
 *
 * ## Most wallets have no history, and that is not an error
 *
 * Recording became an explicit action when the write was signed — a wallet
 * prompt cannot hang off a background balance read. A wallet that has never
 * recorded gets the value with no chart and a line saying so, rather than an
 * empty axis pretending to be one. The timeframe buttons stay visible but
 * inert, because hiding them would make the feature look absent rather than
 * unpopulated.
 */
export function ValueCard({
  address,
  networkName,
  valueUsd,
  unpricedCount,
  failedChains,
  isLoading,
  realizedPnlUsd,
  unrealizedPnlUsd,
  volumeUsd,
  statsLoading,
}: {
  address: string;
  networkName: string;
  valueUsd: number;
  unpricedCount: number;
  /**
   * Chains whose read failed. NON-EMPTY means every figure on this card is a
   * FLOOR, not a total — see lib/portfolio/crossChain for why a dead chain
   * contributes absence rather than zero.
   */
  failedChains: string[];
  isLoading: boolean;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  volumeUsd: number;
  statsLoading: boolean;
}) {
  // "Arc Testnet" -> "Arc". The stat row is tight and the word adds nothing.
  const chainLabel = networkName.replace(" Testnet", "");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const history = useBalanceHistory(networkName, address, timeframe);

  const today = Math.floor(Date.now() / 86_400_000);
  const windowStart = today - (TIMEFRAME_DAYS[timeframe] - 1);
  const geometry = sparkGeometry(history.points, windowStart, today, VIEW_W, VIEW_H);
  const direction = seriesDirection(history.points);

  const stroke =
    direction === "up"
      ? "var(--m-success-fg)"
      : direction === "down"
        ? "var(--m-error-fg)"
        : "var(--m-text-secondary)";

  return (
    <section className="rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[18px] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[36px] font-extrabold leading-none tracking-[-0.035em] tabular-nums">
            {isLoading ? "…" : money(valueUsd)}
          </div>

          {history.change ? (
            <div
              className={cn(
                "mt-2 flex flex-wrap items-center gap-2 text-[15px] font-bold tabular-nums",
                history.change.usd > 0
                  ? "text-[color:var(--m-success-fg)]"
                  : history.change.usd < 0
                    ? "text-[color:var(--m-error-fg)]"
                    : "text-[color:var(--m-text-secondary)]",
              )}
            >
              {history.change.usd > 0 ? "+" : ""}
              {money(history.change.usd)} ({history.change.percentage.toFixed(2)}%)
              {/* Named, not implied. The series is sparse, so the change is
                  measured from the last reading BEFORE the window — saying
                  "1D" over a gap of nine days would be a lie the data cannot
                  support. */}
              <span className="font-mono text-[10.5px] font-normal text-[color:var(--m-text-secondary)]">
                {fromLabel(history.change.fromIndex)}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[color:var(--m-text-secondary)]">
              {history.isLoading
                ? "…"
                : history.failed
                  ? "Couldn't load history"
                  : "No recorded history yet"}
            </p>
          )}

          {unpricedCount > 0 && (
            <p className="mt-1.5 text-[11.5px] text-[color:var(--m-text-secondary)]">
              {unpricedCount} unpriced {unpricedCount === 1 ? "token" : "tokens"} excluded
            </p>
          )}

          {/* Two different kinds of missing, said differently on purpose.
              Unpriced above means "we have the position, not its price"; this
              means "we could not ask that chain at all", which makes the number
              a floor rather than a total. Collapsing them would let a dead
              gateway render as a confident smaller portfolio. */}
          {failedChains.length > 0 && (
            <p className="mt-1.5 text-[11.5px] text-[color:var(--m-logo)]">
              Couldn&apos;t reach {failedChains.join(", ")} — this is at least, not exactly
            </p>
          )}
        </div>

        <div
          className="flex shrink-0 gap-0.5 rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[3px]"
          role="group"
          aria-label="Timeframe"
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              aria-pressed={timeframe === tf}
              className={cn(
                "rounded-[8px] px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                timeframe === tf
                  ? "bg-[color:var(--m-surface-selected)] font-medium text-[color:var(--m-on-surface-selected)]"
                  : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* The CHART needs two points; the change above does not — the server
          computes it against the last reading before the window, so a wallet
          with a single recorded day still has a real change to show. Gating the
          number on the chart's requirement threw that away. */}
      {history.hasHistory && (
        <svg
          className="mt-3 block w-full"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={geometry.area} fill={stroke} opacity={0.1} />
          <polyline
            points={geometry.points}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* The endpoint marked, because a sparse series can end well before
              the right edge and the line alone makes that look like clipping. */}
          {geometry.last && (
            <circle cx={geometry.last.x} cy={geometry.last.y} r={2} fill={stroke} />
          )}
        </svg>
      )}

      <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-[color:var(--m-border)] pt-3.5">
        <Stat label="Realized" value={realizedPnlUsd} loading={isLoading} signed />
        <Stat label="Unrealized" value={unrealizedPnlUsd} loading={isLoading} signed />
        {/* Realized and Unrealized are summed across every chain; Volume is
            NOT — it comes from `spotAccounts`, which the gateway reads from
            its own chain. Three figures under one border read as peers, so
            this one names its scope rather than implying a total it is not. */}
        <Stat
          label={`Volume · ${chainLabel}`}
          value={volumeUsd}
          loading={statsLoading}
        />
      </div>
    </section>
  );
}

/** "vs Aug 30" — the day the change is actually measured from. `fromIndex` is a
 * UTC day ordinal, not a timestamp; see `apps/admin-service/src/balances.ts`,
 * which owns that convention. */
function fromLabel(fromIndex: number | null): string {
  if (fromIndex === null) return "";
  return `vs ${new Date(fromIndex * 86_400_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function Stat({
  label,
  value,
  loading,
  signed,
}: {
  label: string;
  value: number;
  loading: boolean;
  signed?: boolean;
}) {
  const tone =
    !signed || value === 0
      ? ""
      : value > 0
        ? "text-[color:var(--m-success-fg)]"
        : "text-[color:var(--m-error-fg)]";
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]">
        {label}
      </div>
      <div className={cn("mt-1 text-[18px] font-bold tabular-nums tracking-[-0.022em]", tone)}>
        {loading ? "…" : `${signed && value > 0 ? "+" : ""}${money(value)}`}
      </div>
    </div>
  );
}
