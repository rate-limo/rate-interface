"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TierId } from "@/lib/ogpass/types";
import { mintPass } from "@/lib/ogpass/mock";
import { useOgPass } from "@/lib/ogpass/useOgPass";
import { SaleView } from "./SaleView";
import { OwnedPass } from "./OwnedPass";

interface OgPassViewProps {
  networkSlug: string;
}

type Mode = "sale" | "owned";

function shortAddress(address?: string): string {
  if (!address || address.length < 10) return "0x51a7…c4e9";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * OG Pass page orchestrator.
 *
 * Holds the "Before you buy / You own it" toggle and switches between the sale
 * and owned views. Everything is mock-backed through `useOgPass` — a real `buy`
 * mints and flips to the owned view; the "You own it" tab previews that view
 * with a minted Founder pass when nothing is actually held.
 */
export function OgPassView({ networkSlug }: OgPassViewProps) {
  const { config, owned, buy, reset } = useOgPass();
  const { open } = useWalletConnect();
  const { address, isConnected } = useAccount();

  const [mode, setMode] = useState<Mode>("sale");

  // Default selected + preview tier: the "popular" one, else the first.
  const featuredTier = useMemo(
    () => config.tiers.find((t) => t.popular) ?? config.tiers[0],
    [config.tiers]
  );
  const [selectedTierId, setSelectedTierId] = useState<TierId>(featuredTier.id);
  const selectedTier =
    config.tiers.find((t) => t.id === selectedTierId) ?? featuredTier;

  // "You own it" previews with a minted Founder pass when nothing is really held.
  const previewOwned = useMemo(() => mintPass(featuredTier), [featuredTier]);
  const displayedOwned = owned ?? previewOwned;
  const ownedTier =
    config.tiers.find((t) => t.id === displayedOwned.tier) ?? featuredTier;

  const handleBuy = () => {
    buy(selectedTier.id);
    setMode("owned");
    toast.success(`Minted ${selectedTier.name} · ${selectedTier.priceEth}`, {
      description: "Your Rate membership benefits are now tied to your wallet.",
    });
  };

  const handleReset = () => {
    reset();
    setMode("sale");
  };

  const handleNotify = () => {
    toast.success("We'll email you when the sale opens.");
  };

  const isOwned = mode === "owned";

  return (
    <div className="mx-auto max-w-[1080px] px-[22px] pb-24 pt-12">
      <header>
        <p className="m-0 mb-[14px] flex items-center gap-[9px] font-mono text-[12px] uppercase tracking-[0.16em] text-[color:var(--m-logo)]">
          <span className="font-bold">Rate</span> · membership
        </p>
        <h1 className="m-0 mb-2 text-[clamp(28px,4vw,44px)] font-medium leading-[1.04] tracking-[-0.02em] text-balance">
          Trade on <span className="font-bold text-[color:var(--m-logo)]">Rate</span> — the self-custodial venue.
        </h1>
        <p className="m-0 mb-[22px] max-w-[66ch] text-[16px] text-[color:var(--m-text-secondary)]">
          Rate brings the tools for onchain markets together:{" "}
          <b className="text-[color:var(--m-text-primary)]">more points</b>,{" "}
          <b className="text-[color:var(--m-text-primary)]">passkey login</b> (no seed phrase),{" "}
          <b className="text-[color:var(--m-text-primary)]">sponsored gas</b>, and{" "}
          <b className="text-[color:var(--m-text-primary)]">lower fees</b>. Built for transparent, self-custodial
          participation from day one.
        </p>

        <div className="mb-6 inline-flex rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[3px]">
          {(["sale", "owned"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "cursor-pointer rounded-[9px] border-0 px-[18px] py-[9px] text-[13.5px] font-semibold",
                mode === m
                  ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-sm"
                  : "bg-transparent text-[color:var(--m-text-secondary)]"
              )}
            >
              {m === "sale" ? "Before you buy" : "You own it"}
            </button>
          ))}
        </div>
      </header>

      {isOwned ? (
        <div>
          {owned === null && (
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
              Preview · a minted {featuredTier.name} pass
            </p>
          )}
          <OwnedPass
            owned={displayedOwned}
            tier={ownedTier}
            holder={owned !== null && isConnected ? shortAddress(address) : shortAddress()}
          />
          {owned !== null && (
            <button
              type="button"
              onClick={handleReset}
              className="mt-5 cursor-pointer rounded-[12px] border border-[color:var(--m-border)] bg-transparent px-5 py-[10px] text-[13px] font-semibold text-[color:var(--m-text-secondary)] hover:border-[color:var(--m-logo)] hover:text-[color:var(--m-logo)]"
            >
              Back to sale
            </button>
          )}
        </div>
      ) : (
        <SaleView
          config={config}
          selectedTier={selectedTier}
          onSelectTier={setSelectedTierId}
          isConnected={isConnected}
          onConnect={() => open()}
          onBuy={handleBuy}
          onNotify={handleNotify}
        />
      )}

      <Notes />

      {/* networkSlug is threaded for parity with sibling pages; the mock seam is
          network-agnostic today, so it is not yet read into any query. */}
      <span className="hidden" data-network={networkSlug} />
    </div>
  );
}

