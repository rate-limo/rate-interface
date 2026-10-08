"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTokenStats } from "@/hooks/useTokenStats";
import type { StatsWindow } from "@/queries/server/tokenStats";
import { formatMarketCap } from "@/utils/number";

const WINDOWS: StatsWindow[] = ["5m", "1h", "6h", "24h"];

/**
 * The token profile's right-rail stats block: flow over a window, then the
 * market cap's distance to its all-time high.
 *
 * ## Every number here is aggregated per request, and two of them are absent
 *
 * `GET /api/token/:address/stats/:window` sums `spotTrades` — there is no
 * buy/sell count, volume split or distinct-trader column in the schema, so these
 * are computed rather than stored and cannot drift from the fills they came from.
 *
 * What the reference design shows and this does NOT is an **Audit** tab and a
 * **bubble map**. Neither has any source in this repo — no holder graph, no
 * contract-audit record — so they are rendered disabled with the reason, rather
 * than as tabs that open something invented. Same call this codebase already
 * makes for `Edit logo & description` and the graduation button: disabled and
 * explained beats hidden, and both beat fabricated.
 */
export function TokenStatsPanel({
  networkName,
  address,
  className,
}: {
  networkName: string;
  address: string | undefined;
  className?: string;
}) {
  const [window, setWindow] = useState<StatsWindow>("24h");
  const [pane, setPane] = useState<"stats" | "audit">("stats");
  const { data, isLoading } = useTokenStats(networkName, address, window);

  return (
    <div
      className={cn(
        "rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Both are real tabs. Audit used to be an inert `<span>` carrying its
              explanation in a `title`, which is invisible on touch, invisible to
              a keyboard, and reads as a dead control — the reason it looked
              unfinished rather than deliberately empty. It still opens no
              invented content; it opens the reason there is none. */}
          {(["stats", "audit"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              aria-pressed={pane === key}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[13px] capitalize transition-colors",
                pane === key
                  ? "bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary-2)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {key}
            </button>
          ))}
        </div>
        <div className={cn("flex items-center gap-0.5", pane !== "stats" && "invisible")}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              className={cn(
                "rounded-md px-2 py-1 text-[12px] transition-colors",
                window === w
                  ? "bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {pane === "audit" ? (
        /* A placeholder that says WHAT is missing and WHY, rather than an empty
           pane. Nothing in this monorepo records a contract audit — there is no
           table, no service and no third-party integration — so anything shown
           here would be invented, which on a page whose job is helping someone
           judge a token is the worst available failure. */
        <div className="py-6 text-center">
          <p className="text-[13px] font-semibold text-[color:var(--m-text-primary)]">
            No audit on file
          </p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
            Rate does not audit tokens, and nothing here records third-party audits yet. Anyone
            can launch a coin on this venue — read the contract yourself before trading.
          </p>
          <p className="mt-3 text-[11px] text-[color:var(--m-text-secondary-2)]">
            The contract address is under Market details.
          </p>
        </div>
      ) : data === null && !isLoading ? (
        <p className="py-6 text-center text-[13px] text-[color:var(--m-text-secondary)]">
          Market data is unavailable for this token right now.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-[13px]">
            <span className="text-[color:var(--m-text-secondary)]">
              Price change{" "}
              <b className={cn("font-semibold tabular-nums", pctTone(data?.priceChangePct))}>
                {isLoading ? "…" : formatPct(data?.priceChangePct)}
              </b>
            </span>
            <span className="text-[color:var(--m-text-secondary)]">
              Volume{" "}
              <b className="font-semibold tabular-nums text-[color:var(--m-text-primary)]">
                {isLoading ? "…" : formatMarketCap(data?.volumeUSD ?? null)}
              </b>
            </span>
          </div>

          {/* Three rows of zeros and three empty bars is what a token that has
              never traded produced, and it reads as a panel that failed to load
              rather than a market with no flow. The figures are real — the
              gateway sums `spotTrades` per request and there simply are none —
              so this says that in words and keeps the market cap below, which
              IS measured. */}
          {!isLoading && data && data.trades === 0 ? (
            <p className="py-5 text-center text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
              No trades in this window.
              <br />
              <span className="text-[color:var(--m-text-secondary-2)]">
                Buys, sells and unique traders appear here after the first fill.
              </span>
            </p>
          ) : (
            <>
          <SplitRow
            loading={isLoading}
            left={data?.buys ?? 0}
            right={data?.sells ?? 0}
            leftLabel="buys"
            rightLabel="sells"
          />
          <SplitRow
            loading={isLoading}
            left={data?.buyVolumeUSD ?? 0}
            right={data?.sellVolumeUSD ?? 0}
            leftLabel="buy vol"
            rightLabel="sell vol"
            currency
          />
          <SplitRow
            loading={isLoading}
            left={data?.buyers ?? 0}
            right={data?.sellers ?? 0}
            leftLabel="buyers"
            rightLabel="sellers"
          />
            </>
          )}

          <MarketCapBar marketCap={data?.marketCapUSD ?? null} ath={data?.athMarketCapUSD ?? null} loading={isLoading} />
        </>
      )}
    </div>
  );
}

/**
 * One flow metric as two opposing figures over a shared bar.
 *
 * The bar is proportional, and when BOTH sides are zero it renders as a neutral
 * empty track rather than a 50/50 split — an even bar would claim balanced flow
 * on a market that simply had none.
 */
function SplitRow({
  left,
  right,
  leftLabel,
  rightLabel,
  currency = false,
  loading,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  currency?: boolean;
  loading: boolean;
}) {
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 0;
  const show = (n: number) => (loading ? "…" : currency ? formatMarketCap(n) : n.toLocaleString("en-US"));

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-[color:var(--m-text-secondary)]">
          <b className="font-semibold tabular-nums text-[color:var(--m-success)]">{show(left)}</b> {leftLabel}
        </span>
        <span className="text-[color:var(--m-text-secondary)]">
          <b className="font-semibold tabular-nums text-[color:var(--m-error)]">{show(right)}</b> {rightLabel}
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {total > 0 ? (
          <>
            <span className="rounded-l-full bg-[color:var(--m-success)]" style={{ width: `${leftPct}%` }} />
            <span className="flex-1 rounded-r-full bg-[color:var(--m-error)]" />
          </>
        ) : (
          <span className="flex-1 rounded-full bg-[color:var(--m-surface-2)]" />
        )}
      </div>
    </div>
  );
}

