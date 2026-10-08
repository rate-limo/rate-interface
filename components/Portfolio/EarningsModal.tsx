"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Gift, Mail, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { IndexerData } from "@/lib/portfolio/types";
import { SeasonNotice } from "@/components/Rewards/SeasonNotice";

/**
 * What this wallet has earned that is not trading PnL — referrals and creator rewards,
 * in one place.
 *
 * ## The units are POINTS, and that is not a stand-in for dollars
 *
 * The reference this was built from shows `$0` throughout. This venue's referral and
 * reward accrual is denominated in POINTS: `ReferralSummary.earnedPts`,
 * `RewardSummary.earnedPts` / `claimablePts`. There is no USD figure behind them and no
 * rate that converts one — so a `$` here would be a number the accrual cannot back, which
 * is the same rule `LeaderboardColumn` states as "points are a count, dollars are a
 * currency; one board cannot format both".
 *
 * Creator rewards are the exception in the other direction: they are real token amounts,
 * but in TWO currencies (a band position earns in whatever the taker paid), and
 * `RewardsPanel` refuses to sum them into one figure because a freshly graduated coin
 * frequently has no price for one leg. So this shows the claimable COUNT and hands off to
 * that panel rather than inventing a total.
 *
 * ## The referral share is read, never assumed
 *
 * `cutPct` comes from admin-service, computed from the same `tEarnConfig` the accrual
 * uses. The banner says whatever that config currently says — hardcoding "25%" here would
 * be a promise the payout does not have to keep, and the summary's own docstring records
 * that a "tier" the accrual never had was previously displayed for exactly that reason.
 */
export function EarningsModal({
  data,
  open,
  onOpenChange,
  onOpenRewards,
  onOpenReferrals,
}: {
  data: IndexerData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Jump to the Rewards tab — this modal summarises, the tab itemises. */
  onOpenRewards?: () => void;
  onOpenReferrals?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const referrals = data.referrals.summary;
  const rewards = data.rewards.summary;
  const totalPts = referrals.earnedPts + rewards.earnedPts;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referrals.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen and selectable; claiming a copy that did not happen is
      // the only wrong answer.
      toast.info("Copy is unavailable here", { description: referrals.link });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(480px,94vw)] max-w-none overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-[17px]">Earnings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-1 pb-1 pt-2">
          <span className="text-[13px] text-[color:var(--m-text-secondary)]">Total earned</span>
          <span className="font-dm-mono text-[40px] font-bold leading-none tabular-nums text-[color:var(--m-text-primary)]">
            {totalPts.toLocaleString("en-US")}
          </span>
          <span className="text-[13px] text-[color:var(--m-text-secondary)]">
            {/* This epoch, not "this week": the accrual's period is the rewards epoch
                (Monday 00:00 UTC — see `epochEndsAt`), and calling it a week would be
                right only by coincidence. */}
            <span className="font-medium text-[color:var(--m-success)]">
              +{rewards.epochPts.toLocaleString("en-US")}
            </span>{" "}
            points this epoch
          </span>
          <SeasonNotice compact className="mt-1.5 text-center" />
        </div>

        {/* The referral offer, and the link under it as one block — the banner states the
            deal, the row is how you act on it. */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--m-border)]">
          <div className="flex items-center justify-center gap-2 bg-[color:var(--m-primary)] px-4 py-3 text-center">
            <Gift aria-hidden className="h-4 w-4 shrink-0 text-[color:var(--m-on-primary)]" />
            <span className="text-[13.5px] font-semibold text-[color:var(--m-on-primary)]">
              Refer and earn {referrals.cutPct}% of the order-book fees your friends pay, as points
            </span>
          </div>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-3 bg-[color:var(--m-surface-2)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--m-surface-selected)]"
          >
            {/* The code is the part worth reading; the origin around it is not. */}
            <span className="min-w-0 flex-1 truncate font-dm-mono text-[13px] text-[color:var(--m-text-secondary)]">
              {referrals.link.replace(/^https?:\/\//, "").replace(referrals.code, "")}
              <span className="font-semibold text-[color:var(--m-text-primary)]">
                {referrals.code}
              </span>
            </span>
            <span className="shrink-0 text-[color:var(--m-text-secondary)]">
              {copied ? (
                <Check className="h-4 w-4 text-[color:var(--m-success)]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </span>
          </button>
        </div>
        <span aria-live="polite" className="sr-only">
          {copied ? "Referral link copied" : ""}
        </span>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenReferrals?.();
            }}
            className="flex flex-col gap-1 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3.5 text-left transition-colors hover:border-[color:var(--m-primary)]"
          >
            <span className="flex items-center gap-1.5">
              <Mail aria-hidden className="h-3.5 w-3.5 text-[color:var(--m-text-secondary)]" />
              <span className="text-[13px] font-medium text-[color:var(--m-text-primary)]">
                Referrals
              </span>
              <span className="rounded-md bg-[color:var(--m-surface-selected)] px-1.5 py-0.5 font-dm-mono text-[10px] text-[color:var(--m-primary)]">
                {referrals.cutPct}%
              </span>
            </span>
            <span className="font-dm-mono text-[22px] font-bold leading-none tabular-nums text-[color:var(--m-text-primary)]">
              {referrals.earnedPts.toLocaleString("en-US")}
            </span>
            <span className="text-[11.5px] text-[color:var(--m-text-secondary-2)]">
              {referrals.referred} referred
              {referrals.active > 0 ? ` · ${referrals.active} active` : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenRewards?.();
            }}
            className="flex flex-col gap-1 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3.5 text-left transition-colors hover:border-[color:var(--m-primary)]"
          >
            <span className="flex items-center gap-1.5">
              <ScrollText aria-hidden className="h-3.5 w-3.5 text-[color:var(--m-text-secondary)]" />
              <span className="text-[13px] font-medium text-[color:var(--m-text-primary)]">
                Creator rewards
              </span>
            </span>
            <span className="font-dm-mono text-[22px] font-bold leading-none tabular-nums text-[color:var(--m-text-primary)]">
              {rewards.earnedPts.toLocaleString("en-US")}
            </span>
            <span className="text-[11.5px] text-[color:var(--m-text-secondary-2)]">
              {rewards.claimablePts > 0
                ? `${rewards.claimablePts.toLocaleString("en-US")} claimable`
                : "Nothing claimable"}
            </span>
          </button>
        </div>

        <p className="mt-4 text-center text-[12.5px] leading-5 text-[color:var(--m-text-secondary)]">
          Invite your friends to start earning {referrals.cutPct}% of the order-book fees they pay, as
          points.
        </p>
      </DialogContent>
    </Dialog>
  );
}
