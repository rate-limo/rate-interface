"use client";

import { marketParam } from "@/lib/routing/proMarket";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { CreatorToken, IndexerData } from "@/lib/portfolio/types";
import {
  canEditMetadata,
  canGraduate,
  formatTakerFee,
  changeTone,
  creatorSummary,
  formatChange,
  formatMarketCap,
  formatRate,
  graduationHelp,
  graduationProgressPct,
  graduationState,
  supplySplit,
  usdCompact,
} from "@/lib/portfolio/creator";
import { GraduationError, requestGraduation } from "@/lib/portfolio/graduate";
import { useAccount } from "wagmi";
import { coinAdminFor } from "@/lib/portfolio/coinAdmin";
import { useCoinLaunch } from "@/hooks/useCoinLaunch";
import {
  canReleaseVested,
  controlBlockedBy,
  graduationStatus,
  quoteAmount,
  stepsSoldCount,
  vestedBps,
} from "@/lib/portfolio/coinLaunch";
import { allowedFees, allowedVolatility, feeTierNum } from "@/lib/liquidity/launchPolicy";
import { buildPageUrl, DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { networkNameToSlug } from "@/consts";
import { cn } from "@/lib/utils";
import { ChainChip, Pill, TokenAvatar, TH, TD, NUM, money } from "./parts";

/**
 * Creator — the tokens this wallet launched. A tab in the portfolio activity
 * strip, not a page: what happens to a launched token (does it trade, who holds
 * it, is the seeded pool still in range) is portfolio work.
 *
 * Two vocabularies meet here and must not blur. The token's own price is a
 * **rate** (`1 NOVA = 0.0412 USDC`) per the launch and liquidity specs; the
 * aggregates are genuine portfolio value and stay in **USD** like every other
 * tab. See apps/web/CLAUDE.md.
 */

const CHANGE_CLASS = {
  up: "text-[color:var(--m-success)]",
  down: "text-[color:var(--m-error)]",
  flat: "text-[color:var(--m-text-secondary-2)]",
} as const;

/**
 * Marks a value no service computes yet — holder counts, per-position fees and
 * fee tier have no column in broker, gateway or admin-service (see the data-map
 * artifact). The number is illustrative, and a bare figure would claim otherwise.
 * Delete the marker per field as each source lands.
 */
function Est() {
  return (
    <sup
      title="Illustrative — no indexer field backs this yet"
      className="ml-0.5 cursor-help font-mono text-[8.5px] font-semibold uppercase tracking-wide text-[color:var(--m-warning)]"
    >
      est
    </sup>
  );
}

/**
 * Listing — the three-state List control.
 *
 * Graduation is backend-owned and driven by purchases in the quote token.
 * AssetGenerator deliberately exposes no onchain graduation transaction.
 *
 * A launched token is hidden from every ranked list in the app until its market
 * holds the threshold in QUOTE liquidity. Below it the button is rendered
 * DISABLED rather than hidden: the same call this flow already makes for the
 * struck-through approval row and `Edit logo & description`. A control that
 * quietly disappears reads as a bug; a disabled one naming the shortfall reads
 * as a rule.
 *
 * The click carries no authority — see lib/portfolio/graduate.ts. It asks the
 * server to re-check, and the server decides.
 */
function ListingBlock({ token: t }: { token: CreatorToken }) {
  const [pending, setPending] = useState(false);
  // Optimistic local override so a successful graduation updates the row
  // without waiting for the indexer to catch up and re-render the tab.
  const [listedNow, setListedNow] = useState(false);

  const info = {
    quoteTvlUsd: t.quoteTvlUsd,
    thresholdUsd: t.thresholdUsd,
    graduatedAt: t.graduatedAt,
    graduatedAtQuoteTvlUsd: t.graduatedAtQuoteTvlUsd,
  };
  const state = listedNow ? "graduated" : graduationState(info);
  const enabled = canGraduate(info) && !pending && !listedNow;

  const graduate = async () => {
    if (!t.pairId) return;
    setPending(true);
    try {
      const result = await requestGraduation(t.pairId, slugFor(t.network));
      if (result.graduated) {
        setListedNow(true);
        toast.success(`${t.symbol} is listed`);
      } else if (result.heldForApproval) {
        // Threshold met but auto-listing is off — an operator has to approve.
        toast.success("Threshold met — waiting on an Rate operator to approve the listing.");
      } else {
        toast.error(`Not yet — ${usdCompact(result.shortfallUsd)} more quote liquidity needed.`);
      }
    } catch (error) {
      toast.error(
        error instanceof GraduationError ? error.message : "Could not reach the listing service.",
      );
    } finally {
      setPending(false);
    }
  };

  // Nothing to graduate: the token has no market yet.
  if (!t.pairId) return null;

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-2 rounded-[11px] border px-3 py-2.5",
        state === "graduated"
          ? "border-[color:var(--m-success)]"
          : state === "eligible"
            ? "border-[color:var(--m-primary)]"
            : "border-dashed border-[color:var(--m-border)]",
      )}
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        Listing
      </div>

      {state === "graduated" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="logo">
            {t.graduatedAt
              ? `Listed · ${new Date(t.graduatedAt * 1000).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`
              : "Listed"}
          </Pill>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface)]">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${graduationProgressPct(info)}%`,
                backgroundColor:
                  state === "eligible" ? "var(--m-success)" : "var(--m-text-secondary-2)",
              }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary-2)]">
            <b className="text-[color:var(--m-text-primary)]">{usdCompact(t.quoteTvlUsd)}</b> of{" "}
            {usdCompact(t.thresholdUsd)} quote liquidity
          </span>
        </div>
      )}

      {state !== "graduated" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!enabled}
            onClick={() => void graduate()}
            className={cn(
              "rounded-[9px] border px-3 py-1.5 font-mono text-[11.5px] font-semibold transition-colors",
              enabled
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                : "cursor-not-allowed border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]",
            )}
          >
            {pending ? "Checking…" : `List ${t.symbol}`}
          </button>
        </div>
      )}

      <p className="m-0 text-[11.5px] text-[color:var(--m-text-secondary)]">
        {graduationHelp(t.symbol, info)}
      </p>

      {state === "graduated" && (
        <Link
          href={buildPageUrl("trade", {
            pro: true,
            // The coin by address (the quote is known here only by symbol; the
            // page matches it among this coin's own markets).
            base: marketParam({ id: t.address, symbol: t.symbol }),
            quote: t.quote,
            slug: slugFor(t.network),
          })}
          className="font-mono text-[11.5px] text-[color:var(--m-primary)]"
        >
          Trade {t.symbol} ↗
        </Link>
      )}
    </div>
  );
}

