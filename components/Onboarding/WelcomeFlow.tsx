"use client";

/**
 * First-run onboarding: Welcome → Seat → [Invite] → Code.
 *
 * A ROUTE (`/welcome`), not a modal. A user who closes the tab mid-flow can be
 * sent back, the browser back button behaves, and the screens are reachable for
 * design review without signing up. A dismissed modal skips onboarding with no
 * way back.
 *
 * Reached by `LoginRouter`, which sends a wallet here **once ever** per browser
 * — it records the offer before navigating, so abandoning this flow does not
 * earn a second redirect (that repeat was a real bug; see that component). The
 * route is also reachable by URL at any time, and `WelcomeGate` turns away a
 * signed-out or already-onboarded visitor.
 *
 * `lib/onboarding/store` guards the flow per-wallet so a reload mid-flow does
 * not re-run it. Note the finish and skip handlers write the *completion* key,
 * never the offer key — writing the offer here instead is precisely the mistake
 * that caused the repeat. Skip is on every screen and is not a trap: the
 * referral code is DERIVED from the address, so a user who skips already has
 * one and Rewards shows it permanently.
 *
 * ## The invite step is conditional, and that is the point
 *
 * `referrer` is a prop: null when nothing has referred this wallet, set when a
 * code has already been applied (via /r/CODE or ?ref=). When it is set the step
 * is SKIPPED and the welcome screen says who invited them instead — a form that
 * asks what it already knows reads as broken.
 *
 * When it is null the step asks. It sits THIRD, after the seat picker, not
 * first: a code prompt on screen one reads as a gate, and a visitor without one
 * concludes they are not welcome. After the seat picker they know what Rate
 * pays for, so the ask is a small favour to a friend rather than a bouncer.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Droplets, Rocket, Sparkles } from "lucide-react";
import { useSignMessage } from "wagmi";
import { useWalletAccount } from "@/lib/wallet";
import { Stepper } from "@/components/Atoms/Stepper";
import { markOnboarded } from "@/lib/onboarding/store";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { inviteLink, inviteUrl } from "@/lib/referral/link";
import { applyReferralCode, resolveReferralCode } from "@/lib/referral/apply";
import { isCodeShape, peekStashedCode, takeStashedCode } from "@/lib/referral/pending";
import { cn } from "@/lib/utils";

type Step = "welcome" | "seat" | "invite" | "code";

/** Only ever announced — the bar shows a count, not per-step labels. */
const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  seat: "Pick a seat",
  invite: "Invite code",
  code: "Your code",
};

/**
 * The five seats from components/Landing/ParticipantFlywheel, with the same
 * semantic colours: success inside the engine loop, accent for the pass,
 * primary treasury-side. Not a re-run of the landing animation — someone who
 * just signed in has already scrolled past it. Same argument, at a decision's
 * length.
 */
const SEATS = [
  {
    key: "trader",
    label: "Trader",
    tone: "var(--m-success)",
    blurb: "$RATE on what you trade, and tighter spreads as your fee funds the depth.",
    icon: Compass,
    lands: "trade" as const,
  },
  {
    key: "lp",
    label: "LP",
    tone: "var(--m-success)",
    blurb: "A fixed share of every fill you make. No tier can reach it.",
    icon: Droplets,
    lands: "pool" as const,
  },
  {
    key: "launch",
    // "Asset creator", not "Listing a project": /launch deploys a coin that did
    // not exist and opens a market for it. A project is the thing around an
    // asset — a team, a treasury, a roadmap — and listing one implies applying
    // to a venue that reviews you. Neither is what this seat does.
    label: "Asset creator",
    tone: "var(--m-primary)",
    // The old blurb said "seed a market", which is the fiction the launch spec
    // deleted a whole step for: `launch()` places no orders and opens no
    // position. Listing creates a market, not liquidity.
    blurb: "Deploy a coin and open its market; a bounty settles on the volume it does.",
    icon: Rocket,
    lands: "launch" as const,
  },
  {
    key: "holder",
    label: "$RATE holder",
    tone: "var(--m-primary)",
    blurb: "Fees route into buybacks that burn supply. Nothing to lock.",
    icon: Sparkles,
    // Home, not /iter. Every other seat lands on the surface it just described,
    // and /iter is a protocol dashboard — the end of a signup is the wrong place
    // to drop someone into buyback metrics. Home is where a new holder can find
    // any of it.
    lands: "home" as const,
  },
] as const;

