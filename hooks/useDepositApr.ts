"use client";

import { useEffect, useRef, useState } from "react";
import { getProspectiveApr, type ProspectiveApr } from "@/queries/server/liquidity";

/**
 * What a deposit of this size, into this band, would earn — the number both
 * deposit surfaces were missing.
 *
 * `GET /api/liquidity/apr` has existed in the gateway with its tier weighting
 * and age weighting for some time and had NO reader: `/pool/deposit` carried no
 * APR at all, and the dock's LP tab showed a fee tier and nothing else. Same
 * shape as the chain-brand bug — the backend was built and correct, and nothing
 * asked it the question.
 *
 * ## Why not react-query
 *
 * The key would be four continuously-changing numbers, so every keystroke mints
 * a fresh cache entry that is never read again — a cache of garbage plus a
 * request per character. Debounce-then-fetch is the right shape for an input
 * this directly drives, and the trailing-response guard below is the only part
 * a cache was buying.
 *
 * ## The stale-response guard is the load-bearing part
 *
 * Type 1, then 10, then 100 and three requests are in flight. They can settle in
 * any order, so without a sequence number the answer for `1` can land last and
 * sit on screen next to `100`, reporting a yield for a deposit the user is not
 * making. `seq` is compared on arrival and anything not newest is dropped.
 */
export function useDepositApr({
  networkName,
  base,
  quote,
  amountBase,
  amountQuote,
  minPrice,
  maxPrice,
  enabled = true,
  debounceMs = 400,
}: {
  networkName: string;
  base: string | undefined;
  quote: string | undefined;
  amountBase: number;
  amountQuote: number;
  minPrice?: number;
  maxPrice?: number;
  enabled?: boolean;
  debounceMs?: number;
}): { data: ProspectiveApr | null; loading: boolean } {
  const [data, setData] = useState<ProspectiveApr | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  /*
   * No amount is not "not ready".
   *
   * This required a positive total, so the card printed an em-dash until
   * something was typed — under a caption blaming the POOL for having no fills
   * to measure, which on a pool that has them is simply false. The pool's own
   * realised rate needs no deposit; only the dilution does. `getProspectiveApr`
   * answers the undiluted figure in that case, so the gate is just "we know
   * which pool".
   */
  const ready = enabled && Boolean(base && quote);

  useEffect(() => {
    if (!ready) {
      // Clear rather than keep: a stale APR beside an emptied field is a claim
      // about a deposit that no longer exists. Reached now only when the pair
      // itself is unknown, not merely when the amount is empty.
      seq.current += 1;
      setData(null);
      setLoading(false);
      return;
    }

    const mine = ++seq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void getProspectiveApr(networkName, base!, quote!, {
        amountBase,
        amountQuote,
        minPrice,
        maxPrice,
      })
        .then((result) => {
          if (seq.current !== mine) return;
          setData(result);
          setLoading(false);
        })
        .catch(() => {
          // The query already promises not to throw; this is the same belt-and-
          // braces `usePairSnapshot` applies for the same reason.
          if (seq.current !== mine) return;
          setData(null);
          setLoading(false);
        });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [ready, networkName, base, quote, amountBase, amountQuote, minPrice, maxPrice, debounceMs]);

  return { data, loading };
}
