"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { IndexerData, RewardStatus } from "@/lib/portfolio/types";
import { ChainChip, Pill, TH, TD, NUM } from "./parts";

const PTS = "font-mono font-semibold tabular-nums text-[color:var(--m-logo)]";

function statusTone(s: RewardStatus): "primary" | "muted" {
  return s === "Claimed" ? "muted" : "primary";
}
function statusLabel(s: RewardStatus): string {
  return s === "Accruing" ? "Accruing" : s === "Claimed" ? "Claimed" : "Claimable";
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function Rewards({ data }: { data: IndexerData }) {
  const { summary, rows } = data.rewards;
  const [claimed, setClaimed] = useState<Record<number, boolean>>({});

  const claim = (i: number, pts: number) => {
    setClaimed((c) => ({ ...c, [i]: true }));
    toast.success(`Claimed ${fmt(pts)} pts`);
  };

  const summaryCards = (
    <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-1.5 pt-3.5 sm:grid-cols-3">
      {[
        { k: "Earned · all time", v: `${fmt(summary.earnedPts)} pts` },
        { k: "Claimable now", v: `${fmt(summary.claimablePts)} pts` },
        { k: `This epoch · ${summary.epoch}`, v: `${fmt(summary.epochPts)} pts` },
      ].map((c) => (
        <div
          key={c.k}
          className="rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3"
        >
          <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
            {c.k}
          </div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-[color:var(--m-logo)]">
            {c.v}
          </div>
        </div>
      ))}
    </div>
  );

  const note = (
    <div className="px-4 pb-3.5 pt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
      Points are testnet incentives, aggregated across chains. Claiming settles on the chain the
      reward was earned on.
    </div>
  );

  return (
    <>
      {summaryCards}

      {/* desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Source", "Chain", "Earned", "Epoch", "Status", ""].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                <td className={TD}>{r.source}</td>
                <td className={TD}>
                  {r.network ? (
                    <ChainChip network={r.network} />
                  ) : (
                    <span className="text-[color:var(--m-text-secondary-2)]">—</span>
                  )}
                </td>
                <td className={`${TD} ${PTS}`}>{fmt(r.earnedPts)}</td>
                <td className={`${TD} ${NUM} text-[color:var(--m-text-secondary)]`}>{r.epoch}</td>
                <td className={TD}>
                  <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                </td>
                <td className={TD}>
                  {r.status === "Claimable" &&
                    (claimed[i] ? (
                      <span className="font-mono text-[11.5px] text-[color:var(--m-success)]">
                        Claimed ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => claim(i, r.earnedPts)}
                        className="rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-2.5 py-1 font-mono text-[11.5px] text-[color:var(--m-on-primary)]"
                      >
                        Claim
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3.5"
          >
            <div className="flex items-center gap-2">
              <b className="text-sm font-semibold">{r.source}</b>
              {r.network && <ChainChip network={r.network} />}
              <span className="ml-auto">
                <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
              </span>
            </div>
            <div className="mt-2.5 flex items-end justify-between">
              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
                  Earned · epoch {r.epoch}
                </div>
                <div className={`${PTS} text-base`}>{fmt(r.earnedPts)}</div>
              </div>
              {r.status === "Claimable" &&
                (claimed[i] ? (
                  <span className="font-mono text-xs text-[color:var(--m-success)]">Claimed ✓</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => claim(i, r.earnedPts)}
                    className="rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-3 py-1.5 font-mono text-xs text-[color:var(--m-on-primary)]"
                  >
                    Claim
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {note}
    </>
  );
}
