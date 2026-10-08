"use client";

import { AppToaster } from "@/components/Shell/AppToaster";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { rewardsData, SOURCE_COLOR } from "@/lib/rewards/mock";
import { epochPoints, pointsToOg } from "@/lib/rewards/types";
import { EpochBarChart } from "./EpochBarChart";
import { EpochsTable } from "./EpochsTable";
import { LiquiditySparkline } from "./LiquiditySparkline";
import { ReferralPanel } from "./ReferralPanel";
import { RewardsNotes } from "./RewardsNotes";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function ClaimView({ networkSlug }: { networkSlug: string }) {
  const { isConnected } = useAccount();
  const { open } = useWalletConnect();
  const [heroClaimed, setHeroClaimed] = useState(false);

  const data = rewardsData();
  const { rate, epochs, referral, season, epoch, epochsInSeason } = data;

  const claimablePts = epochs
    .filter((e) => e.status === "claimable")
    .reduce((s, e) => s + epochPoints(e), 0);
  const claimableOg = pointsToOg(claimablePts, rate);
  const totalPts = epochs.reduce((s, e) => s + epochPoints(e), 0);
  const totalOg = pointsToOg(totalPts, rate);
  const now = epochs[epochs.length - 1];
  const nowPts = epochPoints(now);
  const maxPts = Math.max(...epochs.map(epochPoints));

  const onHeroClaim = () => {
    if (heroClaimed || claimablePts === 0) return;
    setHeroClaimed(true);
    toast.success(`Claimed ${fmt(claimableOg)} $OG`, {
      description: `${fmt(claimablePts)} pts across claimable epochs`,
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1080px] px-[22px] pt-12 pb-24">
      <AppToaster />

      {/* Header */}
      <header>
        <p className="mb-3.5 flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-[color:var(--m-primary)]">
          <span className="font-bold text-[color:var(--m-logo)]">Rate</span> · rewards · claim
        </p>
        <h1 className="mb-2 text-[clamp(27px,3.6vw,40px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--m-text-primary)]">
          Claim <span className="font-bold text-[color:var(--m-logo)]">$OG</span>
        </h1>
        <p className="mb-[22px] max-w-[72ch] text-[15.5px] text-[color:var(--m-text-secondary)]">
          Every week you earn <b className="text-[color:var(--m-text-primary)]">points</b> from three
          things — your <b className="text-[color:var(--m-text-primary)]">trading volume</b>, the{" "}
          <b className="text-[color:var(--m-text-primary)]">liquidity you provide</b>, and your{" "}
          <b className="text-[color:var(--m-text-primary)]">referrals</b> — then{" "}
          <b className="text-[color:var(--m-text-primary)]">claim $OG</b> with them at the season
          rate. Unclaimed weeks stack up here. Season {season} · epoch {epoch} of {epochsInSeason}.
        </p>
      </header>

      {!isConnected ? (
        <ConnectGate onConnect={() => open()} />
      ) : (
        <>
          {/* Hero */}
          <div className="mb-3.5 grid grid-cols-1 gap-4 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-[color:var(--m-border)] bg-[linear-gradient(150deg,var(--m-surface),color-mix(in_srgb,var(--m-logo)_8%,var(--m-surface)))] p-[22px_24px] shadow-md">
              <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-[color:var(--m-text-secondary)]">
                Claimable now
              </div>
              <div className="mt-1.5 mb-0.5 flex items-baseline gap-2.5 text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums text-[color:var(--m-text-primary)]">
                {fmt(claimablePts)}
                <span className="text-[18px] font-bold text-[color:var(--m-logo)]">pts</span>
              </div>
              <div className="text-[12.5px] text-[color:var(--m-text-secondary)]">
                = {fmt(claimableOg)} $OG · rate {rate} pts = 1 $OG
              </div>
              <button
                type="button"
                onClick={onHeroClaim}
                disabled={heroClaimed}
                className={cn(
                  "mt-4 inline-flex items-center gap-2.5 rounded-[13px] px-6 py-3 font-sans text-[15px] font-semibold transition-[filter] motion-reduce:transition-none",
                  heroClaimed
                    ? "cursor-default border border-[color:var(--m-logo)] bg-transparent text-[color:var(--m-logo)]"
                    : "cursor-pointer border-0 bg-[color:var(--m-logo)] text-white hover:brightness-110",
                )}
              >
                {heroClaimed
                  ? `✓ Claimed ${fmt(claimableOg)} $OG`
                  : `◆ Claim ${fmt(claimableOg)} $OG`}
              </button>
              <div className="mt-2.5 text-[11.5px] text-[color:var(--m-text-secondary)]">
                ⧗ This epoch unlocks in{" "}
                <b className="text-[color:var(--m-text-primary)]">3d 14h</b>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <HeroStat
                k="Earned · all time"
                v={fmt(totalPts)}
                sub={`≈ ${fmt(totalOg)} $OG · ${epochs.length} epochs · 3 sources`}
              />
              <HeroStat
                k="This epoch · accruing"
                v={fmt(nowPts)}
                boost={`◆ +${referral.boostPct}% referral boost`}
              />
            </div>
          </div>

          {/* This-epoch source strip */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SourceCard
              color={SOURCE_COLOR.trading}
              title="Trading"
              earn={now.tradingPts}
              drive={`$${fmt(now.volumeUsd)}`}
              caption="volume this epoch"
            />
            <SourceCard
              color={SOURCE_COLOR.liquidity}
              title="Liquidity"
              earn={now.liquidityPts}
              drive={`$${fmt(now.liquidityUsd)}`}
              caption="liquidity balance · avg this epoch"
            >
              <LiquiditySparkline values={epochs.map((e) => e.liquidityUsd)} />
            </SourceCard>
            <SourceCard
              color={SOURCE_COLOR.referral}
              title="Referrals"
              earn={now.referralPts}
              drive={`+${referral.boostPct}%`}
              driveSuffix="boost"
              caption={`${referral.active} active · tier ${referral.tier} · +${now.referralPts} pts this epoch`}
            />
          </div>

          {/* Chart + referrals */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_316px]">
            <div className="rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
              <div className="flex items-baseline gap-2.5 px-[18px] pt-4 pb-0.5">
                <h3 className="text-[15px] font-semibold text-[color:var(--m-text-primary)]">
                  $OG earned per epoch
                </h3>
                <span className="ml-auto font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                  by source
                </span>
              </div>
              <div className="flex flex-wrap gap-3.5 px-[18px] pt-2 text-[11px] text-[color:var(--m-text-secondary)]">
                <LegendItem color={SOURCE_COLOR.trading} label="Trading" />
                <LegendItem color={SOURCE_COLOR.liquidity} label="Liquidity" />
                <LegendItem color={SOURCE_COLOR.referral} label="Referral" />
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-[color:var(--m-logo)] bg-transparent" />
                  this epoch
                </span>
              </div>
              <EpochBarChart epochs={epochs} maxPoints={maxPts} />
              <div className="mt-1.5 flex justify-between border-t border-[color:var(--m-border)] px-[18px] pt-2 pb-3.5 font-mono text-[10px] text-[color:var(--m-text-secondary)]">
                <span>trading + liquidity + referral, per week</span>
                <span>max {fmt(maxPts)} pts/wk</span>
              </div>
            </div>

            <ReferralPanel referral={referral} />
          </div>

          {/* Epoch table */}
          <EpochsTable epochs={epochs} rate={rate} />

          {/* Notes */}
          <RewardsNotes rate={rate} />
        </>
      )}
    </div>
  );
}

function ConnectGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[56px_24px] text-center shadow-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--m-text-secondary)]">
        wallet required
      </div>
      <p className="max-w-[42ch] text-[15px] text-[color:var(--m-text-secondary)]">
        Connect your wallet to see your <b className="text-[color:var(--m-text-primary)]">$OG</b>{" "}
        rewards — claimable points, per-epoch breakdown, and referrals.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex cursor-pointer items-center gap-2.5 rounded-[13px] border-0 bg-[color:var(--m-logo)] px-6 py-3 text-[15px] font-semibold text-white transition-[filter] hover:brightness-110 motion-reduce:transition-none"
      >
        Connect wallet
      </button>
    </div>
  );
}

