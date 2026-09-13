"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inviteLink, inviteUrl } from "@/lib/referral/link";
import type { ReferralSummary } from "@/lib/rewards/types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Referral card — shareable link + code with Copy, plus referral stats. */
export function ReferralPanel({ referral }: { referral: ReferralSummary }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(inviteUrl(referral.code));
      setCopied(true);
      toast.success("Referral link copied");
    } catch {
      toast.error("Couldn't copy — copy it manually");
    }
  };

  return (
    <div className="rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[16px_18px] shadow-sm">
      <h3 className="mb-3 text-[15px] font-semibold text-[color:var(--m-text-primary)]">
        Referrals
      </h3>

      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[12px_14px]">
        <div className="min-w-0">
          <b className="block overflow-hidden text-ellipsis font-mono text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
            {inviteLink(referral.code)}
          </b>
          <span className="font-mono text-[11px] text-[color:var(--m-text-secondary)]">
            code · {referral.code}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-[9px] px-3 py-2 font-mono text-[11.5px] font-semibold transition-colors motion-reduce:transition-none",
            copied
              ? "border border-[color:var(--m-logo)] bg-transparent text-[color:var(--m-logo)]"
              : "border-0 bg-[color:var(--m-primary)] text-white hover:brightness-110",
          )}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <RefStat k="Referred" v={fmt(referral.referred)} />
        <RefStat k="Active" v={fmt(referral.active)} />
        <RefStat k="Referral pts" v={fmt(referral.earnedPts)} og />
        <RefStat k={`Boost · tier ${referral.tier}`} v={`+${referral.boostPct}%`} og />
      </div>

      <div className="mt-3 rounded-[11px] border border-[color:color-mix(in_srgb,var(--m-logo)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--m-logo)_9%,transparent)] p-[11px_13px] text-[12px] text-[color:var(--m-text-primary)]">
        Referrals pay{" "}
        <b className="text-[color:var(--m-logo)]">twice</b>: a{" "}
        <b className="text-[color:var(--m-logo)]">cut of their points</b> and a{" "}
        <b className="text-[color:var(--m-logo)]">+{referral.boostPct}% boost</b> on both your
        trading <b className="text-[color:var(--m-logo)]">and</b> liquidity points.
      </div>
    </div>
  );
}

function RefStat({ k, v, og }: { k: string; v: string; og?: boolean }) {
  return (
    <div className="rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[11px_13px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-[color:var(--m-text-secondary)]">
        {k}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[17px] font-semibold tabular-nums",
          og ? "text-[color:var(--m-logo)]" : "text-[color:var(--m-text-primary)]",
        )}
      >
        {v}
      </div>
    </div>
  );
}
