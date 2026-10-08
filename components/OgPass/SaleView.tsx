"use client";

import { cn } from "@/lib/utils";
import type { PassTier, OgPassConfig, TierId } from "@/lib/ogpass/types";
import { PassVisual } from "./PassVisual";
import { useCountdown } from "./useCountdown";

interface SaleViewProps {
  config: OgPassConfig;
  selectedTier: PassTier;
  onSelectTier: (id: TierId) => void;
  isConnected: boolean;
  /** wallet not connected — open the connect modal. */
  onConnect: () => void;
  /** connected + sale live — mint the selected tier. */
  onBuy: () => void;
  /** capture pre-sale interest. */
  onNotify: () => void;
}

const BENEFITS = [
  { ic: "◆", h: "More points", p: "A permanent boost on every epoch's rewards — up to +50% by tier.", by: "→ multiplies trading + liquidity points" },
  { ic: "⚿", h: "Passkey login", p: "Sign in with Face ID or a passkey. No seed phrase, self-custodial.", by: "powered by Turnkey" },
  { ic: "⛽", h: "Gas sponsorship", p: "Trade gasless — we cover network fees up to your tier's limit.", by: "paymaster-sponsored" },
  { ic: "%", h: "Fee discount", p: "Lower maker & taker fees on every fill, up to −40%.", by: "stacks with volume tiers" },
];

function countdownLabel(c: ReturnType<typeof useCountdown>): string {
  if (!c.mounted) return "— — —";
  if (c.isLive) return "live now";
  const mm = String(c.minutes).padStart(2, "0");
  const ss = String(c.seconds).padStart(2, "0");
  return `${c.days}d ${c.hours}h ${mm}m ${ss}s`;
}

const sectionHeading =
  "m-0 mb-[14px] flex items-center gap-[11px] font-mono text-[12px] font-semibold uppercase tracking-[0.13em] text-[color:var(--m-text-secondary)] after:h-px after:flex-1 after:bg-[color:var(--m-border)] after:content-['']";

