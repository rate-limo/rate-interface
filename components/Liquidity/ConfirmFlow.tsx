"use client";

/**
 * Step 3 — the confirm / approval state machine. Review → an approval queue (one
 * row per token actually transferred; permit-gasless where supported, else
 * on-chain, run sequentially) → the add-liquidity tx → Pending → Result.
 *
 * On a BANDED pool the count follows what the depositor brought, not the shape of
 * the range: bring both tokens and it is two, bring one and it is one, because the
 * other side is converted rather than transferred. `side` still describes a v3
 * out-of-range position and must not be read as "this deposit is single-sided" —
 * see `band`/`converted` below, which is what a banded caller passes. Execution is mocked behind an injectable `schedule` so it can be driven
 * synchronously in tests; the default advances with timers and is
 * prefers-reduced-motion aware.
 */

import { useEffect, useRef, useState } from "react";
import { ERC20ABI } from "@iter/abis";
import { maxUint256 } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { slugToNetworkName } from "@/consts";
import { positionManagerAddress } from "@/lib/deployments";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { liqToken } from "@/lib/liquidity/mock";
import type { FeeTier, LiqMode } from "@/lib/liquidity/types";
import { toastContractError } from "@/lib/errors/toastContractError";

const MOCK_TX = "0x9a3f…4b21";

/** Cancellable timer. Default caps the delay under prefers-reduced-motion. */
export type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion:reduce)").matches;
  const id = setTimeout(fn, reduce ? Math.min(ms, 120) : ms);
  return () => clearTimeout(id);
};

type Phase = "review" | "approving" | "confirming" | "pending" | "done";

export interface ConfirmFlowProps {
  mode: LiqMode;
  networkSlug?: string;
  base: string;
  quote: string;
  fee: FeeTier;
  rate: number;
  low: number;
  high: number;
  isFullRange: boolean;
  /** -1 base only · 0 both · 1 quote only */
  side: -1 | 0 | 1;
  /** Band index, when the pool aggregates. Absent for a per-position pool. */
  band?: number;
  /** Tolerance of that band, as a fraction (0.02 = ±2%). */
  bandTolerance?: number;
  /**
   * Every band being seeded, in fill order. A deposit may cover several, and each
   * one opens a SEPARATE position — a band is its own share pool with its own
   * accumulator, so they cannot be a single token.
   *
   * `deposit` is what this band receives, already formatted ("0.5000 ETH + 817.50
   * USDC"). It arrives as a string for the same reason `amtBase`/`amtQuote` do: the
   * caller knows which tokens are being transferred and which side is converted, and
   * a receipt that re-derived the split would be a second answer to a question the
   * shape picker has already answered — which is the exact failure this prop exists
   * to close. Absent means the caller did not shape the deposit; the row is then not
   * rendered rather than showing an even split nothing performed.
   */
  bands?: { index: number; tolerance: number; deposit?: string }[];
  /** Seconds until fees vest fully. Absent means no vesting to disclose. */
  maturitySec?: number;
  /** Set when one token was brought and half of it is converted on the way in. */
  converted?: { from: string; to: string };
  amtBase: string;
  amtQuote: string;
  isConnected: boolean;
  onConnect: () => void;
  onBack: () => void;
  onDone: () => void;
  schedule?: Schedule;
}

function fmt(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString();
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(3);
}

