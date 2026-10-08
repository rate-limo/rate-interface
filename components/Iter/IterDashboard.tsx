"use client";

import { useState } from "react";
import {
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Info,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProtocolFlywheel } from "@/components/Iter/ProtocolFlywheel";
import type { ProtocolFlywheelData } from "@/lib/iter/protocolMetrics";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl } from "@/lib/routing/chainParams";

type RevenueRange = "24h" | "7d" | "1y";

const rangeValues: Record<RevenueRange, { revenue: string; rate: string }> = {
  "24h": { revenue: "$9,644.5", rate: "+$0.08 /s" },
  "7d": { revenue: "$482,930", rate: "+$0.80 /s" },
  "1y": { revenue: "$4.86M", rate: "+$0.15 /s" },
};

const sparkPaths = [
  "M2 68 C28 68 35 68 49 67 C56 66 55 46 70 45 C89 43 94 50 112 39 C130 28 139 39 154 29 C169 20 178 24 191 17 C201 11 203 2 213 1 C229 0 230 7 247 4 C263 2 274 6 298 0",
  "M2 51 C14 43 14 77 27 69 C43 60 54 48 70 53 C86 58 94 49 111 54 C129 60 137 58 147 50 C157 42 152 3 169 7 C185 11 182 24 195 10 C208 -3 217 7 231 9 C250 11 261 8 275 4 C284 1 290 6 298 5",
  "M2 66 C38 66 43 66 53 65 C58 64 54 51 68 50 C93 47 96 54 116 46 C134 38 146 49 160 38 C173 28 174 18 187 10 C203 2 211 5 224 1 C237 -2 240 8 255 5 C269 2 276 10 298 2",
];

function InfoIcon({ label }: { label: string }) {
  return <Info aria-label={label} className="h-4 w-4 text-[color:var(--m-text-secondary)]" />;
}

/* Stroke and fill both ride `currentColor`, so the success token flips with the
   theme instead of being frozen at one hex. The gradient id keys off the index
   (path length collides). */
function Sparkline({ path, id, className }: { path: string; id: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 300 78"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-20 w-full text-[color:var(--m-success)]", className)}
    >
      <defs>
        <linearGradient id={`iter-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L298 78 L2 78 Z`} fill={`url(#iter-spark-${id})`} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MarketCard({
  title,
  value,
  delta,
  path,
  id,
  info,
}: {
  title: string;
  value: string;
  delta: string;
  path: string;
  id: number;
  info?: string;
}) {
  return (
    <article className="grid min-h-[142px] overflow-hidden rounded-[26px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-6 py-5 shadow-[inset_0_1px_var(--m-text-primary-12)] min-[700px]:grid-cols-[minmax(180px,.8fr)_minmax(220px,1.2fr)] min-[700px]:items-center min-[1200px]:rounded-[30px]">
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[color:var(--m-text-primary)]">
          {title}
          {info && <InfoIcon label={info} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <strong className="font-dm-mono text-2xl font-medium tracking-[-0.05em] text-[color:var(--m-text-primary)] tabular-nums">
            {value}
          </strong>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--m-success-100)] text-[color:var(--m-success-fg)]">
            <TrendingUp className="h-3 w-3" />
          </span>
          <span className="font-dm-mono text-sm font-medium text-[color:var(--m-success-fg)] tabular-nums">{delta}</span>
          <span className="font-dm-mono text-xs tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase">7d</span>
        </div>
      </div>
      <Sparkline path={path} id={id} className="mt-4 min-[700px]:mt-0" />
    </article>
  );
}

