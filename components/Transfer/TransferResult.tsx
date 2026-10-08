"use client";

/**
 * What a withdrawal looks like once the passkey has signed.
 *
 * ## It REPLACES the form, and that is the point
 *
 * This was a dismissible strip stacked ABOVE the unchanged confirm screen. So a
 * completed withdrawal rendered "Sent 1 USDC" directly over a heading that still
 * said "Confirm withdrawal", with a live "Confirm with passkey" button beneath
 * it. The money had gone and the screen read as unfinished — the one thing a
 * transfer surface must never be ambiguous about, on a page whose own copy says
 * the action cannot be undone.
 *
 * ## Three states, because broadcast is not success
 *
 * `useTransferConfirmation` already draws the distinction this repo keeps
 * relearning: a REVERTED transaction has a receipt too, so only
 * `receipt.status` separates the outcomes. The states are therefore
 * `confirming` (submitted, no verdict), `confirmed` and `reverted` — and only
 * one of the three draws a checkmark.
 *
 * ## One glyph per outcome, never a recoloured tick
 *
 * A checkmark reads as "it worked" whatever colour it is painted, and this is
 * the screen where that misreading costs the most. Failure draws a cross.
 * Confirming draws neither — it draws a spinner, because nothing has been
 * decided yet.
 *
 * ## The hash is a first-class row from the FIRST frame
 *
 * It exists at broadcast, which is exactly when someone wants to paste it
 * somewhere or watch it on an explorer. Copy and open-in-explorer are separate
 * controls: one keeps you here, the other leaves. The external-link icon sits
 * INSIDE the anchor — the bug already fixed once in `SwapFlow`'s `TxLink`.
 */

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { wagmiChains } from "@/lib/customChains";
import { chargedFeeToken, feeUnits } from "@/lib/chains/gasToken";
import type { TransferReceipt, TransferStatus, WatchedTransfer } from "@/hooks/useTransferConfirmation";

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

