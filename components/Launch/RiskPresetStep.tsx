"use client";

import { cn } from "@/lib/utils";
import type { LaunchProfile } from "@/lib/launch/types";
import { Callout, GhostButton, Panel, PrimaryButton } from "./parts";

const PRESETS: Array<{
  key: LaunchProfile;
  label: string;
  value: number;
  description: string;
  path: string;
}> = [
  { key: "stable", label: "Stable", value: 0.05, description: "Tightly priced, low-volatility markets.", path: "M4 35 C24 34 40 32 58 31 S92 29 116 28" },
  { key: "standard", label: "Standard", value: 0.1, description: "Balanced protection for established assets.", path: "M4 36 C20 35 33 27 49 30 S72 22 87 27 S104 20 116 22" },
  { key: "uniswap", label: "Uniswap tick", value: 0.5, description: "More room for active onchain price movement.", path: "M4 38 C16 34 25 18 38 29 S57 12 69 25 S88 8 99 21 S109 14 116 16" },
  { key: "meme", label: "Meme", value: 1, description: "Wide tolerance for highly volatile launches.", path: "M4 39 L16 29 L27 37 L39 12 L51 31 L65 8 L77 35 L90 15 L102 29 L116 5" },
];

export function RiskPresetStep({
  kind,
  value,
  profile,
  onChange,
  onBack,
  onContinue,
}: {
  kind: "volatility" | "fee";
  value: number;
  profile: LaunchProfile | "custom";
  onChange: (value: number, profile: LaunchProfile | "custom") => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isFee = kind === "fee";
  const title = isFee ? "Set the market fee" : "Set volatility protection";
  const body = isFee
    ? "Choose the trading fee that fits this market. More volatile assets generally need a wider fee to support liquidity."
    : "Choose the maximum slippage permitted at launch. The curve previews show how much price movement each profile expects.";

  return (
    <Panel className="mx-auto max-w-[820px]" title={title}>
      <p className="mb-5 max-w-[66ch] text-[13px] leading-6 text-[var(--m-text-secondary)]">{body}</p>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => {
          const selected = profile === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(preset.value, preset.key)}
              className={cn(
                "min-h-[176px] rounded-[13px] border p-3 text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)]",
                selected
                  ? "border-[var(--m-primary)] bg-[var(--m-surface-selected)]"
                  : "border-[var(--m-border)] bg-[var(--m-surface-2)] hover:border-[color:color-mix(in_srgb,var(--m-primary)_45%,var(--m-border))]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--m-text-primary)]">{preset.label}</span>
                <span className="font-mono text-[12px] font-semibold text-[var(--m-primary-fg)]">{preset.value.toFixed(2)}%</span>
              </div>
              <svg viewBox="0 0 120 44" className="mt-4 h-11 w-full" role="img" aria-label={`${preset.label} volatility curve`}>
                <path d="M4 38 H116" fill="none" stroke="var(--m-border)" strokeWidth="1" strokeDasharray="3 3" />
                <path d={preset.path} fill="none" stroke="var(--m-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-3 text-[11px] leading-[1.45] text-[var(--m-text-secondary)]">{preset.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-[var(--m-text-primary)]">Customize</p>
            <p className="mt-0.5 text-[11px] text-[var(--m-text-secondary)]">0.05% minimum · 3.00% maximum</p>
          </div>
          <span className="font-mono text-[18px] font-medium tabular-nums text-[var(--m-text-primary)]">{value.toFixed(2)}%</span>
        </div>
        <input
          aria-label={isFee ? "Custom market fee" : "Custom slippage limit"}
          type="range"
          min="0.05"
          max="3"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value), "custom")}
          className="mt-4 h-2 w-full cursor-pointer accent-[var(--m-primary)]"
        />
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--m-text-secondary-2)]">
          <span>0.05%</span><span>3.00%</span>
        </div>
      </div>

      <Callout>
        The creator can change this {isFee ? "fee" : "volatility setting"} later as the market matures.
      </Callout>
      <PrimaryButton
        dataTestId={isFee ? "launch-step-fee" : "launch-step-volatility"}
        onClick={onContinue}
      >
        Continue
      </PrimaryButton>
      <GhostButton onClick={onBack}>Back</GhostButton>
    </Panel>
  );
}
