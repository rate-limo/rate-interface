"use client";

import type { PassTier, OwnedPass as OwnedPassData } from "@/lib/ogpass/types";
import { PassVisual } from "./PassVisual";

interface OwnedPassProps {
  owned: OwnedPassData;
  /** the tier config the pass was minted from — carries `supply` (OwnedPass doesn't). */
  tier: PassTier;
  /** short display address of the holding wallet, e.g. "0x51a7…c4e9". */
  holder: string;
}

const statBox =
  "rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[18px] py-4 shadow-sm";
const statKey =
  "flex items-center gap-[7px] font-mono text-[10.5px] uppercase tracking-[0.05em] text-[color:var(--m-text-secondary-2)]";

export function OwnedPass({ owned, tier, holder }: OwnedPassProps) {
  const gasRemaining = Math.max(0, owned.gasBudgetUsd - owned.gasUsedUsd);
  const gasPct = owned.gasBudgetUsd > 0 ? Math.round((gasRemaining / owned.gasBudgetUsd) * 100) : 0;

  return (
    <div className="grid items-start gap-7 max-[760px]:grid-cols-1 min-[761px]:grid-cols-[340px_1fr]">
      <div>
        <PassVisual tierName={owned.tierName} number={owned.number} subline={`held by ${holder}`} />
        {owned.passkeyEnabled && (
          <div className="mt-3 rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[18px] py-4 shadow-sm">
            <div className="flex items-center gap-[10px] text-[13px]">
              <span className="h-[9px] w-[9px] rounded-full bg-[color:var(--m-success)]" />
              <b className="font-semibold">Passkey login enabled</b> · Turnkey
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--m-text-secondary)]">
              Signed in with Face ID — no seed phrase on this device.
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className={statBox}>
          <div className={statKey}>
            <span className="text-[color:var(--m-logo)]">⛽</span> Gas sponsorship
          </div>
          <div className="mt-[5px] text-[22px] font-semibold tabular-nums text-[color:var(--m-logo)]">
            ${gasRemaining.toLocaleString()}{" "}
            <span className="text-[13px] font-normal text-[color:var(--m-text-secondary)]">
              of ${owned.gasBudgetUsd.toLocaleString()} left
            </span>
          </div>
          <div className="mt-[9px] h-2 overflow-hidden rounded-[5px] bg-[color:var(--m-surface-2)]">
            <span
              className="block h-full [background:linear-gradient(90deg,var(--m-logo),color-mix(in_srgb,var(--m-logo)_70%,var(--m-accent)))]"
              style={{ width: `${gasPct}%` }}
            />
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--m-text-secondary)]">
            ${owned.gasUsedUsd.toLocaleString()} used this season · refills each season · gasless while it lasts
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={statBox}>
            <div className={statKey}>Tier</div>
            <div className="mt-[5px] text-[22px] font-semibold tabular-nums">{owned.tierName}</div>
            <div className="mt-[2px] text-[12px] text-[color:var(--m-text-secondary)]">
              {owned.number.split("·").pop()?.trim()} of {tier.supply.toLocaleString()}
            </div>
          </div>
          <div className={statBox}>
            <div className={statKey}>Points boost</div>
            <div className="mt-[5px] text-[22px] font-semibold tabular-nums text-[color:var(--m-logo)]">
              +{owned.pointsBoostPct}%
            </div>
            <div className="mt-[2px] text-[12px] text-[color:var(--m-text-secondary)]">on every epoch</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={statBox}>
            <div className={statKey}>Fee discount</div>
            <div className="mt-[5px] text-[22px] font-semibold tabular-nums text-[color:var(--m-logo)]">
              −{owned.feeDiscountPct}%
            </div>
            <div className="mt-[2px] text-[12px] text-[color:var(--m-text-secondary)]">maker &amp; taker</div>
          </div>
          <div className={statBox}>
            <div className={statKey}>Since</div>
            <div className="mt-[5px] text-[18px] font-semibold">pre-launch</div>
            <div className="mt-[2px] text-[12px] text-[color:var(--m-text-secondary)]">minted before open</div>
          </div>
        </div>
      </div>
    </div>
  );
}
