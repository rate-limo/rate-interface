"use client";

import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { BandPositionManagerABI } from "@iter/abis";
import { positionManagerAddress } from "@/lib/deployments";
import { tokenColor } from "@/lib/swap/tokens";
import { cn } from "@/lib/utils";
import { useCreatorRewards, type CreatorReward } from "@/hooks/useCreatorRewards";
import { toastContractError } from "@/lib/errors/toastContractError";
import { chainIds } from "@/consts";

/**
 * Creator LP fee rewards — what a wallet's graduated auctions are owed.
 *
 * ## Two clocks, never merged
 *
 * The bar is FEE VESTING; the date beside it is when the LOCKED LIQUIDITY
 * unlocks. They are unrelated: fees can be collected today on a position whose
 * principal is locked for months. Showing one bar for both would tell a creator
 * their capital is 74% available when it is 0% available.
 *
 * ## Amounts are token legs, not a dollar total
 *
 * A band position earns in BOTH currencies (a fee is denominated in whatever the
 * taker received), so the honest unit is two numbers. Summing them into one USD
 * figure needs a price for each leg, and a freshly graduated coin frequently has
 * no price at all — which would silently make its fees read as $0.00 rather than
 * "we cannot value this yet". Same rule the positions total follows.
 */
export function RewardsPanel({
  address,
  networkName,
}: {
  address: string;
  networkName: string;
}) {
  const { rewards, hasClaimable, claimableElsewhere, tokenIds, isLoading, failed, refetch } = useCreatorRewards(
    networkName,
    address,
  );
  const { address: viewer } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [claiming, setClaiming] = useState(false);
  // Named so a gas shortfall can say WHICH asset is missing — this panel is
  // reached per network, and "add ETH" is wrong on a chain that charges USDC.
  const chainId = chainIds[networkName];

  // Only the owner can claim, and only into their own wallet. `collectMany`
  // takes a recipient, so rendering this for a visitor would offer to send
  // someone else's fees somewhere — the contract refuses, but a button whose
  // transaction always reverts is worse than no button.
  const isSelf = !!viewer && viewer.toLowerCase() === address.toLowerCase();

  const claimAll = async () => {
    const manager = positionManagerAddress(networkName);
    if (!manager || !viewer || tokenIds.length === 0) return;
    setClaiming(true);
    try {
      await writeContractAsync({
        address: manager as `0x${string}`,
        abi: BandPositionManagerABI,
        functionName: "collectMany",
        args: [tokenIds, viewer],
      });
      toast.success("Fees claimed");
      void refetch();
    } catch (error) {
      // A rejected wallet prompt is a decision, not a failure — same rule as
      // lib/profile/follow.ts's isSignatureRejection. `toastContractError` makes
      // the same call itself, so the regex is gone with the raw `error.message`
      // it used to guard: claiming fees is a transaction, and on an unfunded
      // account it failed with viem's own prose and no way out of it.
      toastContractError(error, "Claim failed", { chainId });
    } finally {
      setClaiming(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          Loading…
        </div>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card>
        <div className="px-6 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          Couldn&apos;t load rewards.
        </div>
      </Card>
    );
  }

  if (rewards.length === 0) {
    return (
      <Card>
        <div className="px-6 py-12 text-center">
          <p className="text-[13.5px] text-[color:var(--m-text-secondary)]">
            No LP fee rewards yet.
          </p>
          {/* Named rather than left blank, and no longer auction-only: this
              panel used to read auctions alone, so it told every LP with an
              ordinary launch that their position did not exist. */}
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[12px] text-[color:var(--m-text-secondary-2)]">
            A position earns fees once liquidity is provided — from a launch, or
            from an auction once it graduates.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-end justify-between gap-3 border-b border-[color:var(--m-border)] px-4 py-4">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]">
            Claimable LP fees
          </div>
          <div className="mt-1 text-[15px] text-[color:var(--m-text-secondary)]">
            {rewards.length} {rewards.length === 1 ? "position" : "positions"}
          </div>
        </div>
        {isSelf && (
          <button
            type="button"
            onClick={claimAll}
            disabled={!hasClaimable || claiming}
            title={hasClaimable ? undefined : "Nothing has accrued yet"}
            className="rounded-[11px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-4 py-2 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {claiming ? "Claiming…" : "Claim all"}
          </button>
        )}
      </div>

      {/* A claim is one transaction to one chain's manager, so "Claim all" can
          only ever mean "all on this chain". Saying which other chains are owed
          beats leaving the reader to find out by switching networks. */}
      {isSelf && claimableElsewhere.length > 0 && (
        <div className="border-b border-[color:var(--m-border)] px-4 py-2.5 font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
          Also claimable on {claimableElsewhere.map((n) => n.replace(" Testnet", "")).join(", ")} —
          switch networks to collect.
        </div>
      )}
      {rewards.map((reward) => (
        // Keyed on chain AND id: position ids restart per chain, so `tokenId`
        // alone collides the moment two chains answer — the same rule the
        // positions table needs for token addresses.
        <Row key={`${reward.networkName}:${reward.tokenId}`} reward={reward} />
      ))}
    </Card>
  );
}

function Row({ reward }: { reward: CreatorReward }) {
  const nothing = reward.vestedBaseRaw === BigInt(0) && reward.vestedQuoteRaw === BigInt(0);
  return (
    <div className="flex flex-col gap-2.5 border-b border-[color:var(--m-border)] px-4 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-extrabold text-white"
          style={{ backgroundColor: tokenColor(reward.symbol) }}
          aria-hidden="true"
        >
          {reward.symbol.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-bold tracking-[-0.015em]">
            {reward.symbol} / {reward.quoteSymbol}
          </span>
          {/* NOT "Auction LP" any more. The list comes from `bandPositions`, so
              most rows are ordinary launches; `unlockAt` is the only thing that
              actually marks an auction, because only a graduated sale locks its
              liquidity. Naming every position an auction was wrong the moment
              plain launches became visible. */}
          <span className="mt-0.5 block font-mono text-[11px] text-[color:var(--m-text-secondary)]">
            {reward.unlockAt !== null ? "Auction LP" : "LP"} · #{reward.tokenId}
            <span className="ml-1.5 text-[color:var(--m-text-secondary-2)]">
              {reward.networkName.replace(" Testnet", "")}
            </span>
          </span>
        </span>
        <span className="ml-auto text-right">
          {nothing ? (
            <span className="font-mono text-[12px] text-[color:var(--m-text-secondary)]">
              no fees yet
            </span>
          ) : (
            <span className="block font-mono text-[12.5px] tabular-nums">
              <span className="block">
                {trim(reward.vestedBase)} {reward.symbol}
              </span>
              <span className="block text-[color:var(--m-text-secondary)]">
                {trim(reward.vestedQuote)} {reward.quoteSymbol}
              </span>
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]">
          <span
            className="block h-full rounded-full bg-[color:var(--m-primary)]"
            style={{ width: `${reward.vestedPct}%` }}
          />
        </span>
        <span className="font-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
          {reward.vestedPct.toFixed(0)}% fees vested
          {reward.unlockAt !== null && ` · liquidity ${lockLabel(reward.unlockAt)}`}
        </span>
      </div>
    </div>
  );
}

/** Token amounts at full precision are unreadable; this trims trailing zeros
 * without rounding a real dust amount to nothing. */
function trim(value: string): string {
  if (!value.includes(".")) return value;
  const [whole, fraction = ""] = value.split(".");
  const cut = fraction.slice(0, 6).replace(/0+$/, "");
  return cut.length > 0 ? `${whole}.${cut}` : whole;
}

/** The LIQUIDITY lock, distinct from fee vesting — see the module note. */
function lockLabel(unlockAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  if (unlockAt <= now) return "unlocked";
  return `locked until ${new Date(unlockAt * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