function Notes() {
  return (
    <div className="mt-7 grid gap-4 max-[720px]:grid-cols-1 min-[721px]:grid-cols-2">
      <div className="col-span-full rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[22px] py-5 shadow-sm">
        <NoteHeading dot="var(--m-logo)">How Rate works</NoteHeading>
        <p className="m-0 text-[13.5px] leading-[1.55] text-[color:var(--m-text-secondary)]">
          <b className="font-semibold text-[color:var(--m-text-primary)]">Points</b> — the pass applies a permanent
          multiplier on the rewards you already earn (trading + liquidity).{" "}
          <b className="font-semibold text-[color:var(--m-text-primary)]">Passkey login (Turnkey)</b> — an embedded,
          self-custodial wallet unlocked by a passkey, so a pass-holder can trade without a seed phrase.{" "}
          <b className="font-semibold text-[color:var(--m-text-primary)]">Gas sponsorship</b> — a paymaster covers
          network fees up to the tier&apos;s budget, so trades are gasless until it&apos;s spent.{" "}
          <b className="font-semibold text-[color:var(--m-text-primary)]">Fee discount</b> — a maker/taker reduction
          that stacks with volume tiers. All benefits are{" "}
          <b className="font-semibold text-[color:var(--m-text-primary)]">tied to the wallet that holds the pass</b>.
        </p>
      </div>
      <div className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[22px] py-5 shadow-sm">
        <NoteHeading dot="var(--m-warning)">The sale</NoteHeading>
        <ul className="mt-[6px] list-disc pl-[17px] text-[13px] text-[color:var(--m-text-secondary)]">
          <li className="my-[6px]">
            Sold on the <b className="text-[color:var(--m-text-primary)]">landing page before launch</b> — a countdown
            banner now, a <b className="text-[color:var(--m-text-primary)]">Buy</b> when it opens, and{" "}
            &ldquo;<b className="text-[color:var(--m-text-primary)]">N / supply sold</b>&rdquo; while live.
          </li>
          <li className="my-[6px]">
            <b className="text-[color:var(--m-text-primary)]">Tiered &amp; capped supply</b> — earlier/higher tiers get
            bigger boosts and more gas; scarcity is real.
          </li>
          <li className="my-[6px]">
            <b className="text-[color:var(--m-text-primary)]">Notify me</b> captures interest before the start.
          </li>
        </ul>
      </div>
      <div className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-[22px] py-5 shadow-sm">
        <NoteHeading dot="var(--m-accent)">After you buy</NoteHeading>
        <ul className="mt-[6px] list-disc pl-[17px] text-[13px] text-[color:var(--m-text-secondary)]">
          <li className="my-[6px]">
            The pass shows in-app as your <b className="text-[color:var(--m-text-primary)]">tier</b>, live{" "}
            <b className="text-[color:var(--m-text-primary)]">gas-sponsorship balance</b> (a gauge),{" "}
            <b className="text-[color:var(--m-text-primary)]">fee discount</b>, and{" "}
            <b className="text-[color:var(--m-text-primary)]">points boost</b>.
          </li>
          <li className="my-[6px]">
            It&apos;s an <b className="text-[color:var(--m-text-primary)]">on-chain asset</b> — transferable; benefits
            follow the holder.
          </li>
          <li className="my-[6px]">
            Honest, pre-launch: prices, supply, boosts, and gas budgets are{" "}
            <b className="text-[color:var(--m-text-primary)]">parameters</b> shown as an example.
          </li>
        </ul>
      </div>
    </div>
  );
}

function NoteHeading({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <h4 className="m-0 mb-[11px] flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {children}
    </h4>
  );
}
