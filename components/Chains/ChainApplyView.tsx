"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { browserStorage, writeSession } from "@/lib/support/store";
import { OFFERS, STAGES, chainApplicationMessage, chainIdProblem, type Offer, type Stage } from "@/lib/chainApply/application";

/**
 * "Bring Rate to your chain" — the pitch a chain team reads, and the form that
 * files their application as a support ticket (see lib/chainApply).
 *
 * Short on purpose: three reasons, one picture, the RWA case, the form. The
 * claims stay inside the brand book's rules — no promised volume, depth or
 * yield, and nothing about compliance, which Rate does not provide.
 */
const REASONS = [
  { title: "An order book, not a curve", body: "Your assets trade at the price people set, on a fully onchain book." },
  { title: "Liquidity paid to stay", body: "LPs earn the fees of trades against them. Holders can LP with just your token." },
  { title: "Your ecosystem's launch venue", body: "Projects launch by auction into the same book, with locked liquidity." },
];

const RWA = [
  "Market makers quote at NAV with limit orders.",
  "LP liquidity sits in tight bands around a time-weighted fair price.",
  "Size doesn't slide down a curve.",
];

export function ChainApplyView() {
  return (
    <section className="mx-auto grid w-full max-w-[1180px] gap-12 px-4 py-12 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
      <div>
        <span className="font-mono-brand text-xs tracking-[0.14em] text-[color:var(--m-accent-text)] uppercase">For chains</span>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-balance text-[color:var(--m-text-primary)] sm:text-5xl">
          Give your chain a real market.
        </h1>

        <ul className="mt-8 grid gap-5">
          {REASONS.map((r) => (
            <li key={r.title} className="flex gap-3">
              <Check size={18} strokeWidth={2.2} aria-hidden className="mt-1 shrink-0 text-[color:var(--m-accent)]" />
              <span>
                <span className="block font-semibold text-[color:var(--m-text-primary)]">{r.title}</span>
                <span className="text-[15px] text-[color:var(--m-text-secondary)]">{r.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <figure className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--m-border)]">
          <Image src="/images/landing/app-book.webp" alt="Rate order book on Arc Testnet: limit orders with pool liquidity resting between them" width={610} height={390} className="h-auto w-full" />
        </figure>

        <div className="mt-8 rounded-2xl border border-[color:var(--m-accent)]/40 p-5">
          <span className="font-mono-brand text-[11px] tracking-[0.14em] text-[color:var(--m-accent-text)] uppercase">Built for real-world assets</span>
          <ul className="mt-3 grid gap-1.5 text-[15px] text-[color:var(--m-text-secondary)]">
            {RWA.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      </div>

      <ApplyForm />
    </section>
  );
}

function ApplyForm() {
  const [email, setEmail] = useState("");
  const [chainName, setChainName] = useState("");
  const [chainId, setChainId] = useState("");
  const [stage, setStage] = useState<Stage>("Mainnet");
  const [evm, setEvm] = useState(true);
  const [stablecoin, setStablecoin] = useState("");
  const [assets, setAssets] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [social, setSocial] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [reference, setReference] = useState<string | null>(null);

  const idProblem = chainIdProblem(chainId);
  const toggle = (o: Offer) => setOffers((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (idProblem) {
      toast.error("Check the chain ID", { description: idProblem });
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          message: chainApplicationMessage({ chainName, chainId, stage, evm, stablecoin, assets, offers, contactName, contactRole, social, notes }),
          pagePath: "/integrate",
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; ticket?: { token?: string; reference?: string } } | null;
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

  const card = "h-fit rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-6";
  if (state === "sent") {
    return (
      <div className={card}>
        <p className="flex items-start gap-2 text-[15px] text-[color:var(--m-text-primary)]">
          <Check size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--m-success)]" />
          <span>
            {/* No mail transport exists (notifyTicketReply is a seam), so the
                email reply is a person on the team answering by hand; the
                thread is also readable from Support inside the app, in this
                browser, through the stored ticket token. */}
            Application received{reference ? ` (${reference})` : ""}. The team will get back to you at the email you gave.
            Replies also show up in Support inside the app, in this browser.
          </span>
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-[14px] text-[color:var(--m-text-primary)] outline-none focus:border-[color:var(--m-primary)]";
  const label = "flex flex-col gap-1 text-[12.5px] text-[color:var(--m-text-secondary)]";
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-[13px] transition-colors ${on ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]" : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"}`;

  return (
    <form onSubmit={submit} className={`${card} flex flex-col gap-3`}>
      <h2 className="font-display text-xl font-semibold text-[color:var(--m-text-primary)]">Apply to integrate</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Chain
          <input id="chain-name" required value={chainName} onChange={(e) => setChainName(e.target.value)} className={field} placeholder="Your chain" />
        </label>
        <label className={label}>
          Chain ID
          <input id="chain-id" inputMode="numeric" value={chainId} onChange={(e) => setChainId(e.target.value)} className={`${field} font-dm-mono`} placeholder="8453" aria-invalid={idProblem ? true : undefined} />
          {idProblem && <span className="text-[11.5px] text-[color:var(--m-error)]">{idProblem}</span>}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((s) => (
          <button key={s} type="button" onClick={() => setStage(s)} className={chip(stage === s)} aria-pressed={stage === s}>
            {s}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[color:var(--m-border)]" aria-hidden />
        <button type="button" onClick={() => setEvm((v) => !v)} className={chip(evm)} aria-pressed={evm}>
          EVM
        </button>
      </div>
      <label className={label}>
        Stablecoin on your chain
        <input id="chain-stable" value={stablecoin} onChange={(e) => setStablecoin(e.target.value)} className={field} placeholder="e.g. native USDC" />
      </label>
      <label className={label}>
        Assets you want listed, including RWAs
        <textarea id="chain-assets" value={assets} onChange={(e) => setAssets(e.target.value)} rows={2} maxLength={1200} className={field} placeholder="Native token, ecosystem tokens, tokenized T-bills…" />
      </label>
      <div className={label}>
        What you can bring
        <div className="flex flex-wrap gap-2">
          {OFFERS.map((o) => (
            <button key={o} type="button" onClick={() => toggle(o)} className={chip(offers.includes(o))} aria-pressed={offers.includes(o)}>
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Your name
          <input id="chain-contact" required value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} />
        </label>
        <label className={label}>
          Role
          <input id="chain-role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} className={field} placeholder="BD, founder…" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Email
          <input id="chain-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@chain.xyz" />
        </label>
        <label className={label}>
          X or Telegram
          <input id="chain-social" value={social} onChange={(e) => setSocial(e.target.value)} className={field} placeholder="@yourchain" />
        </label>
      </div>
      <label className={label}>
        Anything else <span className="text-[color:var(--m-text-secondary-2)]">(optional)</span>
        <textarea id="chain-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1200} className={field} />
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-1 min-h-11 rounded-[11px] bg-[color:var(--m-primary)] text-[14px] font-semibold text-[color:var(--m-on-primary)] transition-[opacity,scale] hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Apply"}
      </button>
    </form>
  );
}
