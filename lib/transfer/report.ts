import { appendTransfer, type TransferKind, type TransferRecord } from "./history";

/**
 * Tell identity-service about a transfer, and keep a local copy either way.
 *
 * ## What is actually sent
 *
 * A chain id, a hash, an account and a direction. Nothing about the amount, the
 * asset or the counterparty — the service reads all of that from the receipt.
 * That is what lets the endpoint take no signature: a caller cannot lie about a
 * transfer, only point at one, and pointing at a transfer that did not credit
 * the account it names gets a 422.
 *
 * ## Why the local record stays
 *
 * It is not a duplicate of the server's row; it is what makes the list correct
 * before the server has one. The report is a round trip that can fail — an
 * unreachable service, a chain whose RPC would not answer for the receipt, a
 * transaction not yet mined when the toast fired — and none of those are a
 * reason for a transfer the user just made to vanish from their own screen.
 *
 * So this is fire-and-forget by design. It never throws, never blocks the
 * caller's success path, and never reports a failure to the user: the transfer
 * happened regardless, and the only thing at stake is whether it also shows up
 * on their other devices.
 */
export interface ReportedTransfer {
  hash: string;
  chainId: number;
  kind: TransferKind;
  account: string;
  /** Display copies, for the local row only. The server re-reads both. */
  symbol: string;
  amount: string;
  peer?: string | null;
}

export function reportTransfer(transfer: ReportedTransfer): TransferRecord[] {
  const local = appendTransfer({
    hash: transfer.hash,
    kind: transfer.kind,
    chainId: transfer.chainId,
    symbol: transfer.symbol,
    amount: transfer.amount,
    peer: transfer.peer ?? null,
    at: Date.now(),
  });

  if (typeof window !== "undefined") {
    void fetch("/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId: transfer.chainId,
        hash: transfer.hash,
        account: transfer.account,
        kind: transfer.kind,
      }),
      // The page may navigate away the moment this fires — a withdrawal's
      // success toast is often the last thing before leaving. `keepalive` lets
      // the request outlive the document.
      keepalive: true,
    }).catch(() => {
      // Deliberately silent. The local row already exists, the transfer already
      // happened, and telling someone their deposit "failed to report" would
      // describe a bookkeeping detail as if their money were at risk.
    });
  }

  return local;
}
