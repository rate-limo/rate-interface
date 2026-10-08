"use client";

/**
 * Adjust distribution: re-weight one position across the pool's bands, in place.
 *
 * `BandPositionManager.redistribute({tokenId, bands, targetBps, minSharesAfter,
 * refundTo, deadline})` solves the targets into `move`s inside the pool: no tokens come
 * in, the capital never leaves, and only what a receiving band's ratio cannot absorb is
 * refunded to the wallet. The age of the capital travels with it; nothing forfeits
 * except the refunded part (apps/web/CLAUDE.md, LP rule 6).
 *
 * Targets are by VALUE at the anchor -- share counts are not comparable across bands --
 * and must sum to exactly 10,000 bps or the contract reverts `TargetsNotWhole`, which
 * `targetBps` guarantees. A band set to 0% is emptied.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import { BandPoolABI } from "@iter/abis";
import { cn } from "@/lib/utils";
import { LP_DENOM, type LpToken, targetBps } from "@/lib/liquidity/positions";
import { deadline, useManagerTx } from "@/hooks/useLpPositions";
import { formatBandWidth } from "./PositionCard";

interface Props {
  token: LpToken;
  onClose: () => void;
  onAdjusted?: () => void;
}

interface PoolBand {
  band: number;
  toleranceBuy: number;
  open: boolean;
}

export function AdjustFlow({ token, onClose, onAdjusted }: Props) {
  const { address: account } = useAccount();
  const { send, publicClient } = useManagerTx(token.networkName);
  const [mounted, setMounted] = useState(false);
  const [poolBands, setPoolBands] = useState<PoolBand[] | null>(null);
  const [targets, setTargets] = useState<Record<number, number>>(() =>
    Object.fromEntries(token.bands.map((b) => [b.band, Math.round(b.sharePct)])),
  );
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => setMounted(true), []);

  // Every band of the POOL, not only those the token holds: moving into a band the
  // position is not in yet is part of adjusting it.
  useEffect(() => {
    if (!publicClient || !token.pool) return;
    let cancelled = false;
    (async () => {
      try {
        const pool = token.pool as `0x${string}`;
        const count = Number(await publicClient.readContract({ address: pool, abi: BandPoolABI, functionName: "bandCount" }));
        const rows = await Promise.all(
          Array.from({ length: count }, async (_, band) => {
            const [[, , , , open], [toleranceBuy]] = await Promise.all([
              publicClient.readContract({ address: pool, abi: BandPoolABI, functionName: "bands", args: [band] }),
              publicClient.readContract({ address: pool, abi: BandPoolABI, functionName: "bandTolerances", args: [band] }),
            ]);
            return { band, toleranceBuy: Number(toleranceBuy) / LP_DENOM, open };
          }),
        );
        if (!cancelled) setPoolBands(rows);
      } catch {
        if (!cancelled) {
          setPoolBands(token.bands.map((b) => ({ band: b.band, toleranceBuy: b.toleranceBuy ?? 0, open: b.open ?? true })));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, token.pool, token.bands]);

  const total = useMemo(() => Object.values(targets).reduce((sum, v) => sum + v, 0), [targets]);
  const whole = Math.abs(total - 100) < 0.01;
  const unchanged = token.bands.every((b) => Math.round(b.sharePct) === (targets[b.band] ?? 0)) &&
    Object.entries(targets).every(([band, v]) => v === 0 || token.bands.some((b) => b.band === Number(band)));

  const submit = async () => {
    if (!account || !whole) return;
    const { bands, bps } = targetBps(Object.entries(targets).map(([band, pct]) => ({ band: Number(band), pct })));
    setPending(true);
    const sent = await send(
      "redistribute",
      [
        {
          tokenId: BigInt(token.tokenId),
          bands,
          targetBps: bps,
          minSharesAfter: bands.map(() => BigInt(0)),
          refundTo: account,
          deadline: deadline(),
        },
      ],
      "Could not adjust the distribution",
    );
    setPending(false);
    // Truthy for a sent-but-unconfirmed transaction too: the alternative is
    // telling the LP it failed while it is in flight. Null is the only failure.
    if (sent) {
      setDone(true);
      onAdjusted?.();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[18px]"
        onClick={(e) => e.stopPropagation()}
        data-testid="adjust-flow"
      >
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-base font-semibold text-[color:var(--m-text-primary)]">Adjust distribution</h3>
          <span className="ml-auto font-mono text-[12px] text-[color:var(--m-text-secondary)]">
            {token.baseSymbol}/{token.quoteSymbol} #{token.tokenId}
          </span>
        </div>
        <p className="mb-4 text-[12.5px] text-[color:var(--m-text-secondary)] [text-wrap:pretty]">
          Moves value between bands inside the pool. Nothing is deposited; only what a band&apos;s ratio can&apos;t absorb comes back to your wallet.
        </p>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-[15px] font-semibold text-[color:var(--m-text-primary)]">Distribution updated</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-[44px] w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[15px] font-semibold text-[color:var(--m-on-primary)]">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {(poolBands ?? []).map((band) => {
                const held = token.bands.find((b) => b.band === band.band);
                const value = targets[band.band] ?? 0;
                return (
                  <label key={band.band} className="block">
                    <div className="mb-1 flex items-baseline gap-2 font-mono text-[12px]">
                      <span className="text-[color:var(--m-text-primary)]">B{band.band}</span>
                      <span className="text-[color:var(--m-text-secondary)]">{formatBandWidth(band.toleranceBuy)}</span>
                      {!band.open && <span className="text-[color:var(--m-warning)]">closed</span>}
                      <span className="ml-auto tabular-nums text-[color:var(--m-text-secondary)]">
                        now {held ? `${held.sharePct.toFixed(1)}%` : "0%"}
                      </span>
                      <span className="w-12 text-right tabular-nums text-[color:var(--m-text-primary)]">{value}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={value}
                      disabled={!band.open && !held}
                      onChange={(e) => setTargets((t) => ({ ...t, [band.band]: Number(e.target.value) }))}
                      className="w-full accent-[color:var(--m-primary)]"
                      aria-label={`Target share for band ${band.band}`}
                    />
                  </label>
                );
              })}
              {poolBands === null && <p className="text-[13px] text-[color:var(--m-text-secondary)]">Reading the pool&apos;s bands…</p>}
            </div>

            <div className={cn("mt-4 flex items-center justify-between rounded-xl px-3.5 py-2.5 font-mono text-[12.5px] tabular-nums", whole ? "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]" : "bg-[color:var(--m-warning)]/10 text-[color:var(--m-text-primary)]")}>
              <span>Total</span>
              <span>{total}% {whole ? "" : "— must be 100%"}</span>
            </div>

            <button
              type="button"
              disabled={!whole || unchanged || pending || !account}
              onClick={() => void submit()}
              className="mt-4 min-h-[44px] w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[15px] font-semibold text-[color:var(--m-on-primary)] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.96] [transition-property:opacity,scale]"
            >
              {pending ? "Confirm in your wallet…" : "Apply distribution"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