/** Seconds since epoch, ticking once a second — mounted-only, for the graduation countdown. */
function useNowSec(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The sell ladder, graduation, the creator's fee and volatility, and the pool
 * position graduation creates — all `AssetGenerator`, all read from the chain
 * (`useCoinLaunch`).
 *
 * This is NOT the block above. `ListingBlock` is quote TVL flipping
 * `spotPairs.verified` so the market appears in ranked lists, driven by a POST
 * that carries no authority. This one is the coin's five sell steps selling
 * out ON CHAIN, then two `graduate` calls; every action in it is a wallet
 * transaction. A coin can have either, both or neither, so the two never share
 * a verb: that one says **List**, this one says **Graduate**.
 */
function LaunchControlsBlock({ token: t }: { token: CreatorToken }) {
  const { address } = useAccount();
  const query = useCoinLaunch(t.network, t.address);
  const s = query.data;
  const nowSec = useNowSec();
  const [pending, setPending] = useState<null | "graduate" | "config" | "collect" | "release">(null);
  const [feeNum, setFeeNum] = useState<number | null>(null);
  const [bps, setBps] = useState<number | null>(null);

  if (!s || nowSec === 0) return null;

  const execution = coinAdminFor(t.network);
  const status = graduationStatus(s, nowSec);
  const blockedBy = controlBlockedBy(s);
  const isCreator = Boolean(address) && address!.toLowerCase() === s.creator.toLowerCase();
  const bounds = {
    minVolatilityBps: s.minVolatilityBps,
    maxVolatilityBps: s.maxVolatilityBps,
    minFee: s.minFeeNum,
    maxFee: s.maxCreatorTakerFeeNum,
  };
  const fees = allowedFees(bounds);
  const vols = allowedVolatility(bounds);
  const chosenFee = feeNum ?? s.takerFeeNum;
  const chosenBps = bps ?? s.slippageLimitBps;
  const dirty = chosenFee !== s.takerFeeNum || chosenBps !== s.slippageLimitBps;
  const editable = blockedBy === null && isCreator && pending === null;
  const sold = stepsSoldCount(s);
  const vested = vestedBps(s.graduatedAt, nowSec);
  const fmtQuote = (raw: bigint) =>
    `${quoteAmount(raw, s.quoteDecimals).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${s.quoteSymbol}`;
  const wait = Math.max(0, s.readyAt - nowSec);

  const run = async (kind: "graduate" | "config" | "collect" | "release") => {
    if (!address && kind !== "graduate") return;
    setPending(kind);
    try {
      if (kind === "graduate") {
        const arming = status === "armable";
        await execution.graduate(t.address);
        toast.success(
          arming
            ? `${t.symbol}'s graduation is armed. Finish it in 5 minutes.`
            : `${t.symbol} graduated. The pool is open, and fee and volatility are yours to set.`,
        );
      } else if (kind === "config") {
        await execution.setTradingConfig(t.address, chosenBps, chosenFee);
        toast.success(`${t.symbol}: taker fee ${formatTakerFee(chosenFee)}, volatility ${(chosenBps / 100).toFixed(2)}%`);
      } else if (kind === "collect") {
        await execution.collectFees(t.address, address!);
        toast.success("Fees collected to your wallet.");
      } else {
        await execution.releaseVested(t.address, address!);
        toast.success("Vested liquidity released to your wallet.");
      }
      await query.refetch();
    } catch (error) {
      // describeCoinAdminError already turned the revert into a sentence.
      toast.error(error instanceof Error ? error.message : "The transaction failed. Nothing was changed.");
    } finally {
      setPending(null);
    }
  };

  const chip = (on: boolean) =>
    cn(
      "rounded-[8px] border px-2 py-1.5 font-mono text-[11px] font-semibold",
      on
        ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary-100)] text-[color:var(--m-primary-700)]"
        : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]",
      !editable && "cursor-not-allowed opacity-60",
    );
  const action = "self-start rounded-[9px] border px-3 py-1.5 font-mono text-[11.5px] font-semibold";

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 rounded-[11px] border px-3 py-2.5",
        status === "graduated"
          ? "border-[color:var(--m-primary)]"
          : status === "selling"
            ? "border-dashed border-[color:var(--m-border)]"
            : "border-[color:var(--m-success)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
          Launch
        </span>
        {status === "graduated" ? <Pill tone="logo">Graduated</Pill> : <Pill tone="muted">{sold} of 5 steps sold</Pill>}
        {blockedBy === "locked" && <Pill tone="muted">Fee locked by an operator</Pill>}
      </div>

      {status === "graduated" && (
        <p data-testid="creator-pool-risk" className="m-0 text-[12px] leading-snug text-[color:var(--m-text-secondary)]">
          Others can push this pool&apos;s price and trade against it; Rate is an order-book DEX.{" "}
          <Link href="/fees#risks" className="underline underline-offset-2">How</Link>
        </p>
      )}

      {status !== "graduated" && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-5 gap-1" aria-label={`${sold} of 5 sell steps sold`}>
            {s.stepsSold.map((done, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full"
                style={{ backgroundColor: done ? "var(--m-success)" : "var(--m-surface)" }}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary-2)]">
            <b className="text-[color:var(--m-text-primary)]">{fmtQuote(s.quoteRaised)}</b> raised · graduates at{" "}
            {fmtQuote(s.graduationMarketCap)} market cap
          </span>
          {status === "armable" && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void run("graduate")}
              className={cn(action, "border-[color:var(--m-success)] bg-[color:var(--m-success)] text-[color:var(--m-on-primary)]")}
            >
              {pending === "graduate" ? "Confirming…" : "Arm graduation"}
            </button>
          )}
          {status === "armed" && (
            <span className="font-mono text-[11.5px] text-[color:var(--m-text-primary)]">
              Graduation armed. Ready in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}
            </span>
          )}
          {status === "ready" && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void run("graduate")}
              className={cn(action, "border-[color:var(--m-success)] bg-[color:var(--m-success)] text-[color:var(--m-on-primary)]")}
            >
              {pending === "graduate" ? "Confirming…" : `Graduate ${t.symbol}`}
            </button>
          )}
          <span className="text-[11px] text-[color:var(--m-text-secondary)]">
            Anyone can graduate it once every step sells. Fee and volatility become yours then.
          </span>
        </div>
      )}

      {status === "graduated" && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
            Taker fee · now {formatTakerFee(s.takerFeeNum)}
          </span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`${t.symbol} taker fee`}>
            {fees.map((tier) => (
              <button
                key={tier}
                type="button"
                role="radio"
                aria-checked={chosenFee === feeTierNum(tier)}
                disabled={!editable}
                onClick={() => setFeeNum(feeTierNum(tier))}
                className={chip(chosenFee === feeTierNum(tier))}
              >
                {tier}%
              </button>
            ))}
          </div>
          <span className="font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
            Volatility · now {(s.slippageLimitBps / 100).toFixed(2)}%
          </span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`${t.symbol} volatility`}>
            {vols.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={chosenBps === v.bps}
                disabled={!editable}
                onClick={() => setBps(v.bps)}
                className={chip(chosenBps === v.bps)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {editable && (
            <button
              type="button"
              disabled={!dirty}
              onClick={() => void run("config")}
              className={cn(
                "self-end rounded-[9px] border px-3 py-1.5 font-mono text-[11.5px] font-semibold",
                dirty
                  ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                  : "cursor-not-allowed border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]",
              )}
            >
              Save
            </button>
          )}
        </div>
      )}

      {status === "graduated" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--m-border)] pt-2.5">
          <span className="text-[11.5px] text-[color:var(--m-text-secondary)]">
            {s.lockMode === "feesOnly"
              ? "Pool liquidity stays forever. You collect its fees."
              : `Pool liquidity vests over 12 months: ${(vested / 100).toFixed(1)}% vested, ${(s.releasedBps / 100).toFixed(1)}% released.`}
          </span>
          {isCreator && (
            <span className="flex gap-1.5">
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void run("collect")}
                className="rounded-[9px] border border-[color:var(--m-border)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-text-primary)]"
              >
                {pending === "collect" ? "Confirming…" : "Collect fees"}
              </button>
              {s.lockMode === "vest12Months" && (
                <button
                  type="button"
                  disabled={!canReleaseVested(s, nowSec) || pending !== null}
                  onClick={() => void run("release")}
                  className={cn(
                    "rounded-[9px] border px-3 py-1.5 font-mono text-[11.5px]",
                    canReleaseVested(s, nowSec)
                      ? "border-[color:var(--m-primary)] text-[color:var(--m-primary)]"
                      : "cursor-not-allowed border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]",
                  )}
                >
                  {pending === "release" ? "Confirming…" : "Release vested"}
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A row's links target the chain that token launched on, not the page's chain. */
function slugFor(network: string): string {
  return networkNameToSlug[network] ?? DEFAULT_CHAIN_SLUG;
}

export function Creator({ data, networkSlug }: { data: IndexerData; networkSlug: string }) {
  const rows = data.creator;
  const [open, setOpen] = useState<string | null>(rows[0]?.address ?? null);
  const summary = creatorSummary(rows);

  const toggle = (address: string) => setOpen((cur) => (cur === address ? null : address));

  if (rows.length === 0) return <CreatorEmpty networkSlug={networkSlug} />;

  return (
    <>
      {/* header strip — creator aggregates live here, not in the page's four tiles */}
      <div className="grid grid-cols-2 gap-px border-b border-[color:var(--m-border)] bg-[color:var(--m-border)] sm:grid-cols-4">
        {[
          { k: "Tokens launched", v: String(summary.launched), tone: "" },
          { k: "Liquidity you seeded", v: money(summary.seededUsd), tone: "" },
          {
            k: "Fees earned · all time",
            v: (
              <>
                +${summary.feesEarnedUsd.toFixed(2)}
                <Est />
              </>
            ),
            tone: "text-[color:var(--m-success)]",
          },
          {
            k: "Holders · all tokens",
            v: (
              <>
                {summary.holders.toLocaleString("en-US")}
                <Est />
              </>
            ),
            tone: "text-[color:var(--m-logo)]",
          },
        ].map((c) => (
          <div key={c.k} className="bg-[color:var(--m-surface)] px-4 py-3.5">
            <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {c.k}
            </div>
            <div className={cn("mt-0.5 text-base font-semibold tabular-nums", c.tone)}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[
                "Token",
                "Rate",
                "24h",
                "Market cap",
                "Holders",
                "24h volume",
                "Pool",
                "You hold",
                "",
              ].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const expanded = open === t.address;
              return [
                <tr
                  key={t.address}
                  className={cn(
                    "cursor-pointer hover:bg-[color:var(--m-surface-2)]",
                    expanded && "bg-[color:var(--m-surface-2)]"
                  )}
                  onClick={() => toggle(t.address)}
                >
                  <td className={TD}>
                    <TokenIdentity token={t} />
                  </td>
                  <td className={`${TD} ${NUM}`}>{formatRate(t)}</td>
                  <td className={`${TD} ${NUM} ${CHANGE_CLASS[changeTone(t.change24hPct)]}`}>
                    {formatChange(t.change24hPct)}
                  </td>
                  <td className={`${TD} ${NUM} font-semibold`}>
                    {formatMarketCap(t.marketCapUsd)}
                  </td>
                  <td className={`${TD} ${NUM}`}>
                    {t.holders.toLocaleString("en-US")}
                    <Est />
                  </td>
                  <td className={`${TD} ${NUM}`}>{money(t.volume24hUsd)}</td>
                  <td className={TD}>
                    <Pill tone={t.inRange ? "logo" : "muted"}>
                      {t.inRange ? "In-range" : "Out of range"}
                    </Pill>
                  </td>
                  <td className={`${TD} ${NUM}`}>
                    {t.creatorAmount}{" "}
                    <span className="text-[color:var(--m-text-secondary-2)]">
                      · {supplySplit(t).creator}%
                    </span>
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${t.symbol}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(t.address);
                      }}
                      className="px-1 text-[color:var(--m-text-secondary-2)]"
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                  </td>
                </tr>,
                expanded ? (
                  <tr key={`${t.address}-detail`}>
                    <td colSpan={9} className="border-b border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-0">
                      <TokenDetail token={t} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
        {rows.map((t) => (
          <CreatorCard key={t.address} token={t} />
        ))}
      </div>

      <div className="px-4 pb-3.5 pt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
        Prices here are rates in the launch market&apos;s quote token, never a USD price. Totals are
        portfolio value and stay in USD. Values marked <Est /> are illustrative — holder counts,
        per-position fees and fee tier have no source in the indexer yet.
      </div>
    </>
  );
}

/** Symbol + chain chip, with the honest sub-line: age, and whether the logo is still a placeholder. */
function TokenIdentity({ token: t }: { token: CreatorToken }) {
  return (
    <div className="flex items-center gap-2.5">
      <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} />
      <div className="flex min-w-0 flex-col leading-tight">
        <b className="flex items-center gap-1.5 text-[13px] font-semibold">
          {t.symbol}
          <ChainChip network={t.network} />
        </b>
        <span className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--m-text-secondary-2)]">
          {t.name} · live {t.age}
          {/* Listing status rides the identity cell so it is visible without
              expanding the row — an unlisted token is absent from every ranked
              list in the app, which is the single most important fact about it. */}
          {t.pairId && t.graduatedAt === null && (
            <span
              title={`Unlisted — needs ${usdCompact(
                Math.max(0, t.thresholdUsd - t.quoteTvlUsd),
              )} more quote liquidity to list`}
              className="rounded-[5px] border px-1.5 py-px font-mono text-[9px] uppercase"
              style={{
                color:
                  t.quoteTvlUsd >= t.thresholdUsd
                    ? "var(--m-success)"
                    : "var(--m-text-secondary-2)",
                borderColor:
                  t.quoteTvlUsd >= t.thresholdUsd
                    ? "var(--m-success)"
                    : "var(--m-text-secondary-2)",
              }}
            >
              {t.quoteTvlUsd >= t.thresholdUsd ? "ready to list" : "unlisted"}
            </span>
          )}
          {t.logoPending && (
            <span
              className="rounded-[5px] border px-1.5 py-px font-mono text-[9px]"
              style={{ color: "var(--m-warning)", borderColor: "var(--m-warning)" }}
            >
              placeholder logo
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function DKey({ children }: { children: React.ReactNode }) {
  return <dt className="text-[color:var(--m-text-secondary)]">{children}</dt>;
}
function DVal({ children }: { children: React.ReactNode }) {
  return <dd className="m-0 text-right font-mono tabular-nums">{children}</dd>;
}

/** Expanded row — the contract, the supply split, and the launch position. */
function TokenDetail({ token: t }: { token: CreatorToken }) {
  const split = supplySplit(t);
  const editable = canEditMetadata(t);

  const copy = () => {
    void navigator.clipboard?.writeText(t.address);
    toast.success("Contract address copied");
  };

  return (
    <div className="grid gap-5 p-4 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <h4 className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
          Contract
        </h4>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3.5 gap-y-1.5 text-[12.5px]">
          <DKey>Address</DKey>
          <DVal>
            <span title={t.address}>
              {t.address.slice(0, 6)}…{t.address.slice(-4)}
            </span>
            <button
              type="button"
              onClick={copy}
              className="ml-1.5 rounded-md border border-[color:var(--m-border)] px-1.5 text-[10.5px] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
            >
              copy
            </button>
          </DVal>
          <DKey>Deployed</DKey>
          <DVal>
            {t.deployedAt}{" "}
            <a href={`#${t.txHash}`} title={t.txHash} className="text-[color:var(--m-primary)]">
              tx ↗
            </a>
          </DVal>
          <DKey>Total supply</DKey>
          <DVal>
            {t.totalSupply} {t.symbol}
          </DVal>
          <DKey>Contract powers</DKey>
          <DVal>
            <span className="text-[color:var(--m-text-secondary-2)]">
              supply fixed · no mint · no owner
            </span>
          </DVal>
        </dl>

        <div className="mt-3.5">
          <div className="flex h-2 overflow-hidden rounded-[4px] bg-[color:var(--m-surface)]">
            <span
              className="block h-full"
              style={{ width: `${split.pool}%`, backgroundColor: "var(--m-primary)" }}
            />
            <span
              className="block h-full"
              style={{ width: `${split.creator}%`, backgroundColor: "var(--m-logo)" }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3.5 text-[11px] text-[color:var(--m-text-secondary)]">
            <span>
              <i
                className="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle"
                style={{ backgroundColor: "var(--m-primary)" }}
              />
              Seeded to pool · {t.poolAmount}
            </span>
            <span>
              <i
                className="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle"
                style={{ backgroundColor: "var(--m-logo)" }}
              />
              Your allocation · {t.creatorAmount}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
          Your position in the launch pool
        </h4>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3.5 gap-y-1.5 text-[12.5px]">
          <DKey>Range</DKey>
          <DVal>
            {t.rangeLow} → {t.rangeHigh} {t.quote}
          </DVal>
          <DKey>Sold into the book</DKey>
          <DVal>
            {t.soldAmount} {t.symbol} · {t.soldPct}%
          </DVal>
          <DKey>Fees earned</DKey>
          <DVal>
            <span className="text-[color:var(--m-success)]">+${t.feesEarnedUsd.toFixed(2)}</span>
            <Est />
          </DVal>
          <DKey>Fee tier</DKey>
          <DVal>
            {t.feeTierPct}%
            {!t.feeTierRead && <Est />}
          </DVal>
        </dl>

        {/* Metadata edit is deliberately inert: adminTokenMeta has no ownerAddress,
            so the server only takes the operator key. Shown struck through rather
            than hidden — a row that quietly disappears reads as a bug. */}
        <div className="mt-3 flex flex-col gap-1.5 rounded-[11px] border border-dashed border-[color:var(--m-border)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!editable}
              className={cn(
                "rounded-[9px] border border-[color:var(--m-border)] px-2.5 py-1 font-mono text-[11.5px]",
                editable
                  ? "text-[color:var(--m-primary)] hover:border-[color:var(--m-primary)]"
                  : "cursor-not-allowed text-[color:var(--m-text-secondary-2)] line-through"
              )}
            >
              Edit logo &amp; description
            </button>
            {!editable && <Pill tone="muted">Needs ownership claim</Pill>}
          </div>
          {!editable && (
            <p className="m-0 text-[11.5px] text-[color:var(--m-text-secondary)]">
              Token metadata is operator-writable only today, so this stays disabled until a launched
              token can be claimed by the wallet that deployed it.
            </p>
          )}
        </div>

        <ListingBlock token={t} />
        <LaunchControlsBlock token={t} />

        {/* Pair-bound links must target Pro and go through buildPageUrl — a
            hand-built /trade URL drops the pair silently. The slug is the
            token's own chain, not the page's. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            href={buildPageUrl("trade", {
              pro: true,
              base: marketParam({ id: t.address, symbol: t.symbol }),
              quote: t.quote,
              slug: slugFor(t.network),
            })}
            className="rounded-[9px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-3 py-1.5 font-mono text-[11.5px] font-semibold text-[color:var(--m-on-primary)]"
          >
            Trade {t.symbol}
          </Link>
          <Link
            href={buildPageUrl("pool", { slug: slugFor(t.network) })}
            className="rounded-[9px] border border-[color:var(--m-border)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
          >
            Open in Pool
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Mobile card — same shape as the OCard used by the other tabs. */
function CreatorCard({ token: t }: { token: CreatorToken }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} size="md" />
        <b className="flex items-center gap-1.5 text-sm font-semibold">
          {t.symbol}
          <ChainChip network={t.network} />
        </b>
        <span className="ml-auto">
          <Pill tone={t.inRange ? "logo" : "muted"}>{t.inRange ? "In-range" : "Out"}</Pill>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {[
          { k: "Rate", v: `${t.rate} ${t.quote}` },
          {
            k: "24h",
            v: (
              <span className={CHANGE_CLASS[changeTone(t.change24hPct)]}>
                {formatChange(t.change24hPct)}
              </span>
            ),
          },
          { k: "Market cap", v: formatMarketCap(t.marketCapUsd) },
          {
            k: "Holders",
            v: (
              <span>
                {t.holders.toLocaleString("en-US")}
                <Est />
              </span>
            ),
          },
          { k: "24h volume", v: money(t.volume24hUsd) },
          { k: "You hold", v: t.creatorAmount },
          {
            k: "Fees earned",
            v: (
              <span className="text-[color:var(--m-success)]">
                +${t.feesEarnedUsd.toFixed(2)}
                <Est />
              </span>
            ),
          },
        ].map((kv) => (
          <div key={kv.k}>
            <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {kv.k}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">{kv.v}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2.5 w-full rounded-[9px] border border-[color:var(--m-border)] px-3 py-2 text-center font-mono text-[11.5px] text-[color:var(--m-primary)]"
      >
        {open ? "Hide detail" : "Token detail"}
      </button>
      {open && (
        <div className="mt-2.5 rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)]">
          <TokenDetail token={t} />
        </div>
      )}
    </div>
  );
}

/**
 * Shown whenever the connected wallet has no indexed launches yet.
 */
function CreatorEmpty({ networkSlug }: { networkSlug: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-11 text-center">
      <span
        className="grid h-11 w-11 place-items-center rounded-[12px] text-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--m-logo) 14%, transparent)",
          color: "var(--m-logo)",
        }}
      >
        ◇
      </span>
      <h3 className="mt-1 text-base font-semibold">You haven&apos;t launched a token</h3>
      <p className="max-w-[44ch] text-[13px] text-[color:var(--m-text-secondary)]">
        Deploy an ERC-20, open its first market and seed the pool in one transaction. Anything you
        launch shows up here with its market, holders and pool position.
      </p>
      <Link
        href={buildPageUrl("create", { slug: networkSlug })}
        className="mt-1.5 rounded-[10px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--m-on-primary)]"
      >
        Launch a token
      </Link>
    </div>
  );
}
