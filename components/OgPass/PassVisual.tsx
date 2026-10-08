"use client";

import { cn } from "@/lib/utils";

interface PassVisualProps {
  /** display tier name, e.g. "Founder" — shown uppercased on the pass badge. */
  tierName: string;
  /** display pass number, e.g. "0000 · 0312". */
  number: string;
  /** the line under OG PASS — "season 1 · pre-launch" on the sale pass, "held by 0x…" when owned. */
  subline: string;
  className?: string;
}

/**
 * The OG Pass visual.
 *
 * Intentionally always dark/emerald — it is a physical-feeling membership pass,
 * not a themed surface — so its colours are hardcoded and do NOT follow the
 * Monet `--m-*` tokens (unlike every other surface on the page).
 */
export function PassVisual({ tierName, number, subline, className }: PassVisualProps) {
  return (
    <div className={cn("[perspective:1200px]", className)}>
      <div
        className={cn(
          "relative flex aspect-[1.586] w-full flex-col overflow-hidden rounded-[18px] px-6 py-[22px] text-[#E9F6EF]",
          "[background:radial-gradient(120%_140%_at_78%_8%,#0b6b4c_0%,#074632_42%,#03150e_100%)]",
          "[box-shadow:0_20px_50px_-18px_rgba(3,21,14,.7),0_0_0_1px_rgba(255,255,255,.06)_inset]"
        )}
      >
        {/* holographic shine sweep */}
        <div className="pointer-events-none absolute inset-0 [background:linear-gradient(120deg,transparent_30%,rgba(255,255,255,.10)_48%,transparent_62%)]" />
        {/* holo glow */}
        <div className="absolute -right-[30px] -bottom-[30px] h-[150px] w-[150px] rounded-full blur-[4px] [background:radial-gradient(circle,rgba(127,232,182,.35),transparent_60%)]" />

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]">
            off<span className="text-[#7fe8b6]">·</span>grid
          </span>
          <span className="rounded-full border border-white/25 px-[10px] py-[3px] font-mono text-[11px] uppercase tracking-[0.12em]">
            {tierName.toUpperCase()}
          </span>
        </div>

        <div className="relative mt-auto">
          <div className="text-[clamp(26px,4.5vw,38px)] font-semibold leading-none tracking-[0.02em]">
            RATE
          </div>
          <div className="mt-[6px] font-mono text-[11px] tracking-[0.04em] text-[#9fd8bd]">
            {subline}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <span className="font-mono text-[12.5px] tabular-nums tracking-[0.18em]">
            {number}
          </span>
          <span className="h-[26px] w-[34px] rounded-[6px] opacity-90 [background:linear-gradient(135deg,#d9c56a,#a9862f)]" />
        </div>
      </div>
    </div>
  );
}
