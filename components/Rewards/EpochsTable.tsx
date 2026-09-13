"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SOURCE_COLOR } from "@/lib/rewards/mock";
import { epochPoints, pointsToOg, type EpochRow, type EpochStatus } from "@/lib/rewards/types";

const fmt = (n: number) => n.toLocaleString("en-US");

const PILL: Record<EpochStatus, { label: string; className: string; dot: string }> = {
  claimable: {
    label: "Claimable",
    className: "text-[color:var(--m-logo)] bg-[color:color-mix(in_srgb,var(--m-logo)_14%,transparent)]",
    dot: "var(--m-logo)",
  },
  claimed: {
    label: "Claimed",
    className: "text-[color:var(--m-text-secondary)] bg-[color:var(--m-surface-2)]",
    dot: "var(--m-text-secondary)",
  },
  accruing: {
    label: "Accruing",
    className: "text-[color:var(--m-primary)] bg-[color:color-mix(in_srgb,var(--m-primary)_14%,transparent)]",
    dot: "var(--m-primary)",
  },
};

/** Per-epoch breakdown table: volume, liquidity, per-source points, status, claim. */
export function EpochsTable({ epochs, rate }: { epochs: EpochRow[]; rate: number }) {
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const rows = [...epochs].reverse();

  const onClaim = (e: EpochRow) => {
    setClaimed((prev) => new Set(prev).add(e.label));
    toast.success(`Claimed ${fmt(pointsToOg(epochPoints(e), rate))} $OG`, {
      description: `${e.label} · ${fmt(epochPoints(e))} pts`,
    });
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr>
            {["Epoch", "Volume", "Liquidity", "Trading", "Liq", "Ref", "Points", "Status", ""].map(
              (h, i) => (
                <th
                  key={h || `h${i}`}
                  className={cn(
                    "border-b border-[color:var(--m-border)] p-[11px_16px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--m-text-secondary)]",
                    i === 0 ? "text-left" : "text-right",
                  )}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const total = epochPoints(e);
            const pill = PILL[e.status];
            const isClaimed = claimed.has(e.label);
            return (
              <tr
                key={e.label}
                className="transition-colors last:[&>td]:border-b-0 hover:bg-[color:var(--m-surface-2)] motion-reduce:transition-none"
              >
                <td className="border-b border-[color:var(--m-border)] p-[11px_16px] text-left font-mono text-[color:var(--m-text-primary)]">
                  {e.label}
                </td>
                <Num>{`$${fmt(e.volumeUsd)}`}</Num>
                <Num>{`$${fmt(e.liquidityUsd)}`}</Num>
                <Num color={SOURCE_COLOR.trading}>{fmt(e.tradingPts)}</Num>
                <Num color={SOURCE_COLOR.liquidity}>{fmt(e.liquidityPts)}</Num>
                <Num color={SOURCE_COLOR.referral}>{fmt(e.referralPts)}</Num>
                <td className="border-b border-[color:var(--m-border)] p-[11px_16px] text-right font-mono font-semibold tabular-nums text-[color:var(--m-logo)]">
                  {fmt(total)}
                </td>
                <td className="border-b border-[color:var(--m-border)] p-[11px_16px] text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold",
                      pill.className,
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />
                    {pill.label}
                  </span>
                </td>
                <td className="border-b border-[color:var(--m-border)] p-[11px_16px] text-right">
                  {e.status === "claimable" && !isClaimed ? (
                    <button
                      type="button"
                      onClick={() => onClaim(e)}
                      className="cursor-pointer rounded-lg border-0 bg-[color:var(--m-logo)] px-[11px] py-[5px] text-[11px] font-semibold text-white hover:brightness-110 motion-reduce:transition-none"
                    >
                      Claim
                    </button>
                  ) : isClaimed ? (
                    <span className="font-mono text-[11px] font-semibold text-[color:var(--m-logo)]">
                      ✓
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Num({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td
      className="border-b border-[color:var(--m-border)] p-[11px_16px] text-right font-mono tabular-nums text-[color:var(--m-text-primary)]"
      style={color ? { color } : undefined}
    >
      {children}
    </td>
  );
}
