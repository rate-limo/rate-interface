"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { referralShareLink } from "@/lib/referral/share";
import { SeasonNotice } from "@/components/Rewards/SeasonNotice";
import { browserStorage, writeSession } from "@/lib/support/store";
import {
  affiliateApplicationMessage,
  isApplicantWallet,
  normaliseXHandle,
  requestedCodeProblem,
} from "@/lib/affiliates/application";
import {
  EXAMPLE_FEE_USD,
  EXAMPLE_POINTS,
  EXAMPLE_TRADE_USD,
  INVITEE_REBATE_PCT,
  REFERRAL_SHARE_PCT,
} from "@/lib/affiliates/terms";

/**
 * Creator onboarding — `rate.limo/affiliate`. One ask: apply for your link.
 *
 * Laid out after fomo.family/affiliates (hero, three steps, why join, FAQ, a
 * closing ask), with Rate's own terms, all derived from the accrual's rule in
 * `lib/affiliates/terms` rather than written here:
 *
 *   * the share is POINTS on order-book TAKER fees, not cash, and not "real-time";
 *   * no paid-to-date figure, because nothing has been paid;
 *   * no perk the venue does not offer — the invitee fee discount stays off this
 *     page until a real trade has proved it onchain.
 *
 * An application is a support ticket, carrying what an operator needs to assign
 * the link: the wallet and the code asked for. There is no mail transport, so
 * the ticket's thread IS the reply channel, and its session is stored the way
 * the support widget stores one so the reply can be read.
 */
export function AffiliateView() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 pb-24 pt-12 text-[color:var(--m-text-primary)]">
      <Hero />
      <Steps />
      <WhyJoin />
      <Faq />
      <ClosingAsk />
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function ApplyLink({ className }: { className: string }) {
  return (
    <a href="#apply" className={className}>
      Apply for your link
    </a>
  );
}

const PRIMARY =
  "rounded-[12px] bg-[color:var(--m-primary)] px-5 py-3 text-[14px] font-semibold text-[color:var(--m-on-primary)] transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]";

function Hero() {
  return (
    <section className="flex flex-col items-start gap-5 pb-14">
      <span className="font-dm-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary-2)]">
        Rate for creators
      </span>
      <h1 className="max-w-[18ch] text-[clamp(34px,5vw,56px)] font-medium leading-[1.04] tracking-[-0.02em] [text-wrap:balance]">
        Your link. {fmt(REFERRAL_SHARE_PCT)}% of every fee your audience pays.
      </h1>
      <p className="max-w-[58ch] text-[16px] leading-relaxed text-[color:var(--m-text-secondary)] [text-wrap:pretty]">
        Apply for your own Rate link — <span className="font-dm-mono">{referralShareLink("YOURNAME")}</span>. When
        the people who join through it trade on the order book, you earn {fmt(REFERRAL_SHARE_PCT)}% of the fees they
        pay, as points — and they get {fmt(INVITEE_REBATE_PCT)}% of their own fees back. No cap on referrals, and
        none on what they earn you.
      </p>
      <ApplyLink className={PRIMARY} />
    </section>
  );
}

function StepCard({ n, title, body, children, id }: { n: number; title: string; body: string; children?: React.ReactNode; id?: string }) {
  return (
    <div
      id={id}
      className="flex scroll-mt-24 flex-col gap-3 rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5"
    >
      <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">{`0${n}`}</span>
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)] [text-wrap:pretty]">{body}</p>
      {children}
    </div>
  );
}

