"use client";

import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import type { TransferRecord } from "@/lib/transfer/history";

/** One row as identity-service stores it: amounts are base units, not display. */
interface ServerTransfer {
  chainId: number;
  hash: string;
  kind: string;
  symbol: string;
  amount: string;
  decimals: number;
  token: string | null;
  peer: string | null;
  blockTime: number | null;
  recordedAt: number;
}

/**
 * This wallet's transfers, as identity-service has them.
 *
 * Same-origin `/transfers/:address`, rewritten to the service — it has no CORS
 * configuration, so a direct call from the browser would be blocked.
 *
 * Amounts arrive in the asset's SMALLEST unit and are formatted here. The
 * service stores them that way on purpose: a decimal string of base units is
 * exact, while a display figure would have to be reconstructed by whoever wrote
 * it, and `spotOrders.placed` is this repo's standing example of a token amount
 * quietly losing precision in storage.
 *
 * Returns null — not an empty list — when the record cannot be read, so a caller
 * can tell "no transfers" from "we could not ask" and fall back to the local
 * log rather than showing a confident blank.
 */
export function useTransfers(address: string | undefined) {
  return useQuery({
    queryKey: ["transfers", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferRecord[] | null> => {
      /*
       * `enabled` DOES NOT GATE `refetch()`.
       *
       * In react-query v5 an explicit `refetch()` runs even on a disabled
       * query, and `TransferHistory` calls one from an effect. With no wallet
       * connected that reached `GET /transfers/undefined`, which
       * identity-service answers 400 — a request the client should never have
       * made, reported as a client error in the console on every visit by a
       * disconnected visitor.
       *
       * Null, not an empty array: "we could not ask" is exactly what this hook
       * distinguishes, and a disconnected wallet has no record to be empty.
       * The caller falls back to the local log, which is the right answer.
       */
      if (!address) return null;
      const response = await fetch(`/transfers/${address}`);
      if (!response.ok) return null;
      const body = (await response.json()) as { transfers?: ServerTransfer[] };
      if (!Array.isArray(body.transfers)) return null;
      return body.transfers.map((row) => ({
        hash: row.hash,
        kind: row.kind === "withdraw" ? "withdraw" : "deposit",
        chainId: row.chainId,
        symbol: row.symbol || "—",
        amount: formatUnits(BigInt(row.amount || "0"), row.decimals ?? 18),
        peer: row.peer,
        // blockTime is chain SECONDS; the record is epoch ms everywhere else.
        at: row.blockTime ? row.blockTime * 1000 : row.recordedAt,
      }));
    },
  });
}
