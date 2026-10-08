"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { ShareCardModal } from "@/components/Share/ShareCardModal";
import { referralCardUrl, referralShareText, referralShareUrl } from "@/lib/referral/share";
import type { IndexerData } from "@/lib/portfolio/types";
import { ChainChip, Pill, TH, TD, NUM } from "./parts";

const PTS = "font-mono font-semibold tabular-nums text-[color:var(--m-logo)]";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function Referrals({ data }: { data: IndexerData }) {
  const { summary, rows } = data.referrals;
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const copy = async () => {
    try {
      // The live link is already absolute (`toReferralSummary` builds it from the
      // page's origin); prefixing it unconditionally copied "https://http://…".
      await navigator.clipboard?.writeText(
        /^https?:\/\//.test(summary.link) ? summary.link : `https://${summary.link}`,
      );
      setCopied(true);
      toast.success("Referral link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const stats = [
    { k: "Referred", v: String(summary.referred), pts: false },
    { k: "Active", v: String(summary.active), pts: false },
    { k: "Earned", v: `${fmt(summary.earnedPts)} pts`, pts: true },
    // No "Tier N · X%" and no boost stat: there is one flat share of fees, and
    // the footnote states it. The per-attested-referee boost was retired.
  ];

  return (
    <>
      {/* link block */}
      <div className="m-3.5 mb-1.5 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <b className="font-mono text-sm font-semibold">{summary.link}</b>
          <span className="font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
            code · {summary.code}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* The card, not just the link: /r/CODE unfurls as "<name> invited you"
              with the code on it, and the sheet previews exactly that image. No
              code yet means nothing to share. */}
          <button
            type="button"
            onClick={() => setSharing(true)}
            disabled={!summary.code}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--m-border)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Share2 size={13} strokeWidth={1.75} aria-hidden />
            Share
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-3 py-1.5 font-mono text-[11.5px] text-[color:var(--m-on-primary)]"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>
      </div>
      {summary.code && (
        <ShareCardModal
          open={sharing}
          onOpenChange={setSharing}
          title="Share invite"
          label={`Invite code ${summary.code}`}
          text={referralShareText(summary.code)}
          build={(origin) => ({
            shareUrl: referralShareUrl(summary.code),
            cardUrl: referralCardUrl(origin, summary.code),
          })}
          downloadName={`iter-invite-${summary.code}.png`}
        />
      )}

      {/* stat row */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-1 pt-2">
        {stats.map((s) => (
          <div key={s.k}>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              {s.k}
            </div>
            <div
              className={
                s.pts
                  ? `${PTS} mt-0.5 text-base`
                  : "mt-0.5 text-base font-semibold tabular-nums"
              }
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/*
        No rows is the LIVE state, not an error: /points returns the referral
        COUNT but withholds who the referees are, and nothing records their
        volume. The table used to fall back to the mock's four friends beside a
        live "0 referred", which named wallets that do not exist.
      */}
      {rows.length === 0 && (
        <div data-testid="referrals-empty" className="px-4 pb-1 pt-3 text-[12.5px] text-[color:var(--m-text-secondary)]">
          {summary.referred === 0
            ? "No one has joined with your link yet."
            : `${fmt(summary.referred)} joined with your link. Who they are is not shown — only the count.`}
        </div>
      )}

      {/* desktop table */}
      <div className={rows.length === 0 ? "hidden" : "hidden overflow-x-auto lg:block"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Friend", "Chain", "Joined", "Their volume", "You earned", "Status"].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="last:[&>td]:border-0 hover:bg-[color:var(--m-surface-2)]">
                <td className={`${TD} ${NUM}`}>{r.friend}</td>
                <td className={TD}>
                  {r.network ? (
                    <ChainChip network={r.network} />
                  ) : (
                    <span className="text-[color:var(--m-text-secondary-2)]">—</span>
                  )}
                </td>
                <td className={`${TD} ${NUM} text-[color:var(--m-text-secondary-2)]`}>
                  {r.joined}
                </td>
                <td className={`${TD} ${NUM}`}>${r.theirVolumeUsd}</td>
                <td className={`${TD} ${PTS}`}>{fmt(r.earnedPts)}</td>
                <td className={TD}>
                  <Pill tone={r.status === "Active" ? "success" : "muted"}>{r.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className={rows.length === 0 ? "hidden" : "flex flex-col gap-2.5 p-3.5 lg:hidden"}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3.5"
          >
            <div className="flex items-center gap-2">
              <b className="font-mono text-sm font-semibold">{r.friend}</b>
              {r.network && <ChainChip network={r.network} />}
              <span className="ml-auto">
                <Pill tone={r.status === "Active" ? "success" : "muted"}>{r.status}</Pill>
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <KV k="Joined" v={r.joined} />
              <KV k="Their volume" v={`$${r.theirVolumeUsd}`} />
              <KV k="You earned" v={<span className={PTS}>{fmt(r.earnedPts)}</span>} />
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-3.5 pt-2 text-[11.5px] text-[color:var(--m-text-secondary-2)]">
        You earn {summary.cutPct}% of the order-book fees your referrals pay, as points — paid in $RATE at
        the end of each season.{" "}
        <Link href="/affiliate" className="text-[color:var(--m-primary)] hover:underline">
          Have an audience? Apply for your own link →
        </Link>
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        {k}
      </div>
      <div className="mt-0.5 font-mono tabular-nums">{v}</div>
    </div>
  );
}