/**
 * Market cap against its all-time high.
 *
 * Both sides are MARKET CAPS. `spotTokens.ath` is an all-time-high PRICE — it sits
 * beside `priceUSD` under the same monotonic guard — so the endpoint scales it by
 * supply before it gets here. Comparing a market cap against a raw ATH price is
 * the bug this comment exists to prevent: it renders a token at 27% of its peak
 * as a 99.9% drawdown, and the bar looks plausible either way.
 *
 * A token with no recorded ATH renders the figures and no bar — the distance is
 * unknown, and a full or empty bar would both assert one.
 */
function MarketCapBar({
  marketCap,
  ath,
  loading,
}: {
  marketCap: number | null;
  ath: number | null;
  loading: boolean;
}) {
  const pct = marketCap !== null && ath !== null && ath > 0 ? Math.min(100, (marketCap / ath) * 100) : null;

  return (
    <div className="mt-4 flex items-center gap-3 border-t border-[color:var(--m-border)] pt-3 text-[13px]">
      <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">
        MC{" "}
        <b className="font-semibold tabular-nums text-[color:var(--m-text-primary)]">
          {loading ? "…" : formatMarketCap(marketCap)}
        </b>
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
        {pct !== null && (
          <span className="block h-full rounded-full bg-[color:var(--m-success)]" style={{ width: `${pct}%` }} />
        )}
      </span>
      <span className="whitespace-nowrap text-[color:var(--m-text-secondary)]">
        ATH{" "}
        <b className="font-semibold tabular-nums text-[color:var(--m-text-primary)]">
          {loading ? "…" : formatMarketCap(ath)}
        </b>
      </span>
    </div>
  );
}

/** Null is unknown — an em-dash, never 0.00%. */
function formatPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function pctTone(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "text-[color:var(--m-text-secondary-2)]";
  if (pct > 0) return "text-[color:var(--m-success)]";
  if (pct < 0) return "text-[color:var(--m-error)]";
  return "text-[color:var(--m-text-secondary-2)]";
}
