"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { IndexerData } from "@/lib/portfolio/types";
import { ChainChip, Pill, TH, TD, NUM } from "./parts";

const PTS = "font-mono font-semibold tabular-nums text-[color:var(--m-logo)]";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function Referrals({ data }: { data: IndexerData }) {
  const { summary, rows } = data.referrals;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(`https://${summary.link}`);
      setCopied(true);
      toast.success("Referral link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const stats = [
    { k: "Referred", v: String(summary.referred), pts: false },
    { k: "Active", v: String(summary.active), pts: false },
    { k: "Earned", v: `${fmt(summary.earnedPts)} pts`, pts: true },
    // Was "Tier N · X%". There is no tier — tEarnConfig has a per-attested-
    // referee boost with a ceiling, so the stat names the boost and its cap.
    {
      k: "Boost",
      v: `${summary.boostPct}%${summary.maxBoostPct ? ` of ${summary.maxBoostPct}%` : ""}`,
      pts: false,
    },
  ];

  return (
    <>
      {/* link block */}
      <div className="m-3.5 mb-1.5 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <b className="font-mono text-sm font-semibold">{summary.link}</b>
          <span className="font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
            code · {summary.code}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="ml-auto rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-on-primary)]"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>

      {/* stat row */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-1 pt-2">
        {stats.map((s) => (
          <div key={s.k}>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {s.k}
            </div>
            <div
              className={
                s.pts
                  ? `${PTS} mt-0.5 text-base`
                  : "mt-0.5 text-base font-semibold tabular-nums"
              }
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Friend", "Chain", "Joined", "Their volume", "You earned", "Status"].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                <td className={`${TD} ${NUM}`}>{r.friend}</td>
                <td className={TD}>
                  {r.network ? (
                    <ChainChip network={r.network} />
                  ) : (
                    <span className="text-[color:var(--m-text-secondary-2)]">—</span>
                  )}
                </td>
                <td className={`${TD} ${NUM} text-[color:var(--m-text-secondary-2)]`}>
                  {r.joined}
                </td>
                <td className={`${TD} ${NUM}`}>${r.theirVolumeUsd}</td>
                <td className={`${TD} ${PTS}`}>{fmt(r.earnedPts)}</td>
                <td className={TD}>
                  <Pill tone={r.status === "Active" ? "success" : "muted"}>{r.status}</Pill>
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
              <b className="font-mono text-sm font-semibold">{r.friend}</b>
              {r.network && <ChainChip network={r.network} />}
              <span className="ml-auto">
                <Pill tone={r.status === "Active" ? "success" : "muted"}>{r.status}</Pill>
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <KV k="Joined" v={r.joined} />
              <KV k="Their volume" v={`$${r.theirVolumeUsd}`} />
              <KV k="You earned" v={<span className={PTS}>{fmt(r.earnedPts)}</span>} />
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-3.5 pt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
        You earn {summary.cutPct}% of the trading fees your referrals pay, across every chain. Each
        referral that attests adds to your boost, up to {summary.maxBoostPct}%.
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        {k}
      </div>
      <div className="mt-0.5 font-mono tabular-nums">{v}</div>
    </div>
  );
}
