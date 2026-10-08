"use client";

/**
 * Withdrawing an LP position -- in part, or all of it -- in ONE transaction.
 *
 * v2: one token is one position holding the whole band ladder (apps/web/CLAUDE.md, LP
 * section). A percentage removes that fraction from EVERY band the token holds,
 * proportionally, through `decreaseLiquidity(tokenId, bps, minBase, minQuote,
 * recipient, deadline)`. There is no list of per-band tokens to pick from any more;
 * per-band removal (`decreaseBand`) is an advanced path, not this dialog.
 *
 * ## What a withdrawal costs
 *
 * Only the unvested fees attached to the shares that leave -- `vesting x bps`. The
 * vested fees are PAID with the principal, and what stays keeps vesting. (v1 forfeited
 * the whole position's unvested fees on any removal; v2 does not.)
 *
 * ## The amounts are simulated, never guessed
 *
 * The payout is the token's share of each band's CURRENT reserves, so the review runs
 * the real call as a static call and shows what it returns. `minBase`/`minQuote` floor
 * that by 0.5%; a failed simulation falls back to the live view's estimate rather than
 * printing a zero nobody measured.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { BandPositionManagerABI } from "@iter/abis";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";
import { cn } from "@/lib/utils";
import { PERCENTS, bpsForPercent, type Percent } from "@/lib/liquidity/withdrawAmount";
import { type LpToken, WITHDRAW_SLIPPAGE_BPS, withdrawPreview } from "@/lib/liquidity/positions";
import { deadline, useManagerTx } from "@/hooks/useLpPositions";

interface Props {
  token: LpToken;
  onClose: () => void;
  /** Fired after a successful withdrawal so the caller can refetch. */
  onWithdrawn?: () => void;
}

type Phase = "confirm" | "pending" | "done";

const trim = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);
const ZERO = BigInt(0);