function ProgramCard({
  title,
  status,
  eyebrow,
  value,
  detail,
  action,
  actionHref,
  children,
}: {
  title: string;
  status: React.ReactNode;
  eyebrow: string;
  value: React.ReactNode;
  detail?: string;
  action?: string;
  /** Required for the CTA to render — see the note at the call site below. */
  actionHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[300px] flex-col overflow-hidden rounded-[28px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-[inset_0_1px_var(--m-text-primary-12)]">
      <div className="flex items-center justify-between gap-4 border-b border-[color:var(--m-border)] px-6 py-5">
        <div className="flex items-center gap-2 text-base font-semibold text-[color:var(--m-text-primary)]">
          {title}
          <InfoIcon label={`About ${title}`} />
        </div>
        <div className="shrink-0 font-dm-mono text-sm text-[color:var(--m-text-secondary)] tabular-nums">{status}</div>
      </div>
      <div className="flex flex-1 flex-col px-6 pt-6 pb-5">
        <div className="font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">{eyebrow}</div>
        <div className="mt-2 font-dm-mono text-4xl font-medium tracking-[-0.06em] text-[color:var(--m-text-primary)] tabular-nums min-[1200px]:text-[42px]">
          {value}
        </div>
        {detail && <div className="mt-1 text-sm text-[color:var(--m-text-secondary)]">{detail}</div>}
        {children}
        {/* `action` used to render a bare <button> with no handler and no href,
            so every card CTA here was a dead control. Pass actionHref to get a
            real Link; without one the card simply has no CTA, which is more
            honest than a button that does nothing. */}
        {action && actionHref && (
          <Link
            href={actionHref}
            className="mt-auto flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-base font-semibold text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary-300)] hover:bg-[color:var(--m-primary-100)] hover:text-[color:var(--m-primary-700)] active:translate-y-px"
          >
            {action}
            <ChevronRight className="h-5 w-5" />
          </Link>
        )}
      </div>
    </article>
  );
}

/* Tint chips: a -100 surface under -700 text reads in both modes. The earlier
   dark-fill/light-text pairs only worked because the page pinned .dark. */
const actions = [
  { tag: "Fees", color: "bg-[color:var(--m-primary-100)] text-[color:var(--m-primary-700)]", type: "Revenue", text: "Protocol earned $8,420", detail: "$21.4M trading volume", time: "about 2 hours ago" },
  { tag: "LP", color: "bg-[color:var(--m-success-100)] text-[color:var(--m-success-700)]", type: "Yield", text: "LPs earned $18,640", detail: "Fees distributed across 42 pools", time: "about 5 hours ago" },
  { tag: "Buy", color: "bg-[color:var(--m-warning-100)] text-[color:var(--m-warning-700)]", type: "Buyback", text: "Protocol repurchased 18,240 Rate", detail: "$12,806 via market execution", time: "about 8 hours ago" },
  { tag: "Pool", color: "bg-[color:var(--m-error-100)] text-[color:var(--m-error-700)]", type: "Liquidity", text: "0x6eC5…f3ff added $473K", detail: "ETH / USDC concentrated liquidity", time: "about 1 day ago" },
];

export function IterDashboard({ flywheel }: { flywheel: ProtocolFlywheelData }) {
  const [range, setRange] = useState<RevenueRange>("7d");
  const revenue = rangeValues[range];
  // Rendered inside MarketPageProvider (see app/iter/page.tsx), so the CTAs can
  // carry the chain the user is actually looking at.
  const { displayNetworkSlug } = useMarketPageContext();

  return (
    <div className="mx-auto w-full max-w-[1450px] px-4 pt-7 pb-6 text-[color:var(--m-text-primary)] min-[700px]:px-7 min-[1200px]:px-9 min-[1200px]:pt-8 min-[1200px]:pb-16">
      <div className="mb-7 hidden items-center justify-between min-[1200px]:flex">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Overview</h1>
        <span className="inline-flex items-center gap-2 font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-secondary)] uppercase">
          <span className="h-2 w-2 rounded-full bg-[color:var(--m-success)]" />
          Preview data
        </span>
      </div>

      <section className="grid gap-4 min-[1200px]:grid-cols-2">
        {/* Deliberate theme carve-out: this card's content sits on a photograph
            under a fixed dark scrim, so its text must stay light in BOTH modes.
            Use --m-text-on-media, never `text-white` — --color-white is remapped
            to the mode-flipping --m-text-primary (globals.css), so `text-white`
            renders navy-on-stone in light mode at ~1.9:1. */}
        <article
          className="relative min-h-[390px] overflow-hidden rounded-[30px] border border-[color:var(--m-border)] bg-cover bg-center shadow-[inset_0_1px_var(--m-text-primary-12)] min-[700px]:min-h-[460px]"
          style={{ backgroundImage: "linear-gradient(rgba(8,10,14,.34),rgba(8,10,14,.56)), url('/images/iter/protocol-revenue-stone.png')" }}
        >
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-6 text-[color:var(--m-text-on-media)]">
            <div className="flex items-center gap-2 text-base font-semibold">
              Protocol Revenue
              <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-success)] shadow-[0_0_14px_var(--m-success)]" />
            </div>
            <div className="flex rounded-full bg-black/30 p-1 backdrop-blur-md">
              {(["24h", "7d", "1y"] as RevenueRange[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={cn(
                    "rounded-full px-3 py-2 font-dm-mono text-sm font-medium transition-colors",
                    range === item
                      ? "bg-[rgba(247,249,252,0.2)] text-[color:var(--m-text-on-media)]"
                      : "text-[color:var(--m-text-on-media-60)] hover:text-[color:var(--m-text-on-media)]",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-7 text-center text-[color:var(--m-text-on-media)]">
            <div className="font-dm-mono text-[54px] font-medium tracking-[-0.075em] tabular-nums min-[700px]:text-[76px]">
              {revenue.revenue}
            </div>
            <div className="mt-0 font-dm-mono text-[34px] font-medium tracking-[-0.04em] text-[color:var(--m-accent)] tabular-nums min-[700px]:text-[42px]">
              {revenue.rate}
            </div>
          </div>
        </article>

        <div className="grid gap-4">
          <MarketCard title="Rate Price" value="$18.61" delta="0.69%" path={sparkPaths[0]} id={0} />
          <MarketCard title="Liquid Backing Per Rate" value="$12.05" delta="0.02%" path={sparkPaths[1]} id={1} />
          <MarketCard title="Rate Premium" value="$6.56" delta="1.95%" path={sparkPaths[2]} id={2} info="Price premium above liquid backing" />
        </div>
      </section>

      <section className="mt-4 grid gap-4 min-[960px]:grid-cols-3">
        <ProgramCard
          title="LP Yield"
          status="18.4% APR"
          eyebrow="LP Earnings"
          value="$1.28M"
          detail="Net of estimated impermanent loss"
          action="View pools"
          actionHref={buildPageUrl("pool", { slug: displayNetworkSlug })}
        />
        <ProgramCard
          title="Protocol Liquidity"
          status={<span className="inline-flex items-center gap-2">Active <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-success)] shadow-[0_0_0_5px_var(--m-success-100)]" /></span>}
          eyebrow="Total Value Locked"
          value="$42.6M"
          detail="Across 42 active markets"
          action="Provide liquidity"
          actionHref={buildPageUrl("pool", { slug: displayNetworkSlug, provide: true })}
        />
        <ProgramCard
          title="Revenue Buyback"
          status={<span className="inline-flex items-center gap-2">Active <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-success)] shadow-[0_0_0_5px_var(--m-success-100)]" /></span>}
          eyebrow="Lifetime Rate Repurchased"
          value={<span className="flex items-center gap-2"><CircleDollarSign className="h-9 w-9 text-[color:var(--m-text-secondary)]" />566,623.74</span>}
        >
          <div className="mt-auto pt-8">
            <div className="flex items-center gap-2 text-sm text-[color:var(--m-text-secondary)]">Annual Supply Impact <InfoIcon label="Estimated annual token supply impact" /></div>
            <div className="mt-1 font-dm-mono text-lg font-medium tabular-nums">
              -0.07% <span className="text-[color:var(--m-text-secondary)]">14,397 Rate/yr</span>
            </div>
          </div>
        </ProgramCard>
      </section>

      <ProtocolFlywheel data={flywheel} />

      <section className="mt-4 overflow-hidden rounded-[28px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-[inset_0_1px_var(--m-text-primary-12)]">
        <div className="flex items-center justify-between border-b border-[color:var(--m-border)] px-6 py-5">
          <h2 className="text-base font-semibold">Last Protocol Actions</h2>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-5 py-2.5 text-sm font-semibold transition-colors hover:border-[color:var(--m-primary-300)] hover:bg-[color:var(--m-primary-100)] hover:text-[color:var(--m-primary-700)]"
          >
            View All <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div>
          {actions.map((action, index) => (
            <div
              key={`${action.type}-${index}`}
              className="grid gap-3 border-b border-[color:var(--m-border)] px-6 py-5 last:border-0 min-[700px]:grid-cols-[74px_180px_1fr_auto] min-[700px]:items-center"
            >
              <span className={cn("w-fit rounded-full px-3 py-1 font-dm-mono text-[10px] tracking-[0.08em] uppercase", action.color)}>
                {action.tag}
              </span>
              <div className="text-sm font-semibold">{action.type}</div>
              <div>
                <div className="text-base font-semibold">{action.text}</div>
                <div className="mt-0.5 text-sm text-[color:var(--m-text-secondary)]">{action.detail}</div>
              </div>
              <div className="flex items-center gap-2 text-sm text-[color:var(--m-text-secondary)]">
                {action.time}
                <ExternalLink className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-4 text-center font-dm-mono text-[10px] tracking-[0.04em] text-[color:var(--m-text-secondary)]">
        Preview data · Protocol metrics indexer connection pending
      </p>
    </div>
  );
}