export function SaleView({
  config,
  selectedTier,
  onSelectTier,
  isConnected,
  onConnect,
  onBuy,
  onNotify,
}: SaleViewProps) {
  const countdown = useCountdown(config.saleStartsInSec);
  const live = countdown.isLive;
  const insider = config.tiers[0];

  // Single derived buy-button state — precedence: not-started → not-connected → buy.
  const buy = !live
    ? { label: "Sale not started", onClick: undefined, disabled: true }
    : !isConnected
      ? { label: "Connect wallet", onClick: onConnect, disabled: false }
      : { label: `Buy ${selectedTier.name} · ${selectedTier.priceEth}`, onClick: onBuy, disabled: false };

  const bannerText = !countdown.mounted
    ? "Rate membership — starts soon"
    : live
      ? `Rate membership is LIVE — ${insider.sold} joined`
      : `Rate membership — starts in ${countdown.days}d ${countdown.hours}h`;

  return (
    <div>
      {/* hero: pass + pitch */}
      <div className="mb-[26px] grid items-center gap-7 max-[760px]:grid-cols-1 min-[761px]:grid-cols-[340px_1fr]">
        <PassVisual
          tierName={selectedTier.name}
          number="0000 · 0312"
          subline={`season ${config.season} · pre-launch`}
        />
        <div>
          <h2 className="m-0 mb-[10px] text-[22px] font-semibold tracking-[-0.01em]">
            Mint before the app opens.
          </h2>
          <p className="m-0 mb-[14px] text-[14.5px] text-[color:var(--m-text-secondary)]">
            Rate membership is available ahead of launch. It&apos;s self-custodial — your
            benefits travel with your wallet the moment trading goes live.
          </p>
          <div
            className={cn(
              "inline-flex items-center gap-[10px] rounded-[12px] border px-[15px] py-[11px] text-[13px]",
              "border-[color:color-mix(in_srgb,var(--m-logo)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--m-logo)_10%,var(--m-surface))]"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                live
                  ? "bg-[color:var(--m-success)] [box-shadow:0_0_0_3px_color-mix(in_srgb,var(--m-success)_22%,transparent)]"
                  : "bg-[color:var(--m-warning)] [box-shadow:0_0_0_3px_color-mix(in_srgb,var(--m-warning)_22%,transparent)]"
              )}
            />
            <span>
              {live ? "Sale is " : "Sale starts in "}
              <b className="font-mono font-bold tabular-nums text-[color:var(--m-text-primary)]">
                {live ? "live now" : countdownLabel(countdown)}
              </b>
            </span>
            <button
              type="button"
              onClick={onNotify}
              className="ml-[6px] cursor-pointer rounded-[9px] border border-[color:var(--m-logo)] bg-transparent px-3 py-[7px] font-mono text-[12px] font-semibold text-[color:var(--m-logo)]"
            >
              Notify me
            </button>
          </div>
        </div>
      </div>

      {/* benefits */}
      <div className="mb-[26px] grid gap-3 max-[760px]:grid-cols-2 min-[761px]:grid-cols-4">
        {BENEFITS.map((b) => (
          <div
            key={b.h}
            className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[17px] py-4 shadow-sm"
          >
            <div className="mb-[10px] flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--m-logo)_13%,transparent)] text-[17px] text-[color:var(--m-logo)]">
              {b.ic}
            </div>
            <h3 className="m-0 mb-1 text-[14.5px] font-semibold">{b.h}</h3>
            <p className="m-0 text-[12.5px] leading-[1.45] text-[color:var(--m-text-secondary)]">{b.p}</p>
            <div className="mt-[7px] font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">{b.by}</div>
          </div>
        ))}
      </div>

      {/* pricing tiers */}
      <h2 className={sectionHeading}>Pick your tier</h2>
      <div className="grid gap-[14px] max-[760px]:grid-cols-1 min-[761px]:grid-cols-3">
        {config.tiers.map((t) => {
          const remaining = t.supply - t.sold;
          const remainingPct = Math.max(0, Math.min(100, Math.round((remaining / t.supply) * 100)));
          const selected = t.id === selectedTier.id;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => onSelectTier(t.id)}
              className={cn(
                "relative cursor-pointer rounded-[16px] border bg-[color:var(--m-surface)] p-5 text-left shadow-sm transition-[border-color,transform] duration-150 hover:border-[color:var(--m-logo)]",
                selected
                  ? "border-[color:var(--m-logo)] [box-shadow:0_0_0_1px_var(--m-logo)_inset]"
                  : "border-[color:var(--m-border)]"
              )}
            >
              {t.popular && (
                <span className="absolute -top-[10px] left-5 rounded-[6px] bg-[color:var(--m-logo)] px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--m-on-primary)]">
                  Most popular
                </span>
              )}
              <div className="text-[17px] font-semibold">{t.name}</div>
              <div className="mb-px mt-2 text-[26px] font-semibold tracking-[-0.02em]">{t.priceEth}</div>
              <div className="font-mono text-[12px] text-[color:var(--m-text-secondary-2)]">{t.priceUsd}</div>
              <ul className="mt-[15px] flex list-none flex-col gap-[9px] p-0">
                <li className="flex items-center gap-[9px] text-[13px]">
                  <span className="font-bold text-[color:var(--m-logo)]">◆</span> Points{" "}
                  <b className="font-mono font-semibold">+{t.pointsBoostPct}%</b>
                </li>
                <li className="flex items-center gap-[9px] text-[13px]">
                  <span className="font-bold text-[color:var(--m-logo)]">⛽</span> Gas{" "}
                  <b className="font-mono font-semibold">${t.gasBudgetUsd.toLocaleString()}</b> sponsored
                </li>
                <li className="flex items-center gap-[9px] text-[13px]">
                  <span className="font-bold text-[color:var(--m-logo)]">%</span> Fees{" "}
                  <b className="font-mono font-semibold">−{t.feeDiscountPct}%</b>
                </li>
                <li className="flex items-center gap-[9px] text-[13px]">
                  <span className="font-bold text-[color:var(--m-logo)]">⚿</span> Passkey login
                </li>
              </ul>
              <div className="mt-[14px] font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                {remaining.toLocaleString()} of {t.supply.toLocaleString()} left
              </div>
              <div className="mt-[5px] h-[5px] overflow-hidden rounded-[3px] bg-[color:var(--m-surface-2)]">
                <span className="block h-full bg-[color:var(--m-logo)]" style={{ width: `${remainingPct}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* buy bar */}
      <div className="mt-[18px] flex flex-wrap items-center gap-[14px] rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[18px] py-4 shadow-sm">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-[color:var(--m-text-secondary-2)]">
            Selected
          </div>
          <div className="text-[15px]">
            {selectedTier.name} · <b className="font-mono font-bold">{selectedTier.priceEth}</b>
          </div>
        </div>
        <button
          type="button"
          onClick={buy.onClick}
          disabled={buy.disabled}
          className={cn(
            "ml-auto rounded-[12px] border-0 bg-[color:var(--m-logo)] px-[26px] py-[13px] text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:brightness-110",
            buy.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
        >
          {buy.label}
        </button>
      </div>

      {/* landing notice preview */}
      <h2 className={cn(sectionHeading, "mt-[26px]")}>On the landing page</h2>
      <div className="overflow-hidden rounded-[16px] border border-[color:var(--m-border)] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-[13px] py-[9px]">
          <i className="h-[10px] w-[10px] rounded-full bg-[color:var(--m-border)]" />
          <i className="h-[10px] w-[10px] rounded-full bg-[color:var(--m-border)]" />
          <i className="h-[10px] w-[10px] rounded-full bg-[color:var(--m-border)]" />
          <span className="mx-auto font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">rate.limo</span>
        </div>
        <div className="flex items-center gap-3 px-[18px] py-[11px] text-[13px] text-[#E9F6EF] [background:linear-gradient(90deg,#052a1e,#074632)]">
          <span>◆</span>
          <b className="font-mono font-bold">{bannerText}</b>
          <span className="hidden sm:inline">· limited supply, tiered pricing</span>
          <span className="ml-auto rounded-[8px] bg-[#7fe8b6] px-3 py-[6px] font-mono text-[12px] font-semibold text-[#04150e]">
            {live ? "Buy now" : "Get notified"}
          </span>
        </div>
        <div className="px-5 py-[26px] text-white [background:linear-gradient(150deg,#0C1A2B,#17324A)]">
          <h3 className="m-0 mb-2 text-[24px] font-medium tracking-[-0.01em]">Fully on-chain order book.</h3>
          <p className="m-0 max-w-[40ch] text-[13.5px] text-[#b9cbdd]">
            Inventory and settlement, solved. Join Rate before launch.
          </p>
        </div>
      </div>
    </div>
  );
}