function HeroStat({
  k,
  v,
  sub,
  boost,
}: {
  k: string;
  v: string;
  sub?: string;
  boost?: string;
}) {
  return (
    <div className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[15px_18px] shadow-sm">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-[color:var(--m-text-secondary)]">
        {k}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 text-[22px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
        {v}
        <span className="text-[13px] font-bold text-[color:var(--m-logo)]">pts</span>
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11.5px] text-[color:var(--m-text-secondary)]">{sub}</div>
      ) : null}
      {boost ? (
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--m-logo)_12%,transparent)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--m-logo)]">
          {boost}
        </span>
      ) : null}
    </div>
  );
}

function SourceCard({
  color,
  title,
  earn,
  drive,
  driveSuffix,
  caption,
  children,
}: {
  color: string;
  title: string;
  earn: number;
  drive: string;
  driveSuffix?: string;
  caption: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[15px_16px] shadow-sm">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[color:var(--m-text-secondary)]">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
        {title}
      </div>
      <div className="absolute right-4 top-[15px] text-right">
        <div className="font-mono text-[16px] font-semibold text-[color:var(--m-logo)] tabular-nums">
          {earn.toLocaleString("en-US")}
        </div>
        <div className="font-mono text-[9.5px] text-[color:var(--m-text-secondary)]">
          points · epoch
        </div>
      </div>
      <div className="mt-[7px] mb-px text-[19px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
        {drive}
        {driveSuffix ? (
          <span className="text-[12px] font-normal text-[color:var(--m-text-secondary)]">
            {" "}
            {driveSuffix}
          </span>
        ) : null}
      </div>
      <div className="text-[11.5px] text-[color:var(--m-text-secondary)]">{caption}</div>
      {children}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
