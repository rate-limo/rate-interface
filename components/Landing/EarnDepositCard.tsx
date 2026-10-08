"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultConnectedChain } from "@/consts";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { getPairs } from "@/queries/server/pairs";
import { getProspectiveApr, type ProspectiveApr } from "@/queries/server/liquidity";
import { AprHeadline } from "@components/Liquidity/steps/parts";
import {
    ASSUMED_DAILY_VOLUME_USD,
    formatUsdPerDay,
    projectEarnings,
} from "@/lib/liquidity/projectedEarnings";
import type { SpotPair } from "@/types";

const DEPOSIT_QUOTE = 1_000;
const PAIRS_SCANNED = 5;

type Pick = { chain: string; pair: SpotPair; apr: ProspectiveApr | null };

/**
 * The Earn row's picture: a one-token deposit and what it would be paid.
 *
 * The figure is the app's own deposit headline (`AprHeadline`) fed by the same
 * gateway route, never a number written into the page — the brand book forbids
 * a yield claim, and a measured rate with its 24h basis is not one. It scans
 * each served chain's busiest pairs, the default chain first, for a pool with
 * fills to measure, and when none has, shows the em-dash with the gateway's
 * reason rather than a stand-in figure.
 */
export function EarnDepositCard() {
  const visible = useVisibleChains();
  const chains = useMemo(
    () => [defaultConnectedChain, ...visible.filter((c) => c !== defaultConnectedChain)],
    [visible],
  );
  const [pick, setPick] = useState<Pick | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void (async () => {
      let fallback: Pick | null = null;
      for (const chain of chains) {
        const page = await getPairs(chain, PAIRS_SCANNED, 1, "").catch(() => null);
        const pairs: SpotPair[] = page?.pairs ?? [];
        // One at a time: the gateway rate-limits, and eight parallel asks came
        // back 429 — which reads as "no fills" and hid a pool that had them.
        for (const pair of pairs) {
          const apr = await getProspectiveApr(chain, pair.base.id, pair.quote.id, {
            amountQuote: DEPOSIT_QUOTE,
          }).catch(() => null);
          if (!live) return;
          if ((apr?.aprPct ?? 0) > 0) {
            setPick({ chain, pair, apr });
            setLoading(false);
            return;
          }
          // Prefer a pool that at least HOLDS something: with no measured rate the
          // card falls back to "what this would pay at an assumed volume", and
          // that sentence is only worth reading against a real band's dilution.
          if (!fallback || ((apr?.poolLiquidityQuote ?? 0) > (fallback.apr?.poolLiquidityQuote ?? 0))) {
            fallback = { chain, pair, apr };
          }
        }
      }
      if (!live) return;
      setPick(fallback);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [chains]);

  const quoteSym = pick?.pair.quote.symbol ?? "USDC";
  const baseSym = pick?.pair.base.symbol ?? "—";

  // The measured rate leads whenever the gateway has one. Everything below is
  // what the card says INSTEAD -- see `projectedEarnings` for why it is not an
  // APY and must keep its "at $X of volume" clause on screen.
  const measured = typeof pick?.apr?.aprPct === "number";
  const projected = projectEarnings({
    depositQuote: DEPOSIT_QUOTE,
    lpFeeRate: pick?.apr?.lpFeeRate ?? null,
    poolLiquidityQuote: pick?.apr?.poolLiquidityQuote ?? null,
  });
  const feePct = pick?.apr?.lpFeeRate != null ? pick.apr.lpFeeRate * 100 : null;

  return (
    <div className="rounded-2xl border border-dark-grey-3 bg-black-300 p-5 shadow-[0_30px_80px_-48px_rgba(0,0,0,.7)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono-brand text-[11px] tracking-[0.14em] text-dark-grey-1 uppercase">Deposit</span>
        <span className="font-mono text-xs text-dark-grey-1">
          {baseSym}/{quoteSym} · {pick?.chain ?? defaultConnectedChain}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-3">
        <span className="font-mono text-2xl text-[color:var(--m-text-primary)] tabular-nums">
          {DEPOSIT_QUOTE.toLocaleString()}
        </span>
        <span className="rounded-full border border-[color:var(--m-border)] px-3 py-1 font-mono text-sm text-[color:var(--m-text-primary)]">
          {quoteSym}
        </span>
      </div>

      <div className="mt-3">
        {measured || loading ? (
          <AprHeadline apr={{ data: pick?.apr ?? null, loading }} depositQuote={DEPOSIT_QUOTE} quoteSym={quoteSym} />
        ) : (
          <AtAssumedVolume projected={projected} feePct={feePct} />
        )}
      </div>
    </div>
  );
}

/**
 * The conditional, when no rate is measurable.
 *
 * The volume is an assumption and says so in the same sentence as the number --
 * not in a tooltip, not in a footnote. The fee rate beside it IS measured, and
 * naming both is what keeps this from reading as a yield claim. It is never
 * labelled APY or APR, because it is neither.
 */
function AtAssumedVolume({
  projected,
  feePct,
}: {
  projected: ReturnType<typeof projectEarnings>;
  feePct: number | null;
}) {
  if (!projected) {
    return (
      <p className="text-sm text-dark-grey-1">
        No pool depth to measure here yet.
      </p>
    );
  }
  return (
    <div>
      <p className="font-mono-brand text-[11px] tracking-[0.14em] text-dark-grey-1 uppercase">
        At ${ASSUMED_DAILY_VOLUME_USD.toLocaleString()}/day of volume
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-3xl text-white tabular-nums">
          {formatUsdPerDay(projected.usdPerDay)}
        </span>
        <span className="text-sm text-dark-grey-1">a day</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-dark-grey-1">
        {feePct != null ? `${feePct.toFixed(2)}% of every fill` : "A share of every fill"} is paid to the
        people whose liquidity filled it, split by size. The rate is measured; the volume above is
        an assumption, not a forecast — nothing has traded here in the last 24 hours.
      </p>
    </div>
  );
}