export function WithdrawFlow({ token, onClose, onWithdrawn }: Props) {
  const { address: account } = useAccount();
  const { send, manager, publicClient } = useManagerTx(token.networkName);

  const [mounted, setMounted] = useState(false);
  /** False when the transaction was sent but its receipt was never observed. */
  const [confirmed, setConfirmed] = useState(true);
  const [phase, setPhase] = useState<Phase>("confirm");
  const [percent, setPercent] = useState<Percent>(100);
  const [payout, setPayout] = useState<{ baseOut: bigint; quoteOut: bigint } | null>(null);
  const [probing, setProbing] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  useEffect(() => setMounted(true), []);

  const fmtBase = (v: bigint) => trim(formatUnits(v, token.baseDecimals));
  const fmtQuote = (v: bigint) => trim(formatUnits(v, token.quoteDecimals));
  const estimate = withdrawPreview(token, bpsForPercent(percent));

  const probe = useCallback(
    async (pct: Percent) => {
      if (!publicClient || !manager || !account) return;
      setProbing(true);
      try {
        const { result } = await publicClient.simulateContract({
          address: manager as `0x${string}`,
          abi: BandPositionManagerABI,
          functionName: "decreaseLiquidity",
          args: [BigInt(token.tokenId), bpsForPercent(pct), ZERO, ZERO, account, deadline()],
          account,
        });
        const [baseOut, quoteOut] = result as readonly [bigint, bigint];
        setPayout({ baseOut, quoteOut });
      } catch {
        setPayout(null);
      } finally {
        setProbing(false);
      }
    },
    [publicClient, manager, account, token.tokenId],
  );

  useEffect(() => {
    void probe(percent);
  }, [probe, percent]);

  const withdraw = async () => {
    if (!account) return;
    setPhase("pending");
    // Floors from the simulated payout when there is one, else from the live view.
    const baseOut = payout?.baseOut ?? estimate.baseOut;
    const quoteOut = payout?.quoteOut ?? estimate.quoteOut;
    const floor = (x: bigint) => (x * BigInt(10_000 - WITHDRAW_SLIPPAGE_BPS)) / BigInt(10_000);
    const sent = await send(
      "decreaseLiquidity",
      [BigInt(token.tokenId), bpsForPercent(percent), floor(baseOut), floor(quoteOut), account, deadline()],
      "Could not withdraw",
    );
    if (!sent) {
      setPhase("confirm");
      return;
    }
    /*
     * Back to `confirm` ONLY on a definite failure. A transaction that was sent
     * and has not been seen to settle goes to `done` with `confirmed` false —
     * resetting the form under a live withdrawal is what invites a second one.
     */
    setTxHash(sent.hash);
    setConfirmed(sent.confirmed);
    setPhase("done");
    onWithdrawn?.();
  };

  if (!mounted) return null;

  const closing = percent === 100;
  const forfeits = estimate.forfeitBase > ZERO || estimate.forfeitQuote > ZERO;
  const paysFees = estimate.feesPaidBase > ZERO || estimate.feesPaidQuote > ZERO;
  const shown = payout ?? { baseOut: estimate.baseOut, quoteOut: estimate.quoteOut };
  const panel =
    "w-full max-w-[404px] rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[18px]";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className={panel} onClick={(e) => e.stopPropagation()} data-testid="withdraw-flow">
        <div className="mb-3 flex items-center gap-2">
          <TokenImageIcon symbol={token.baseSymbol} color={tokenColor(token.baseSymbol)} size="sm" className="h-[20px] w-[20px]" />
          <h3 className="text-base font-semibold text-[color:var(--m-text-primary)]">
            {token.baseSymbol}/{token.quoteSymbol}
          </h3>
          <span className="ml-auto font-mono text-[12px] text-[color:var(--m-text-secondary)]">#{token.tokenId}</span>
        </div>

        {phase === "confirm" && (
          <>
            <p className="mb-2.5 text-[13px] text-[color:var(--m-text-secondary)] [text-wrap:pretty]">
              {closing
                ? `Closes the position across all ${token.bands.length} band${token.bands.length === 1 ? "" : "s"}.`
                : `Takes ${percent}% from every band. The rest keeps earning.`}
            </p>

            <div className="mb-3 grid grid-cols-4 gap-1.5" role="group" aria-label="How much to withdraw" data-testid="withdraw-percent">
              {PERCENTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  aria-pressed={percent === pct}
                  onClick={() => setPercent(pct)}
                  className={cn(
                    "min-h-[40px] rounded-xl border py-2 text-[13px] font-medium tabular-nums",
                    "active:scale-[0.96] [transition-property:color,background-color,border-color,scale]",
                    percent === pct
                      ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)]/10 text-[color:var(--m-primary)]"
                      : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:border-[color:var(--m-primary)]",
                  )}
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </button>
              ))}
            </div>

            <div className="my-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3">
              <div className="mb-1 text-[11.5px] uppercase tracking-wide text-[color:var(--m-text-tertiary)]">You receive</div>
              {probing && !payout ? (
                <div className="font-mono text-[15px] text-[color:var(--m-text-secondary)]">Reading…</div>
              ) : (
                <div className="font-mono text-[15px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
                  {fmtBase(shown.baseOut)} {token.baseSymbol} + {fmtQuote(shown.quoteOut)} {token.quoteSymbol}
                </div>
              )}
              {paysFees && (
                <p className="mt-1 font-mono text-[12px] tabular-nums text-[color:var(--m-text-secondary)]">
                  + fees {fmtBase(estimate.feesPaidBase)} {token.baseSymbol} · {fmtQuote(estimate.feesPaidQuote)} {token.quoteSymbol}
                </p>
              )}
              <p className="mt-1.5 text-[11.5px] text-[color:var(--m-text-tertiary)]">
                {payout ? "Simulated against the pool now" : "Estimated from the live position"} — your share of each band&apos;s reserves, not the split you deposited.
              </p>
            </div>

            {forfeits && (
              <p className="mb-3 rounded-xl bg-[color:var(--m-warning)]/10 px-3.5 py-2.5 text-[12px] text-[color:var(--m-text-secondary)]" data-testid="withdraw-forfeit">
                Forfeits{" "}
                <span className="font-mono tabular-nums text-[color:var(--m-text-primary)]">
                  {fmtBase(estimate.forfeitBase)} {token.baseSymbol} + {fmtQuote(estimate.forfeitQuote)} {token.quoteSymbol}
                </span>{" "}
                of fees still vesting — {percent}% of them, the share that leaves with this withdrawal. Collecting instead forfeits nothing.
              </p>
            )}

            <button
              type="button"
              onClick={() => void withdraw()}
              className="min-h-[44px] w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)] active:scale-[0.96] [transition-property:background-color,scale]"
            >
              {closing ? "Withdraw all" : `Withdraw ${percent}%`}
            </button>
          </>
        )}

        {phase === "pending" && (
          <p className="py-8 text-center text-[14px] text-[color:var(--m-text-secondary)]">Withdrawing… confirm in your wallet.</p>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div
              className={cn(
                "mb-2 flex h-12 w-12 items-center justify-center rounded-full text-[24px] font-bold",
                confirmed
                  ? "bg-[color:var(--m-success)]/15 text-[color:var(--m-success)]"
                  : "bg-[color:var(--m-warning)]/15 text-[color:var(--m-warning)]",
              )}
            >
              {confirmed ? "✓" : "⋯"}
            </div>
            <h4 className="mb-1 text-[16px] font-semibold text-[color:var(--m-text-primary)]">
              {/* Never claim the withdrawal happened on a receipt nobody saw. */}
              {!confirmed ? "Withdrawal sent" : closing ? "Withdrawn" : "Partly withdrawn"}
            </h4>
            <p className="m-0 font-mono text-[14px] tabular-nums text-[color:var(--m-text-primary)]">
              {fmtBase(shown.baseOut)} {token.baseSymbol} + {fmtQuote(shown.quoteOut)} {token.quoteSymbol}
            </p>
            {!confirmed && (
              <p className="mt-1 text-[12px] text-[color:var(--m-text-secondary)]">
                Still confirming on chain. The amounts above are what it was sent for — do not send it again.
              </p>
            )}
            {confirmed && !closing && <p className="mt-1 text-[12px] text-[color:var(--m-text-secondary)]">The rest of the position is still earning.</p>}
            {txHash && <p className="mt-1 font-mono text-[12px] text-[color:var(--m-text-tertiary)]">{txHash.slice(0, 10)}…{txHash.slice(-6)}</p>}
            <button type="button" onClick={onClose} className="mt-4 min-h-[44px] w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[15px] font-semibold text-[color:var(--m-on-primary)]">
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