export function WelcomeFlow({
  networkSlug,
  code,
  referrer: referrerProp = null,
}: {
  networkSlug?: string;
  /** The wallet's referral code, resolved server-side. */
  code: string;
  /**
   * The code that already referred this wallet, if any. When set, the invite
   * step is skipped and the welcome screen names them instead.
   */
  referrer?: string | null;
}) {
  const router = useRouter();
  const { address } = useWalletAccount();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<Step>("welcome");
  const [seat, setSeat] = useState<(typeof SEATS)[number]["key"]>("trader");

  /** Set once the user links a referrer during this flow, so the confirmation
   * survives moving between steps. */
  const [linked, setLinked] = useState<string | null>(null);
  const referrer = referrerProp ?? linked;

  const [entry, setEntry] = useState("");
  const [checking, setChecking] = useState(false);
  const [resolvedTo, setResolvedTo] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // A code carried in from /r/CODE or ?ref= arrives pre-filled and validated,
  // so the common case is one tap rather than a retype from a chat window.
  useEffect(() => {
    if (referrerProp) return;
    const pending = peekStashedCode();
    if (pending) setEntry(pending);
  }, [referrerProp]);

  // Validate as they type. Failing only after a signature spends a wallet
  // prompt on a typo, which is the most expensive way to report one.
  useEffect(() => {
    const c = entry.trim().toUpperCase();
    if (!isCodeShape(c)) {
      setResolvedTo(null);
      setChecking(false);
      return;
    }
    let live = true;
    setChecking(true);
    const t = window.setTimeout(() => {
      void resolveReferralCode(c).then((r) => {
        if (!live) return;
        setResolvedTo(r.address);
        setChecking(false);
      });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [entry]);

  const chosen = SEATS.find((s) => s.key === seat) ?? SEATS[0];

  /** Path B is three screens, not four — see the module note. */
  const steps: Step[] = referrer
    ? ["welcome", "seat", "code"]
    : ["welcome", "seat", "invite", "code"];

  const next = () => {
    const i = steps.indexOf(step);
    setStep(steps[Math.min(i + 1, steps.length - 1)]);
  };

  const applyCode = async () => {
    const c = entry.trim().toUpperCase();
    if (!address || !isCodeShape(c)) return;
    setApplying(true);
    setInviteError(null);
    const outcome = await applyReferralCode(c, address, signMessageAsync);
    setApplying(false);
    if (outcome.ok) {
      takeStashedCode();
      setLinked(c);
      setStep("code");
      return;
    }
    setInviteError(outcome.message);
  };

  const finish = () => {
    markOnboarded(address);
    router.push(buildPageUrl(chosen.lands, { slug: networkSlug }));
  };

  const skip = () => {
    // Recorded exactly like finishing. A skipped user is not asked again, and
    // loses nothing — the code is derived, not granted by completing the flow.
    markOnboarded(address);
    router.push(buildPageUrl("explore", { slug: networkSlug }));
  };

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "your wallet";
  const stepIndex = steps.indexOf(step) + 1;

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-3 px-[22px] pt-16 pb-24">
      {/* Bar rather than dots, because `steps` is 3 or 4 depending on whether a
          referrer is already known — a dot row that changes length between
          sessions reads as a different flow. Same component either way. */}
      <Stepper
        shape="bar"
        barBrand="Rate"
        label="Getting started"
        steps={steps.map((key) => ({ key, label: STEP_LABELS[key] }))}
        activeIndex={stepIndex - 1}
      />

      {step === "welcome" && (
        <section className="mt-3 flex flex-col gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-[26px]"
            style={{ background: "color-mix(in srgb, var(--m-logo) 16%, transparent)" }}
            aria-hidden
          >
            👋
          </div>
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            {referrer ? `Welcome — ${referrer} invited you` : "Welcome, anon"}
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
            {referrer
              ? "Their code is applied. They earn a share of the points you earn, minted on top — your points are untouched."
              : "You're signed in with a wallet, so that's all we know about you — and all we need. No email, no password, nothing to recover."}
          </p>

          <dl className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5">
            {referrer && <Row k="Invited by" v={referrer} mono tone="mark" />}
            <Row k="Signed in as" v={short} mono />
            {referrer ? (
              <Row k="Taken from you" v="Nothing" tone="good" />
            ) : (
              <Row k="Custody" v="Yours" tone="good" />
            )}
          </dl>

          <Note>
            An <b className="font-semibold text-[color:var(--m-text-primary)]">OG Pass</b> adds a points
            multiplier, gas sponsorship, a fee discount and a signer that places orders without a wallet
            prompt. Nothing to decide now.
          </Note>

          <Primary onClick={next}>What can I do here?</Primary>
          <Ghost onClick={skip}>Skip — take me to the app</Ghost>
        </section>
      )}

      {step === "seat" && (
        <section className="mt-3 flex flex-col gap-3">
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            Every seat is paid out of the same fill
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
            One taker fee funds all of it. Pick where you&apos;re starting — you can sit in more than
            one.
          </p>

          <div className="flex flex-col gap-1.5">
            {SEATS.map((s) => {
              const Icon = s.icon;
              const on = s.key === seat;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSeat(s.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    on
                      // --m-surface-selected, not --m-primary-100: the numbered
                      // ramp is directional in both themes, so the "lightest
                      // tint" step is a near-white slab in dark mode. This card
                      // keeps --m-text-primary/--m-text-secondary (unlike the
                      // nav pills, which pair the tint with primary-600/700
                      // ink), so on that slab the title landed at 1.09:1.
                      ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-selected)]"
                      : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] hover:border-[color:var(--m-primary)]",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: s.tone }} aria-hidden />
                  <span className="flex flex-col">
                    <b className="text-[13.5px] font-semibold">{s.label}</b>
                    <span className="text-[11.5px] leading-snug text-[color:var(--m-text-secondary)]">
                      {s.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Note>
            <b className="font-semibold text-[color:var(--m-text-primary)]">{chosen.label}</b> — the
            app will open there. Change your mind any time; this only picks where you land.
          </Note>

          <Primary onClick={next}>Continue</Primary>
          <Ghost onClick={skip}>Skip</Ghost>
        </section>
      )}

      {step === "invite" && (
        <section className="mt-3 flex flex-col gap-3">
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            Did someone send you?
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
            If a friend gave you a code, enter it — they earn a share of your points, minted on top.
            Nothing is taken from you.
          </p>

          <label className="sr-only" htmlFor="referral-code">
            Referral code
          </label>
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border bg-[color:var(--m-surface-2)] px-3.5 py-2.5",
              resolvedTo && "border-[color:var(--m-success)]",
              !resolvedTo && entry.trim() !== "" && !checking && "border-[color:var(--m-error)]",
              !resolvedTo && (entry.trim() === "" || checking) && "border-[color:var(--m-border)]",
            )}
          >
            <input
              id="referral-code"
              value={entry}
              onChange={(e) => setEntry(e.target.value.toUpperCase())}
              placeholder="THEIR CODE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="w-full bg-transparent font-dm-mono text-[15px] tracking-[0.1em] text-[color:var(--m-text-primary)] placeholder:text-[color:var(--m-text-secondary-2)] focus:outline-none"
            />
            <span aria-live="polite" className="shrink-0 font-dm-mono text-[11px]">
              {checking && <span className="text-[color:var(--m-text-secondary-2)]">…</span>}
              {!checking && resolvedTo && (
                <span className="text-[color:var(--m-success)]">
                  ✓ {resolvedTo.slice(0, 6)}…{resolvedTo.slice(-4)}
                </span>
              )}
              {!checking && !resolvedTo && entry.trim() !== "" && (
                <span className="text-[color:var(--m-error)]">✕</span>
              )}
            </span>
          </div>

          {/* The refusal the server would give, surfaced before a wallet prompt
              is spent on it. Its own messages are used verbatim on apply. */}
          {!checking && !resolvedTo && entry.trim() !== "" && (
            <p className="text-[12px] text-[color:var(--m-text-secondary)]">
              We couldn&apos;t find that code. Check it and try again.
            </p>
          )}
          {inviteError && (
            <p className="text-[12.5px] text-[color:var(--m-error)]">{inviteError}</p>
          )}

          {resolvedTo && (
            <Note>
              <b className="font-semibold text-[color:var(--m-text-primary)]">
                {entry.trim().toUpperCase()}
              </b>{" "}
              will be credited. You can only set this once — support can re-point it afterwards, you
              can&apos;t.
            </Note>
          )}

          <Primary onClick={() => void applyCode()} disabled={!resolvedTo || applying}>
            {applying ? "Applying…" : "Sign & apply"}
          </Primary>
          {/* Named, not a bare "Skip". A bare skip makes the field look
              mandatory-but-dodgeable, so people guess — and a guessed code is a
              referral credited to a stranger. */}
          <Ghost onClick={next}>Nobody sent me — skip</Ghost>
        </section>
      )}

      {step === "code" && (
        <section className="mt-3 flex flex-col gap-3">
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            Bring people, earn on what they earn
          </h1>

          <div
            className="rounded-xl border px-4 py-4 text-center"
            style={{
              borderColor: "color-mix(in srgb, var(--m-logo) 34%, transparent)",
              background: "color-mix(in srgb, var(--m-logo) 8%, transparent)",
            }}
          >
            <div className="font-dm-mono text-[24px] font-medium tracking-[0.14em] text-[color:var(--m-logo)]">
              {code}
            </div>
            <div className="mt-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
              {inviteLink(code)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(inviteUrl(code))}
            className="w-full rounded-xl bg-[color:var(--m-primary)] py-2.5 text-[13.5px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)]"
          >
            Copy link
          </button>

          <dl className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5">
            <Row k="You earn" v="a share of their points" tone="good" />
            <Row k="Counts on" v="Trading · LP" />
          </dl>

          {/* Deliberately does NOT promise the referee a bonus rate. The rate is
              operator-set (refereeBonusBps) and ships at zero, so a number here
              would be a promise the accrual does not currently keep. */}
          <Note>
            Their points aren&apos;t reduced — your share is minted on top. If a bonus is running,
            Rewards shows the current rate.
          </Note>

          <Primary onClick={finish}>Start using Rate</Primary>
        </section>
      )}
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  tone,
}: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: "good" | "mark";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[color:var(--m-border)] py-2.5 text-[12px] text-[color:var(--m-text-secondary)] first:border-t-0">
      <dt>{k}</dt>
      <dd
        className={cn(
          "font-semibold",
          mono && "font-dm-mono",
          tone === "good"
            ? "text-[color:var(--m-success)]"
            : tone === "mark"
              ? "text-[color:var(--m-logo)]"
              : "text-[color:var(--m-text-primary)]",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-xl border px-3.5 py-2.5 text-[12px] leading-snug text-[color:var(--m-text-secondary)]"
      style={{
        borderColor: "color-mix(in srgb, var(--m-logo) 30%, transparent)",
        background: "color-mix(in srgb, var(--m-logo) 8%, transparent)",
      }}
    >
      {children}
    </p>
  );
}

function Primary({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-1 w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[14px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-[color:var(--m-border)] py-3 text-[14px] font-semibold text-[color:var(--m-text-primary)] hover:bg-[color:var(--m-surface-2)]"
    >
      {children}
    </button>
  );
}
