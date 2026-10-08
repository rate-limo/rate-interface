"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { placeLadder } from "@/lib/launch/ladderRecovery";
import type { SpotToken } from "@/types";
import { useCoinLaunch } from "@/hooks/useCoinLaunch";
import { coinAdminFor } from "@/lib/portfolio/coinAdmin";
import { graduationStatus, stepsSoldCount } from "@/lib/portfolio/coinLaunch";
import { compactUsd } from "@/lib/launch/ladderView";
import { GRADUATION_NOTE, graduationPanelAction } from "@/lib/launch/graduationPanel";
import { LadderRing } from "@/components/Launch/LadderStatus";
import { cn } from "@/lib/utils";

/**
 * The coin page's graduation panel (2026-10-03). Graduation is permissionless
 * onchain, so this is for anyone: arm once the ladder sells out, finish after the
 * 5-minute wait. A keeper in the broker normally does both; the button is here so
 * a coin never depends on its creator, or on the keeper, being around.
 *
 * State is read onchain (`useCoinLaunch`), the same source the Creator tab uses;
 * the gateway's `ladder` only supplies the ring and the pool's value.
 */
export function GraduationPanel({ token, networkName }: { token: SpotToken; networkName: string }) {
  const query = useCoinLaunch(networkName, token.id);
  const s = query.data;
  const { address } = useAccount();
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const armed = Boolean(s && !s.graduated && s.readyAt > 0);
  useEffect(() => {
    if (!armed) return;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [armed]);

  // A launch whose ladder is still its own pending transaction. Checked BEFORE
  // the chain read's early return, and read from the gateway rather than from
  // `useCoinLaunch`: `launches(coin)` cannot tell this state from a selling one
  // without also reading `ladderOf`, and the gateway already did that work.
  //
  // It is deliberately not folded into `graduationStatus`. That machine is about
  // a ladder that has SOLD OUT; this is one that does not exist yet, and the two
  // share no transitions -- a placing coin cannot arm, graduate or be bought.
  if (token.ladder?.state === "placing") {
    return (
      <PlaceLadderPanel
        coin={token.id as `0x${string}`}
        symbol={token.symbol}
        networkName={networkName}
        steps={token.ladder.stepsTotal}
        onPlaced={() => void query.refetch()}
      />
    );
  }

  if (!s) return null; // not a ladder launch (or the chain read failed): nothing to offer

  const status = graduationStatus(s, now);
  const poolUsd = token.ladder?.poolValueUsd;
  const action = graduationPanelAction(status, s.readyAt, now, {
    stepsSold: stepsSoldCount(s),
    poolValue: poolUsd != null ? compactUsd(poolUsd) : null,
  });

  const run = async () => {
    setPending(true);
    try {
      const arming = status === "armable";
      await coinAdminFor(networkName).graduate(token.id);
      toast.success(arming ? `${token.symbol}'s graduation is armed. It finishes in 5 minutes.` : `${token.symbol} graduated. Its pool is open.`);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The transaction failed. Nothing was changed.");
    } finally {
      setPending(false);
    }
  };

  const tone =
    action.kind === "done"
      ? "border-[color-mix(in_srgb,var(--m-success)_45%,transparent)]"
      : action.kind === "wait"
        ? "border-[color-mix(in_srgb,var(--m-primary)_45%,transparent)]"
        : "border-[var(--m-border)]";

  return (
    <section
      id="graduation"
      data-testid="graduation-panel"
      data-state={status}
      className={cn("scroll-mt-24 rounded-[16px] border bg-[color:var(--m-surface)] p-4", tone)}
    >
      <div className="flex items-center gap-3">
        {token.ladder ? <LadderRing ladder={{ ...token.ladder, ...ladderOverride(status, s.readyAt) }} nowSec={now} /> : null}
        <div className="min-w-0">
          <b className="block font-dm-mono text-[14px] font-medium tabular-nums text-[color:var(--m-text-primary)]">{action.title}</b>
          <span className="block text-[12.5px] leading-5 text-[color:var(--m-text-secondary)]">{action.detail}</span>
        </div>
      </div>

      {"button" in action && (
        <div className="mt-3">
          <button
            type="button"
            data-testid="graduation-button"
            disabled={pending || !address}
            onClick={() => void run()}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[color:var(--m-primary)] px-4 text-sm font-semibold text-[color:var(--m-on-primary)] transition-opacity disabled:opacity-50"
          >
            {pending ? "Confirming…" : address ? action.button : "Connect a wallet to do this"}
          </button>
          <p className="mt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">{GRADUATION_NOTE}</p>
        </div>
      )}
    </section>
  );
}

/** Keep the ring's colour in step with the live onchain status, not the gateway snapshot. */
function ladderOverride(status: ReturnType<typeof graduationStatus>, readyAt: number) {
  if (status === "graduated") return { state: "graduated" as const, progress: 1 };
  if (status === "armed" || status === "ready") return { state: "armed" as const, progress: 1, readyAt };
  if (status === "armable") return { state: "soldOut" as const, progress: 1 };
  return {};
}

/**
 * The coin is live; its price ladder is not on the book.
 *
 * Shown to ANYONE, not just the creator, because `placeLadder` is permissionless
 * and the ladder is fixed by the launch -- the caller chooses nothing, and a coin
 * nobody can buy is everyone's problem. It reverts `LadderAlreadyPlaced` on a
 * second call, so two people pressing at once is a named revert rather than two
 * ladders.
 *
 * This is the closed-the-tab half of the recovery in `LaunchConfirm`: the same
 * call, reached from the coin's own page when the creator is no longer in the
 * flow that launched it.
 */
function PlaceLadderPanel({
  coin,
  symbol,
  networkName,
  steps,
  onPlaced,
}: {
  coin: `0x${string}`;
  symbol: string;
  networkName: string;
  steps: number;
  onPlaced: () => void;
}) {
  const { address } = useAccount();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await placeLadder(coin, networkName, address as `0x${string}`);
      toast.success(`${symbol}'s ladder is on the book. It is open for trading.`);
      onPlaced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The transaction failed. The ladder is still unplaced.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      id="graduation"
      data-testid="place-ladder-panel"
      data-state="placing"
      className="scroll-mt-24 rounded-[16px] border border-[color-mix(in_srgb,var(--m-warning)_45%,transparent)] bg-[color:var(--m-surface)] p-4"
    >
      <b className="block font-dm-mono text-[14px] font-medium text-[color:var(--m-text-primary)]">
        Not for sale yet
      </b>
      <span className="mt-0.5 block text-[12.5px] leading-5 text-[color:var(--m-text-secondary)]">
        {symbol} is deployed, but its {steps} price steps are placed in a second transaction and that one
        has not landed. Until it does there is nothing to buy.
      </span>
      <div className="mt-3">
        <button
          type="button"
          data-testid="place-ladder-button"
          disabled={pending || !address}
          onClick={() => void run()}
          className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[color:var(--m-primary)] px-4 text-sm font-semibold text-[color:var(--m-on-primary)] transition-opacity disabled:opacity-50"
        >
          {pending ? "Placing…" : address ? "Place the price ladder" : "Connect a wallet to do this"}
        </button>
        <p className="mt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
          Anyone can finish this. The steps were fixed when the coin launched, so there is nothing left
          to choose.
        </p>
      </div>
    </section>
  );
}