function Steps() {
  return (
    <section aria-labelledby="how-it-works" className="pb-14">
      <h2 id="how-it-works" className="mb-5 text-[24px] font-medium tracking-[-0.01em]">
        How it works
      </h2>
      {/* Top-aligned: the form makes step 1 far taller, and stretched cards read
          as two empty boxes beside it. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
        <StepCard n={1} id="apply" title="Apply for your link" body="Tell us who you are, where your audience is, and the link you'd like.">
          <ApplyForm />
        </StepCard>
        <StepCard
          n={2}
          title="Get your link"
          body={`We review every application and set ${referralShareLink("YOURNAME")} up on your wallet. You'll hear back in Support, at the bottom of any page.`}
        >
          <p className="text-[12.5px] text-[color:var(--m-text-secondary-2)]">
            Already trading on Rate? Your wallet has a link today, in{" "}
            <Link href="/portfolio?tab=referrals" className="text-[color:var(--m-primary)] hover:underline">
              Portfolio › Referrals
            </Link>
            .
          </p>
        </StepCard>
        <StepCard
          n={3}
          title="Start earning"
          body={`When someone who joined through your link takes an order on the book, you earn ${fmt(REFERRAL_SHARE_PCT)}% of the fee they pay, as points at the trading rate — paid out in $RATE at the end of each season.`}
        >
          <div className="rounded-[12px] bg-[color:var(--m-surface-2)] p-3.5 font-dm-mono text-[12px] leading-relaxed tabular-nums text-[color:var(--m-text-secondary)]">
            <div>Referral trades ${fmt(EXAMPLE_TRADE_USD)} at 0.1%</div>
            <div>→ pays ${EXAMPLE_FEE_USD.toFixed(2)} in fees</div>
            <div className="text-[color:var(--m-text-primary)]">→ you earn {fmt(EXAMPLE_POINTS)} points</div>
          </div>
          <SeasonNotice />
        </StepCard>
      </div>
    </section>
  );
}

function ApplyForm() {
  const { address } = useAccount();
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [audience, setAudience] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [reference, setReference] = useState<string | null>(null);

  // The connected wallet is the natural answer, but the field stays editable:
  // a creator may browse from one wallet and want the link on another.
  useEffect(() => {
    if (address) setWallet((w) => w || address);
  }, [address]);

  const codeProblem = code.trim() ? requestedCodeProblem(code) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApplicantWallet(wallet)) {
      toast.error("Add the wallet the link should go to", { description: "A link is assigned to one wallet." });
      return;
    }
    const problem = requestedCodeProblem(code);
    if (problem) {
      toast.error("Pick a different link", { description: problem });
      return;
    }
    const x = normaliseXHandle(handle);
    if (handle.trim() && !x) {
      toast.error("That X handle doesn't look right", { description: "Letters, numbers and _ — up to 15." });
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          message: affiliateApplicationMessage({ wallet: wallet.trim(), requestedCode: code, xHandle: x, audience }),
          pagePath: "/affiliate",
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; ticket?: { token?: string; reference?: string } }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
      if (body?.ticket?.token && body.ticket.reference) {
        writeSession(browserStorage(), { token: body.ticket.token, reference: body.ticket.reference });
        setReference(body.ticket.reference);
      }
      setState("sent");
    } catch (err) {
      setState("idle");
      toast.error("Couldn't send your application", { description: (err as Error).message });
    }
  };

  if (state === "sent") {
    return (
      <p className="flex items-start gap-2 rounded-[12px] bg-[color:var(--m-surface-2)] p-3.5 text-[13px]">
        <Check size={15} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--m-success)]" />
        <span>
          Application received{reference ? ` (${reference})` : ""}. We&apos;ll reply in Support, at the bottom of any
          page.
        </span>
      </p>
    );
  }

  const field =
    "w-full rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-[13.5px] outline-none focus:border-[color:var(--m-primary)]";
  const label = "flex flex-col gap-1 text-[12px] text-[color:var(--m-text-secondary)]";
  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-2.5">
      <label className={label}>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
      </label>
      <label className={label}>
        Link you&apos;d like
        <span className="flex items-center rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] focus-within:border-[color:var(--m-primary)]">
          <span className="pl-3 font-dm-mono text-[12.5px] text-[color:var(--m-text-secondary-2)]">{referralShareLink("")}</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            autoComplete="off"
            className="w-full bg-transparent py-2.5 pr-3 font-dm-mono text-[13.5px] outline-none"
            placeholder="YOURNAME"
            aria-invalid={codeProblem ? true : undefined}
          />
        </span>
        {codeProblem && <span className="text-[11.5px] text-[color:var(--m-error)]">{codeProblem}</span>}
      </label>
      <label className={label}>
        Wallet the link goes to
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} required className={`${field} font-dm-mono text-[12px]`} placeholder="0x…" autoComplete="off" />
      </label>
      <label className={label}>
        X handle
        <input value={handle} onChange={(e) => setHandle(e.target.value)} className={field} placeholder="@yourname" autoComplete="off" />
      </label>
      <label className={label}>
        Where&apos;s your audience? <span className="text-[color:var(--m-text-secondary-2)]">(optional)</span>
        <textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} maxLength={1000} className={field} placeholder="Telegram group, YouTube, newsletter…" />
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="min-h-11 rounded-[11px] bg-[color:var(--m-primary)] text-[13.5px] font-semibold text-[color:var(--m-on-primary)] transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Apply for your link"}
      </button>
    </form>
  );
}

const REASONS: { title: string; body: string }[] = [
  { title: "A link with your name", body: `${referralShareLink("YOURNAME")}, set up on your wallet — not a random code.` },
  {
    title: "Your audience gets paid too",
    body: `Everyone who joins through your link gets ${fmt(INVITEE_REBATE_PCT)}% of their own order-book fees back, paid in $RATE with yours.`,
  },
  { title: "No cap", body: "No limit on how many people join through your link, or on what their trading earns you." },
  { title: "A card that names you", body: "Your link unfurls on X, Telegram and Discord as an invite from you, code included." },
  { title: "Paid in $RATE every season", body: "Points are counted every week; at the end of each season, $RATE is sent to your wallet. Nothing to claim." },
  { title: "Direct line to the team", body: "Your application and every question after it go straight to the people who run Rate." },
];

function WhyJoin() {
  return (
    <section aria-labelledby="why-join" className="pb-14">
      <h2 id="why-join" className="mb-5 text-[24px] font-medium tracking-[-0.01em]">
        Why join
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((r) => (
          <div key={r.title} className="rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
            <h3 className="text-[15px] font-semibold">{r.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--m-text-secondary)] [text-wrap:pretty]">{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "How much can I earn?",
    a: `${fmt(REFERRAL_SHARE_PCT)}% of the order-book fees the people who joined through your link pay as takers, as points at the trading rate. A $${fmt(EXAMPLE_TRADE_USD)} trade at 0.1% earns you ${fmt(EXAMPLE_POINTS)} points. There is no cap.`,
  },
  {
    q: "Who can apply?",
    a: "Anyone with an audience — creators, community leads, newsletter writers, traders with a following. There is no minimum follower count.",
  },
  {
    q: "What happens after I apply?",
    a: "We review it and set your link up on the wallet you gave us. The reply comes in Support, at the bottom of any page, in the same browser you applied from.",
  },
  {
    q: "Which trades count?",
    a: "Order-book trades where the person you referred takes liquidity. Resting orders pay no fee, and swaps through a band pool pay their fee to that pool's liquidity providers, so neither earns you anything.",
  },
  {
    q: "When do I get paid?",
    a: "In $RATE, at the end of each season. Points are counted every week (Mondays 00:00 UTC) on each chain where your referrals trade; when the season ends, each wallet's share of that season's $RATE is sent to it. There is nothing to claim.",
  },
  {
    q: "What do the people I refer get?",
    a: `${fmt(INVITEE_REBATE_PCT)}% of their own order-book fees back, as points paid in $RATE at the end of each season, for as long as you are an approved affiliate. They keep every point they earn; your share is added on top, not taken from them.`,
  },
  {
    q: "Can I pick any link?",
    a: "3–12 letters and digits, starting with a letter. A few words are reserved (like RATE or SUPPORT), and a link someone already has can't be reused.",
  },
];

function Faq() {
  return (
    <section aria-labelledby="faq" className="pb-14">
      <h2 id="faq" className="mb-5 text-[24px] font-medium tracking-[-0.01em]">
        Questions
      </h2>
      <div className="divide-y divide-[color:var(--m-border)] rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)]">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-medium marker:hidden">
              {f.q}
              <span aria-hidden className="text-[color:var(--m-text-secondary-2)] transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2.5 max-w-[70ch] text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)] [text-wrap:pretty]">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ClosingAsk() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-6 py-12 text-center">
      <h2 className="text-[28px] font-medium tracking-[-0.01em] [text-wrap:balance]">Ready for your link?</h2>
      <p className="max-w-[48ch] text-[14px] text-[color:var(--m-text-secondary)]">
        Apply in a minute. We set it up on your wallet and reply in Support.
      </p>
      <ApplyLink className={`${PRIMARY} px-6`} />
    </section>
  );
}
