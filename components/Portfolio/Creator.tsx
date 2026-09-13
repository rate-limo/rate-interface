"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { CreatorToken, IndexerData } from "@/lib/portfolio/types";
import {
  canEditMetadata,
  canGraduate,
  canGraduateFeeTier,
  canSetTakerFee,
  feeControlBlockedBy,
  feeControlHelp,
  feeTierProgressPct,
  feeTierState,
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
import { GRADUATED_FEE_PRESETS, MAX_GRADUATED_FEE_NUM } from "@/lib/fees/strategy";
import { describeCoinAdminError, mockCoinAdmin } from "@/lib/portfolio/coinAdmin";
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
        toast.success("Threshold met — waiting on an Iter operator to approve the listing.");
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
            base: t.symbol,
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

/**
 * Fee tier — CoinGenerator's graduation, and the creator's control of the taker fee.
 *
 * This is NOT the block above. `ListingBlock` is quote TVL flipping `spotPairs.verified`
 * so the market appears in ranked lists, driven by a POST that carries no authority.
 * This one is market cap clearing `graduationUsd` ON CHAIN, its effect is the taker fee,
 * and both of its actions are wallet transactions. A coin can have either, both or
 * neither, so the two never share a verb: that one says **List**, this one says
 * **Graduate**.
 *
 * The market cap shown here is `contractMarketCapUsd` — what `usdValueOf()` reads off the
 * books — never the `marketCapUsd` column in the row above it. Only the contract's figure
 * decides whether `graduate()` succeeds, and promising eligibility the contract then
 * refuses is the specific bug this avoids.
 */
function FeeBlock({ token: t }: { token: CreatorToken }) {
  const info = {
    contractMarketCapUsd: t.contractMarketCapUsd,
    graduationUsd: t.graduationUsd,
    feeGraduated: t.feeGraduated,
    takerFeeNum: t.takerFeeNum,
    maxCreatorTakerFeeNum: t.maxCreatorTakerFeeNum,
    creatorFeeLocked: t.creatorFeeLocked,
  };

  const [pending, setPending] = useState<null | "graduate" | "fee">(null);
  const [feeNum, setFeeNum] = useState(t.takerFeeNum);
  const [live, setLive] = useState(info);

  const state = feeTierState(live);
  const blockedBy = feeControlBlockedBy(live);
  const editable = canSetTakerFee(live) && pending === null;
  const creatorCeiling = Math.min(live.maxCreatorTakerFeeNum, MAX_GRADUATED_FEE_NUM);
  const feePresets = GRADUATED_FEE_PRESETS.filter((preset) => preset <= creatorCeiling);
  const dirty = feeNum !== live.takerFeeNum;

  // Injected so the disabled paths are exercised rather than assumed; swapping in wagmi
  // changes nothing in this component (see lib/portfolio/coinAdmin).
  const [execution] = useState(() =>
    mockCoinAdmin({
      feeGraduated: t.feeGraduated,
      creatorFeeLocked: t.creatorFeeLocked,
      maxCreatorTakerFeeNum: t.maxCreatorTakerFeeNum,
      eligible: canGraduateFeeTier(info),
    }),
  );

  const run = async (kind: "graduate" | "fee") => {
    setPending(kind);
    try {
      if (kind === "graduate") {
        await execution.graduate(t.address);
        setLive((s) => ({ ...s, feeGraduated: true, takerFeeNum: 100_000 }));
        setFeeNum(100_000);
        toast.success(`${t.symbol} graduated — taker fee is now ${formatTakerFee(100_000)}`);
      } else {
        await execution.setTakerFee(t.address, feeNum);
        setLive((s) => ({ ...s, takerFeeNum: feeNum }));
        toast.success(`${t.symbol} taker fee set to ${formatTakerFee(feeNum)}`);
      }
    } catch (error) {
      // The revert reason IS the message. See describeCoinAdminError.
      toast.error(describeCoinAdminError(error).message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-2 rounded-[11px] border px-3 py-2.5",
        state === "graduated"
          ? "border-[color:var(--m-primary)]"
          : state === "eligible"
            ? "border-[color:var(--m-success)]"
            : "border-dashed border-[color:var(--m-border)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
          Taker fee
        </span>
        {blockedBy === "not-graduated" && <Pill tone="muted">Set by Iter</Pill>}
        {blockedBy === "locked" && <Pill tone="muted">Paused by an operator</Pill>}
        {editable && <Pill tone="logo">Yours to set</Pill>}
      </div>

      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[19px] font-semibold tabular-nums">{formatTakerFee(live.takerFeeNum)}</span>
        {state !== "graduated" && (
          <span className="font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
            starting rate for {t.quote} launches
          </span>
        )}
      </div>

      {/* Progress toward the CONTRACT's requirement, on the contract's own figure. */}
      {state !== "graduated" && t.graduationUsd > 0 && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface)]">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${feeTierProgressPct(live)}%`,
                backgroundColor: state === "eligible" ? "var(--m-success)" : "var(--m-text-secondary-2)",
              }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary-2)]">
            <b className="text-[color:var(--m-text-primary)]">
              {t.contractMarketCapUsd === null ? "—" : usdCompact(t.contractMarketCapUsd)}
            </b>{" "}
            of {usdCompact(t.graduationUsd)} market cap
          </span>
        </div>
      )}

      {/* The creator's control. Rendered in every state; disabled in three of them. */}
      {editable ? (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`${t.symbol} graduated fee preset`}>
            {feePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={feeNum === preset}
                onClick={() => setFeeNum(preset)}
                className={cn(
                  "rounded-[8px] border px-2 py-2 font-mono text-[11px] font-semibold",
                  feeNum === preset
                    ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary-100)] text-[color:var(--m-primary-700)]"
                    : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]",
                )}
              >
                {formatTakerFee(preset)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
              Protocol presets · {formatTakerFee(creatorCeiling)} ceiling
            </span>
          <button
            type="button"
            disabled={!dirty || pending !== null}
            onClick={() => void run("fee")}
            className={cn(
              "rounded-[9px] border px-3 py-1.5 font-mono text-[11.5px] font-semibold transition-colors",
              dirty && pending === null
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                : "cursor-not-allowed border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]",
            )}
          >
            {pending === "fee" ? "Confirming…" : `Set ${formatTakerFee(feeNum)}`}
          </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-[9px] border border-[color:var(--m-border)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]"
          >
            Adjust fee
          </button>
          {state === "eligible" && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void run("graduate")}
              className="rounded-[9px] border border-[color:var(--m-success)] bg-[color:var(--m-success)] px-3 py-1.5 font-mono text-[11.5px] font-semibold text-[color:var(--m-on-primary)]"
            >
              {pending === "graduate" ? "Confirming…" : `Graduate ${t.symbol}`}
            </button>
          )}
        </div>
      )}

      <p className="m-0 text-[11.5px] text-[color:var(--m-text-secondary)]">
        {state === "graduated"
          ? `Choose a protocol preset. You can sponsor a lower trader fee, but cannot raise ${t.symbol} above the ${formatTakerFee(creatorCeiling)} graduated-market ceiling.`
          : feeControlHelp(t.symbol, live)}
      </p>
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
      <TokenAvatar symbol={t.symbol} />
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
            <Est />
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

        {/* Pair-bound links must target Pro and go through buildPageUrl — a
            hand-built /trade URL drops the pair silently. The slug is the
            token's own chain, not the page's. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            href={buildPageUrl("trade", {
              pro: true,
              base: t.symbol,
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
        <TokenAvatar symbol={t.symbol} size="md" />
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
