"use client";

import { useEffect, useRef, useState } from "react";
import { useBlockNumber } from "wagmi";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";

/**
 * RPC health for the display chain, shaped for the status bar.
 *
 * ## Why this reports a block height and not "Connected"
 *
 * "Connected" is a claim about a socket; an advancing block number is evidence
 * that the chain is answering. The failure worth catching here is the one in
 * between — a transport that is up, returns 200s, and is serving a height that
 * stopped moving ten minutes ago. A green "Connected" dot is actively wrong in
 * that case, and it is the same class of mistake as reporting a broadcast as a
 * confirmed trade, or rendering gas as `0` when the feed is dead.
 *
 * So there are three live states, not two: `live` (the height moved recently),
 * `stale` (we are talking to something, but it has stopped producing), and
 * `down` (the read itself failed).
 *
 * ## Polling, not `watch: true`
 *
 * viem's watch mode polls on the transport's own interval (~4s by default) and
 * this chip is decoration next to the work the page is already doing. A 12s
 * poll is enough to show liveness on any chain we support, and the endpoints
 * behind these pages already rate-limit under load. Same reasoning as
 * `useNetworkGas`'s 30s: it is a status strip, not a data feed.
 *
 * ## Hydration
 *
 * Staleness is a comparison against the clock, so it cannot be computed during
 * render without the server and the first client pass disagreeing. Nothing is
 * reported until an effect has run — the same rule as the OG Pass countdown and
 * the consent banner.
 */

/** No new block within this window means the feed has stopped, not that it is slow. */
const STALE_AFTER_MS = 36_000;

/** ~3 polls. Long enough that one slow block on a quiet testnet is not an alarm. */
const POLL_MS = 12_000;

export type RpcReading =
  | { state: "loading" }
  | { state: "down" }
  | { state: "stale"; block: string; secondsSince: number }
  | { state: "live"; block: string };

export function useRpcStatus(): RpcReading {
  const { displayChainId } = useMarketPageContext();

  const { data, isLoading, isError } = useBlockNumber({
    chainId: displayChainId,
    query: {
      refetchInterval: POLL_MS,
      // A chain missing from the wagmi config will never succeed; one retry is
      // enough to tell a blip from a misconfiguration.
      retry: 1,
    },
  });

  // When the height last CHANGED — not when it was last fetched. A poll that
  // returns the same number is precisely the stale case this exists to name.
  const changedAt = useRef<number | null>(null);
  const seen = useRef<bigint | null>(null);
  const [, forceTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (data === undefined) return;
    if (seen.current === null || data !== seen.current) {
      seen.current = data;
      changedAt.current = Date.now();
    }
  }, [data]);

  // Re-evaluate on a timer as well as on new data: without this, a feed that
  // stops delivering never re-renders, so the chip keeps claiming `live`
  // forever on the strength of its last good poll.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!mounted || isLoading) return { state: "loading" };
  if (isError || data === undefined) return { state: "down" };

  const block = data.toString();
  const since = changedAt.current === null ? 0 : Date.now() - changedAt.current;

  if (since > STALE_AFTER_MS) {
    return { state: "stale", block, secondsSince: Math.round(since / 1000) };
  }
  return { state: "live", block };
}
