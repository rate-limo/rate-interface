import { getMarketTapeData, chainColor } from "@/lib/rows/tape";

/**
 * Cross-chain stat strip for the hero, under the CTAs.
 *
 * Pre-launch the three financial slots read "TBD · at mainnet" — we do not
 * fabricate TVL / volume / trader numbers. What IS real (the chains and their
 * market counts) shows in the chain pill on the right, with a per-chain
 * breakdown on hover. When the indexers feed live aggregates, the TBD slots
 * become numbers with no change to this layout.
 */

const SLOTS = ["Total value locked", "24h volume", "Traders"] as const;

export function StatStrip() {
  const { byChain, counts } = getMarketTapeData();

  return (
    <div className="mt-11 flex flex-wrap items-center gap-y-4 border-t border-white/10 pt-6">
      {SLOTS.map((label, i) => (
        <div
          key={label}
          className={
            i < 2
              ? "mr-6 border-r border-white/10 pr-6 sm:mr-7 sm:pr-7"
              : "mr-6 pr-6 sm:mr-7 sm:pr-7"
          }
        >
          <div className="flex items-baseline gap-2 text-2xl font-medium leading-tight tracking-tight text-[#9BA2AA]">
            TBD
            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wider text-[#7A8189]">
              at mainnet
            </span>
          </div>
          <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-white/60">
            {label}
          </div>
        </div>
      ))}

      <ChainPill byChain={byChain} chains={counts.chains} markets={counts.markets} />
    </div>
  );
}

function ChainPill({
  byChain,
  chains,
  markets,
}: {
  byChain: { network: string; markets: number }[];
  chains: number;
  markets: number;
}) {
  return (
    <div className="group relative ml-auto">
      <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11.5px] text-white/70">
        <span className="flex">
          {byChain.map((c, i) => (
            <span
              key={c.network}
              className="block h-[9px] w-[9px] rounded-full border-[1.5px] border-[#2A3038]"
              style={{
                backgroundColor: chainColor(c.network),
                marginLeft: i === 0 ? 0 : -3,
              }}
            />
          ))}
        </span>
        {chains} {chains === 1 ? "chain" : "chains"}
        <span className="opacity-60">▾</span>
      </span>

      {/* Hover breakdown — real market counts per chain. */}
      <div className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 z-20 w-56 translate-y-1.5 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3.5 opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--m-text-secondary)]">
          Markets by chain
        </div>
        {byChain.map((c) => (
          <div
            key={c.network}
            className="my-2 flex items-center gap-2.5 text-[12.5px] text-[color:var(--m-text-primary)]"
          >
            <span
              className="h-[9px] w-[9px] shrink-0 rounded-full"
              style={{ backgroundColor: chainColor(c.network) }}
            />
            <span className="flex-1 truncate">{c.network}</span>
            <span className="font-mono text-[12px] text-[color:var(--m-text-secondary)]">
              {c.markets} mkts
            </span>
          </div>
        ))}
        <div className="mt-2.5 flex justify-between border-t border-[color:var(--m-border)] pt-2.5 text-[12.5px] text-[color:var(--m-text-secondary)]">
          <span>Live now</span>
          <b className="font-mono text-[color:var(--m-text-primary)]">{markets}</b>
        </div>
        <span className="absolute right-6 top-full border-[7px] border-transparent border-t-[color:var(--m-surface)]" />
      </div>
    </div>
  );
}