export function ConfirmFlow(props: ConfirmFlowProps) {
  const {
    mode,
    networkSlug,
    base,
    quote,
    fee,
    rate,
    low,
    high,
    isFullRange,
    band,
    bandTolerance,
    bands,
    maturitySec,
    converted,
    side,
    amtBase,
    amtQuote,
    isConnected,
    onConnect,
    onBack,
    onDone,
    schedule = defaultSchedule,
  } = props;

  const launch = mode === "launch";
  const networkName = slugToNetworkName[networkSlug ?? ""] ?? networkSlug ?? "";
  const tokenQuery = useLiveSwapTokens(networkName, isConnected);
  const { chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [phase, setPhase] = useState<Phase>("review");
  const [approvingTok, setApprovingTok] = useState<string | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const cancelRef = useRef<null | (() => void)>(null);

  const cancelTimer = () => {
    cancelRef.current?.();
    cancelRef.current = null;
  };
  const after = (ms: number, fn: () => void) => {
    cancelTimer();
    cancelRef.current = schedule(fn, ms);
  };
  // Cancel any in-flight timer when the component unmounts.
  useEffect(() => () => cancelTimer(), []);

  const deposited: string[] = isFullRange
    ? [base, quote]
    : [...(side !== 1 ? [base] : []), ...(side !== -1 ? [quote] : [])];
  // Native ETH is transferred as transaction value, never through ERC-20 allowance.
  const needed = deposited.filter((token) => token.toUpperCase() !== "ETH");
  const nextUnapproved = needed.find((t) => !approved.includes(t));

  const baseText = side === 1 ? "" : `${amtBase} ${base}`;
  const quoteText = side === -1 ? "" : `${amtQuote} ${quote}`;
  const depositText = [baseText, quoteText].filter(Boolean).join(" + ");
  const rangeText = isFullRange ? "Full" : `${fmt(low)} – ${fmt(high)}`;
  const inRange = isFullRange || (rate >= low && rate <= high);
  const banded = band !== undefined;
  const seeded = bands ?? (bandTolerance !== undefined && band !== undefined
    ? [{ index: band, tolerance: bandTolerance }]
    : []);
  /**
   * A banded pool has no in/out of range to report — a band re-anchors to the TWAP
   * on every swap, so liquidity in it is never outside anything. Saying "in range"
   * would borrow a v3 status that cannot be false here, which is the same false
   * comfort a green badge that never turns red always gives.
   */
  /**
   * A banded deposit has bands, not a range. Printing a price range here would put
   * a number on the receipt that no position stores and no swap reads — the same
   * promise the pool stopped making when per-position ranges were removed.
   */
  const bandsText =
    seeded.length > 0 ? seeded.map((b) => `±${(b.tolerance * 100).toFixed(2)}%`).join(" · ") : rangeText;
  const statusText = banded
    ? seeded.length > 1
      ? `${seeded.length} positions · ${seeded.map((b) => `±${(b.tolerance * 100).toFixed(2)}%`).join(", ")}`
      : `Band ${band} · ±${((bandTolerance ?? 0) * 100).toFixed(2)}%`
    : inRange
      ? "In range · earning"
      : "Out of range";

  const back = () => {
    cancelTimer();
    onBack();
  };

  const go = async () => {
    if (!isConnected) {
      onConnect();
      return;
    }
    const t = nextUnapproved;
    if (t) {
      setApprovingTok(t);
      setPhase("approving");
      // Resolved outside the try so the catch can name the chain: a gas shortfall
      // has to say WHICH asset is short, and this flow is per-network.
      const token = tokenQuery.data?.find((candidate) => candidate.symbol === t);
      try {
        const spender = positionManagerAddress(networkName);
        if (!token || !spender || !publicClient) throw new Error(`Approval unavailable for ${t}`);
        if (connectedChainId !== token.chainId) await switchChainAsync({ chainId: token.chainId });
        const hash = await writeContractAsync({
          address: token.address as `0x${string}`,
          abi: ERC20ABI,
          functionName: "approve",
          args: [spender, maxUint256],
          chainId: token.chainId,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        setApproved((prev) => [...prev, t]);
        setApprovingTok(null);
        setPhase("review");
      } catch (error) {
        setApprovingTok(null);
        setPhase("review");
        toastContractError(error, `Could not approve ${t}`, { chainId: token?.chainId });
      }
    } else {
      setPhase("confirming");
      after(1400, () => {
        setPhase("pending");
        after(1700, () => {
          setPhase("done");
          toast.success(launch ? "Pool created & position opened" : "Position opened");
        });
      });
    }
  };

  const goLabel = !isConnected
    ? "Connect wallet"
    : nextUnapproved
      ? `Approve ${nextUnapproved}`
      : launch
        ? "Create pool & add liquidity"
        : "Add liquidity";

  const panel = "rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] shadow-sm";

  // ---- waiting / result sub-views ----
  if (phase === "approving" && approvingTok) {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">Approve {approvingTok}</h3>
        <Waiting
          title="Confirm in your wallet"
          body={`Send the ${approvingTok} approval transaction.`}
        />
      </div>
    );
  }
  if (phase === "confirming") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">{launch ? "Create pool" : "Add liquidity"}</h3>
        <Waiting
          title="Confirm in your wallet"
          body={launch ? "Create the pool and mint your position." : "Add your liquidity in one transaction."}
        />
      </div>
    );
  }
  if (phase === "pending") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">Submitted</h3>
        <Waiting title="Confirming on-chain" body="Your position is being minted." tx={`${MOCK_TX} ↗`} />
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <div className="flex flex-1 flex-col items-center text-center">
          <div
            className="mb-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[26px] font-bold text-[var(--m-success)]"
            style={{ background: "color-mix(in srgb,var(--m-success) 16%,transparent)" }}
          >
            ✓
          </div>
          <h4 className="mb-1 text-[17px] font-semibold">
            {launch ? "Pool created & position opened" : "Position opened"}
          </h4>
          <p className="mb-2.5 text-[12.5px] text-[var(--m-text-secondary)]">
            {base}/{quote} · {fee}% · {banded ? bandsText : rangeText}
          </p>
          <div className="mt-1.5 w-full self-stretch rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-1 text-left">
            <ReviewRow k="Deposited"><b className="font-mono tabular-nums text-[var(--m-text-primary)]">{depositText}</b></ReviewRow>
            <ReviewRow k="Status"><b className="font-mono text-[var(--m-logo)]">{statusText}</b></ReviewRow>
            <ReviewRow k="Transaction"><b className="font-mono text-[var(--m-primary-fg)]">{MOCK_TX} ↗</b></ReviewRow>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={onDone} className="mt-3 w-full rounded-[13px] bg-[color:var(--m-primary)] py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)]">
            View in portfolio
          </button>
        </div>
      </div>
    );
  }

  // ---- review ----
  return (
    <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Back to range"
          onClick={back}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[var(--m-border)] text-[15px] text-[var(--m-text-secondary)]"
        >
          ←
        </button>
        <h3 className="text-base font-semibold">{launch ? "Create pool" : "Add liquidity"}</h3>
      </div>

      <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-1">
        <ReviewRow k="Pool">
          <span className="flex items-center gap-1.5 font-mono text-[var(--m-text-primary)]">
            <TokenImageIcon symbol={base} color={liqToken(base).color} size="sm" className="h-[18px] w-[18px] text-[6px]" />
            {base}/{quote} · {fee}%
          </span>
        </ReviewRow>
        <ReviewRow k={launch ? "Starting price" : "Current price"}>
          <b className="font-mono tabular-nums text-[var(--m-text-primary)]">1 {base} = {fmt(rate)} {quote}</b>
        </ReviewRow>
        {banded && (
          <ReviewRow k="Band">
            <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
              ±{((bandTolerance ?? 0) * 100).toFixed(bandTolerance && bandTolerance < 0.01 ? 1 : 0)}%
              {band === 0 ? " · fills first" : ""}
            </b>
          </ReviewRow>
        )}
        <ReviewRow k={banded ? (seeded.length > 1 ? "Bands" : "Band") : "Range"}>
          <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
            {banded ? bandsText : rangeText}
          </b>
        </ReviewRow>
        {converted && (
          <ReviewRow k="Converted on deposit">
            <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
              half your {converted.from} → {converted.to}
            </b>
          </ReviewRow>
        )}
        <ReviewRow k="Deposit">
          <b className="font-mono tabular-nums text-[var(--m-text-primary)]">{depositText}</b>
        </ReviewRow>
      </div>

      {/*
        What each band actually receives.

        Only when the deposit covers more than one band: with a single band the split
        IS the deposit line above, and repeating it would imply a division happened.
        Each row is a separate position, which is why they are listed rather than
        summarised — the LP is opening `seeded.length` of them in one transaction.
      */}
      {banded && seeded.length > 1 && seeded.some((b) => b.deposit) && (
        <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--m-text-secondary-2)]">
              Split across bands
            </span>
            <span className="text-[10.5px] text-[var(--m-text-secondary)]">
              {seeded.length} positions
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {seeded.map((b) => (
              <div key={b.index} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="font-mono tabular-nums text-[var(--m-text-secondary)]">
                  ±{(b.tolerance * 100).toFixed(2)}%
                  {b.index === 0 ? " · fills first" : ""}
                </span>
                <span className="font-mono tabular-nums text-[var(--m-text-primary)]">
                  {b.deposit ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {maturitySec !== undefined && (
        <div className="mb-1.5 mt-2 rounded-[13px] border border-[var(--m-primary)] bg-[color-mix(in_srgb,var(--m-primary)_9%,transparent)] px-3.5 py-2.5 text-[12.5px]">
          <b className="block">Fees vest over {Math.round(maturitySec / 60)} minutes</b>
          <span className="text-[var(--m-text-secondary)]">
            Withdraw before then and the unvested part goes to the other LPs in this
            band. It is not returned later. Your principal is never locked.
          </span>
        </div>
      )}
      {converted && (
        <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5 text-[12.5px]">
          <b className="block">The conversion moves this band.</b>
          <span className="text-[var(--m-text-secondary)]">
            It spends the band&apos;s {converted.to} and leaves everyone in it heavier
            in {converted.from}. The pool fee is what compensates them. Amounts shown
            are estimates until the swap settles.
          </span>
        </div>
      )}

      <div className="mb-1.5 mt-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
        Approvals ({needed.length})
      </div>
      {needed.map((t) => {
        const done = approved.includes(t);
        const method = "on-chain approve";
        return (
          <div
            key={t}
            className={cn(
              "mb-1.5 flex items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-[13px]",
              done ? "border-[color-mix(in_srgb,var(--m-success)_34%,transparent)]" : "border-[var(--m-border)]",
            )}
          >
            <span
              className={cn(
                "flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[13px]",
                done ? "bg-[color-mix(in_srgb,var(--m-success)_15%,transparent)] text-[var(--m-success)]" : "bg-[var(--m-surface-2)]",
              )}
            >
              {done ? "✓" : "○"}
            </span>
            Approve {t}
            <span className={cn("ml-auto font-mono text-[11px]", done ? "text-[var(--m-success)]" : "text-[var(--m-text-secondary-2)]")}>
              {done ? "approved" : method}
            </span>
          </div>
        );
      })}

      <div className="flex-1" />
      <button type="button" onClick={() => void go()} className="mt-3 w-full rounded-[13px] bg-[color:var(--m-primary)] py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)]">
        {goLabel}
      </button>
      <p className="mt-2.5 text-center text-[11px] text-[var(--m-text-secondary-2)]">
        <span className="text-[var(--m-logo)]">◆</span> Self-custody · one add-liquidity transaction
      </p>
    </div>
  );
}

function ReviewRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--m-border)] py-2 text-[12.5px] text-[var(--m-text-secondary)] first:border-t-0">
      <span>{k}</span>
      {children}
    </div>
  );
}

function Waiting({ title, body, tx }: { title: string; body: string; tx?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="h-[42px] w-[42px] animate-spin rounded-full border-[3px] border-[var(--m-border)] border-t-[var(--m-primary)] motion-reduce:animate-none" />
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="max-w-[30ch] text-[12.5px] text-[var(--m-text-secondary)]">{body}</p>
      {tx && (
        <span className="rounded-[9px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--m-primary-fg)]">
          {tx}
        </span>
      )}
    </div>
  );
}
