"use client";

import { useEffect } from "react";

/**
 * Ask the service to go LOOK for deposits, rather than waiting to be told.
 *
 * ## The gap this closes
 *
 * Every other path records a transfer somebody points at: the app reports what
 * it submitted, and the claim form takes a hash a person pasted. Neither covers
 * the case `lib/transfer/history.ts` has always called out — a deposit the app
 * was never present for. Someone scans the QR from their phone, a friend sends
 * USDC, or a bridge settles after the tab is closed: the money arrives and
 * nothing in the product ever mentions it.
 *
 * `POST /transfers/discover` makes identity-service scan recent blocks for
 * transfers that credited this account and write the rows itself, through the
 * same verification every reported transfer goes through. So this is a nudge,
 * not a report: the browser asserts nothing and the chain decides everything.
 *
 * ## Why a poll and not a subscription
 *
 * There is nothing to subscribe to. No service in this monorepo watches for
 * incoming value — the broker indexes exchange events and has no ERC-20
 * `Transfer` handler at all — so "did anything arrive" can only be asked, and
 * the cheapest honest way to ask is on a timer while somebody is looking at the
 * screen that would show the answer.
 *
 * The interval is deliberately slack. The server walks a block window per chain
 * and fetches receipts for hashes it has not seen, so this is not free; its own
 * rate limiter is tighter than the report endpoint's for that reason, and a
 * caller that ran every few seconds would spend its budget and start getting
 * 429s in the middle of a deposit.
 *
 * ## Silent on failure, always
 *
 * A discovery pass that fails costs the user nothing — the deposit is on chain
 * either way, the local row already exists for anything this browser submitted,
 * and the claim form is still there. Reporting "could not check for deposits"
 * would describe a bookkeeping detail as though their money were in question.
 */
const DISCOVER_INTERVAL_MS = 45_000;

/**
 * The shortest gap between sweeps for one address, ACROSS mounts.
 *
 * The first cut swept on every mount, and a mount is not a rare event: this
 * rides `TransferHistory`, which is on both /deposit and /withdraw, so moving
 * between them re-swept each time — and React StrictMode mounts effects twice
 * in development, doubling it again. Clicking around for a minute was enough to
 * exhaust the endpoint's budget and start collecting 429s.
 *
 * Module-level rather than a ref, because a ref is per mount and the burst IS
 * the mounts. The server enforces its own cooldown regardless — this is the
 * half that stops the requests being made at all.
 */
const MIN_GAP_MS = 20_000;
const lastSweep = new Map<string, number>();

export function useDiscoverTransfers(
  address: string | undefined,
  onFound: () => void,
): void {
  useEffect(() => {
    if (!address) return;
    let live = true;
    const key = address.toLowerCase();

    const sweep = async () => {
      // Checked at CALL time, not mount time, so the interval below is
      // unaffected — only a repeat that arrives too soon is dropped.
      const now = Date.now();
      const previous = lastSweep.get(key);
      if (previous !== undefined && now - previous < MIN_GAP_MS) return;
      lastSweep.set(key, now);
      try {
        const response = await fetch("/transfers/discover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ account: address }),
        });
        if (!response.ok) return;
        const body = (await response.json()) as { added?: number };
        // Only when something actually landed. Refetching on every pass would
        // put the whole list through react-query every 45 seconds to learn
        // nothing, which is the cost this check exists to avoid.
        if (live && typeof body.added === "number" && body.added > 0) onFound();
      } catch {
        // Deliberately silent — see the note above.
      }
    };

    void sweep();
    const timer = window.setInterval(() => void sweep(), DISCOVER_INTERVAL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [address, onFound]);
}