/** Copy button that reports failure rather than looking identical either way. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), state === "ok" ? 1600 : 2400);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      onClick={() => void copyText(value).then((ok) => setState(ok ? "ok" : "failed"))}
      aria-label={state === "failed" ? `Could not copy ${label}` : `Copy ${label}`}
      title={state === "failed" ? "Could not copy — select it by hand" : `Copy ${label}`}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-transparent transition-colors",
        state === "ok"
          ? "text-[color:var(--m-success)]"
          : state === "failed"
            ? "text-[color:var(--m-error)]"
            : "text-[color:var(--m-text-secondary-2)] hover:border-[color:var(--m-border)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]",
      )}
    >
      {state === "ok" ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Row({
  label,
  children,
  actions,
}: {
  label: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-[color:var(--m-border)]/60 px-3.5 py-3 last:border-b-0">
      <span className="w-[86px] shrink-0 font-dm-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--m-text-secondary-2)]">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-all font-dm-mono text-[12.5px] tabular-nums text-[color:var(--m-text-primary)]">
        {children}
      </span>
      {actions && <span className="flex shrink-0 gap-0.5">{actions}</span>}
    </div>
  );
}

export function TransferResult({
  status,
  transfer,
  receipt,
  onDismiss,
  onRetry,
}: {
  status: TransferStatus;
  transfer: WatchedTransfer;
  receipt: TransferReceipt | null;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const chain = wagmiChains.find((c) => c.id === transfer.chainId);
  const explorer = chain?.blockExplorers?.default?.url;
  const txUrl = explorer ? `${explorer.replace(/\/$/, "")}/tx/${transfer.hash}` : null;
  const pending = status === "confirming";
  const failed = status === "reverted";

  /*
   * The fee is in the chain's NATIVE decimals, which on Arc is 18 while the
   * USDC being withdrawn is 6. Formatting it with the token's would be the
   * 10^12 error this codebase records for exactly this chain. Tempo has no
   * native coin at all -- its registry entry is a 6-decimal placeholder -- so
   * the scale and name come from `feeUnits` and the receipt's own `feeToken`.
   */
  const units = chain
    ? feeUnits(chain.id, chain.nativeCurrency, chargedFeeToken(chain.id, receipt?.feeToken))
    : null;
  const fee = receipt && units ? `${formatUnits(receipt.feeWei, units.decimals)} ${units.symbol}` : null;

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <div className="relative grid h-16 w-16 place-items-center">
          {pending ? (
            <span
              className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--m-border)] border-t-[color:var(--m-primary)] motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <span
              className={cn(
                "grid h-16 w-16 place-items-center rounded-full motion-safe:animate-[transferMark_.4s_cubic-bezier(.3,.9,.4,1)]",
                failed
                  ? "bg-[color:var(--m-error)]/12 text-[color:var(--m-error)]"
                  : "bg-[color:var(--m-success)]/12 text-[color:var(--m-success)]",
              )}
              aria-hidden
            >
              {/* One glyph per outcome — see the module docstring. */}
              {failed ? <X size={30} strokeWidth={2.6} /> : <Check size={30} strokeWidth={2.6} />}
            </span>
          )}
        </div>

        <h1 className="text-lg font-semibold text-[color:var(--m-text-primary)]">
          {pending ? "Confirming" : failed ? "Not sent" : "Sent"}
        </h1>

        <p
          className={cn(
            "font-dm-mono text-[30px] leading-none tabular-nums text-[color:var(--m-text-primary)]",
            failed && "text-[color:var(--m-text-secondary-2)] line-through",
          )}
        >
          {transfer.amount}
          <span className="ml-1.5 text-[15px] text-[color:var(--m-text-secondary)]">
            {transfer.symbol}
          </span>
        </p>

        <p className="text-[13px] text-[color:var(--m-text-secondary)]">
          {chain?.name ?? `Chain ${transfer.chainId}`}
          {receipt
            ? ` · ${failed ? "reverted in" : "confirmed in"} block ${receipt.blockNumber.toLocaleString("en-US")}`
            : " · submitted, waiting for the block"}
        </p>
      </div>

      <div className="rounded-xl border border-[color:var(--m-border)]">
        {transfer.peer && (
          <Row label="To" actions={<CopyButton value={transfer.peer} label="recipient address" />}>
            {transfer.peer}
          </Row>
        )}
        <Row label="Network">
          {chain?.name ?? "Unknown"} · {transfer.chainId}
        </Row>
        <Row
          label="Tx"
          actions={
            <>
              <CopyButton value={transfer.hash} label="transaction hash" />
              {txUrl && (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open transaction on ${chain?.blockExplorers?.default?.name ?? "the explorer"}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-transparent text-[color:var(--m-text-secondary-2)] transition-colors hover:border-[color:var(--m-border)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]"
                >
                  {/* INSIDE the anchor. Outside it, the icon is not the link. */}
                  <ExternalLink size={14} />
                </a>
              )}
            </>
          }
        >
          {short(transfer.hash)}
        </Row>
        {/* Shown on BOTH outcomes: a reverted transfer still charged a fee, and
            on Arc that fee is the same asset being withdrawn — so leaving it out
            is what makes the balance afterwards look wrong. */}
        {fee && <Row label="Network fee">{fee}</Row>}
      </div>

      <div
        className={cn(
          "flex gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed",
          failed
            ? "border-[color:var(--m-error)]/35 bg-[color:var(--m-error)]/10 text-[color:var(--m-error)]"
            : "border-[color:var(--m-primary)]/30 bg-[color:var(--m-primary)]/10 text-[color:var(--m-text-secondary)]",
        )}
      >
        <span>
          {pending ? (
            <>
              <b className="font-semibold">You can leave this open.</b> The hash above already
              exists — copy it or follow it on the explorer while it confirms.
            </>
          ) : failed ? (
            <>
              <b className="font-semibold">Your funds did not move.</b> The network refused the
              transfer, so the balance is unchanged apart from the fee above.
            </>
          ) : (
            <>
              <b className="font-semibold text-[color:var(--m-text-primary)]">Rate never held this.</b>{" "}
              It went straight from your wallet to the address above, which is also why it cannot
              be reversed.
            </>
          )}
        </span>
      </div>

      {/* No action at all while confirming: there is nothing to decide yet, and
          a Dismiss here would hide the only record of an in-flight transfer. */}
      {!pending && (
        <div className="flex gap-2.5">
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--m-border)] py-3 text-[14px] font-semibold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
            >
              View on {chain?.blockExplorers?.default?.name ?? "explorer"}
              <ExternalLink size={14} />
            </a>
          )}
          <button
            type="button"
            onClick={failed ? onRetry : onDismiss}
            className="flex-1 rounded-xl bg-[color:var(--m-primary)] py-3 text-[14px] font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
          >
            {failed ? "Try again" : "Done"}
          </button>
        </div>
      )}
    </div>
  );
}
