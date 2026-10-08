"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { IndexerData, RewardStatus } from "@/lib/portfolio/types";
import { ChainChip, Pill, TH, TD, NUM } from "./parts";
import { TabEmpty } from "./ActivityTabs";
import { SeasonNotice, SeasonPayoutDate, SeasonPayoutWhen } from "@/components/Rewards/SeasonNotice";

const PTS = "font-mono font-semibold tabular-nums text-[color:var(--m-logo)]";

function statusTone(s: RewardStatus): "primary" | "muted" {
  return s === "Claimed" ? "muted" : "primary";
}
function statusLabel(s: RewardStatus): string {
  return s === "Accruing" ? "Accruing" : s === "Claimed" ? "Claimed" : "Claimable";
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function Rewards({
  data,
  onOpenReferrals,
}: {
  data: IndexerData;
  /** Sends the reader to the Referrals tab from the referral card. */
  onOpenReferrals?: () => void;
}) {
  const { summary, rows } = data.rewards;
  // The same object the Referrals tab renders, for the terms and the referee
  // count beside the figure. The POINTS come from `summary.referralPts` — see
  // the card below for why the two fields answer different questions.
  const referrals = data.referrals.summary;
  const [claimed, setClaimed] = useState<Record<number, boolean>>({});

  const claim = (i: number, pts: number) => {
    setClaimed((c) => ({ ...c, [i]: true }));
    toast.success(`Claimed ${fmt(pts)} pts`);
  };

  /**
   * Four cards, and the fourth is the referral programme.
   *
   * It is a CARD rather than a table row because the table is a ledger and
   * drops zero rows (`toRewardRows`) — so a wallet that has not earned a
   * referral point yet had nothing on this tab naming referrals at all, which
   * reads as "this venue has no referral programme" rather than "you have
   * earned nothing from it". A card states the figure whatever it is.
   *
   * `summary.referralPts` is derived in `toRewardSummary` from the same
   * `bySource` the rows come from, so the card and the "Referral cut" /
   * "Referral bonus" rows beneath it can never disagree.
   */
  const referralCard = {
    k: "Referral · earned",
    v: `${fmt(summary.referralPts)} pts`,
    // The programme's own terms, so a zero reads as "nothing yet" rather than
    // as a feature that does not exist. Omitted when admin-service published no
    // config — a hardcoded percentage is the drift this data path exists to
    // avoid.
    sub:
      referrals.cutPct > 0
        ? `${referrals.cutPct}% of referees' order-book fees, as points · ${referrals.referred} referred`
        : undefined,
    onClick: onOpenReferrals,
  };

  const summaryCards = (
    <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-1.5 pt-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { k: "Earned · all time", v: `${fmt(summary.earnedPts)} pts` },
        // Not "Claimable now": rewards are pushed as $RATE at the season's end,
        // so the useful figure is WHEN, not a claim balance that is always 0.
        { k: "$RATE payout", v: <SeasonPayoutDate />, sub: <SeasonPayoutWhen /> },
        { k: `This epoch · ${summary.epoch}`, v: `${fmt(summary.epochPts)} pts` },
        referralCard,
      ].map((c) => {
        const body = (
          <>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {c.k}
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-[color:var(--m-logo)]">
              {c.v}
            </div>
            {"sub" in c && c.sub && (
              <div className="mt-1 text-[11px] leading-snug text-[color:var(--m-text-secondary-2)]">
                {c.sub}
              </div>
            )}
          </>
        );
        const shell =
          "rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 py-3";
        // Only the referral card is actionable, and only when the page gave it
        // somewhere to go — a button that does nothing is worse than a div.
        return "onClick" in c && c.onClick ? (
          <button
            key={c.k}
            type="button"
            onClick={c.onClick}
            className={`${shell} text-left transition-colors hover:border-[color:var(--m-primary)]`}
          >
            {body}
          </button>
        ) : (
          <div key={c.k} className={shell}>
            {body}
          </div>
        );
      })}
    </div>
  );

  const note = (
    <div className="px-4 pb-3.5 pt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
      Points are your share of each season&apos;s $RATE. At the end of the season, $RATE is sent to
      your wallet on each chain you earned on — there is nothing to claim.
    </div>
  );

  /*
   * A wallet with no points rendered a bare `<thead>` and nothing under it —
   * five column headings over empty space, on the tab someone opened to find
   * out what they had earned. The cards above still state the figures, so this
   * explains the empty LEDGER rather than repeating them.
   *
   * No CTA: points accrue from trading, providing liquidity and referring, and
   * picking one of those as "the" action would misdescribe the other two.
   */
  if (rows.length === 0) {
    return (
      <>
        <SeasonNotice className="px-4 pt-3.5" />
        {summaryCards}
        <TabEmpty
          loading={false}
          glyph="◈"
          title="No points yet"
          body="Points accrue each epoch from trading, providing liquidity and referring friends, and become $RATE at the end of the season. Anything you earn shows up here, split by source."
        />
      </>
    );
  }

  return (
    <>
      <SeasonNotice className="px-4 pt-3.5" />
      {summaryCards}

      {/* desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Source", "Chain", "Earned", "Epoch", "Status", ""].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                <td className={TD}>{r.source}</td>
                <td className={TD}>
                  {r.network ? (
                    <ChainChip network={r.network} />
                  ) : (
                    <span className="text-[color:var(--m-text-secondary-2)]">—</span>
                  )}
                </td>
                <td className={`${TD} ${PTS}`}>{fmt(r.earnedPts)}</td>
                <td className={`${TD} ${NUM} text-[color:var(--m-text-secondary)]`}>{r.epoch}</td>
                <td className={TD}>
                  <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                </td>
                <td className={TD}>
                  {r.status === "Claimable" &&
                    (claimed[i] ? (
                      <span className="font-mono text-[11.5px] text-[color:var(--m-success)]">
                        Claimed ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => claim(i, r.earnedPts)}
                        className="rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-2.5 py-1 font-mono text-[11.5px] text-[color:var(--m-on-primary)]"
                      >
                        Claim
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3.5"
          >
            <div className="flex items-center gap-2">
              <b className="text-sm font-semibold">{r.source}</b>
              {r.network && <ChainChip network={r.network} />}
              <span className="ml-auto">
                <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
              </span>
            </div>
            <div className="mt-2.5 flex items-end justify-between">
              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
                  Earned · epoch {r.epoch}
                </div>
                <div className={`${PTS} text-base`}>{fmt(r.earnedPts)}</div>
              </div>
              {r.status === "Claimable" &&
                (claimed[i] ? (
                  <span className="font-mono text-xs text-[color:var(--m-success)]">Claimed ✓</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => claim(i, r.earnedPts)}
                    className="rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-3 py-1.5 font-mono text-xs text-[color:var(--m-on-primary)]"
                  >
                    Claim
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {note}
    </>
  );
}
