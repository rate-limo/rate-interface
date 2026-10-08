"use client";

/**
 * The page a shared referral link lands on.
 *
 * Two audiences on one screen, and the order matters:
 *
 *  - **Signed out** — the common case. Explain the offer BEFORE asking for a
 *    wallet. A connect prompt with no context is how a referral link becomes a
 *    bounce.
 *  - **Signed in** — apply it now, and say plainly what it does.
 *
 * The code is stashed before connecting, so a user who signs in through Privy's
 * modal (which navigates away and back) does not silently lose the referral
 * that brought them here.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { applyReferralCode } from "@/lib/referral/apply";
import { stashCode as stash, takeStashedCode as takeStashed } from "@/lib/referral/pending";

/**
 * Re-exported from lib/referral/pending, which is now the single store — the
 * `?ref=` capture writes the same key, so two implementations would eventually
 * disagree about the shape they accept.
 */
export { stashCode, takeStashedCode } from "@/lib/referral/pending";

type Status = "idle" | "linking" | "linked" | "error";

export function InviteView({ code, networkSlug }: { code: string; networkSlug?: string }) {
  const router = useRouter();
  const { address, isConnected, isLoading } = useWalletAccount();
  const { open } = useWalletConnect();
  const { signMessageAsync } = useSignMessage();
  const [referrer, setReferrer] = useState<string | null>(null);
  const [resolved, setResolved] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Resolve the code up front so an invalid link says so immediately, rather
  // than after the visitor has gone through connecting a wallet.
  useEffect(() => {
    let live = true;
    void fetch(`/referral/resolve/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { address?: string } | null) => {
        if (!live) return;
        setReferrer(d?.address ?? null);
        setResolved(Boolean(d?.address));
      })
      .catch(() => live && setResolved(null));
    return () => {
      live = false;
    };
  }, [code]);

  useEffect(() => {
    stash(code);
  }, [code]);

  const accept = async () => {
    if (!address) return;
    setStatus("linking");
    setMessage(null);
    // The nonce-then-sign handshake lives in lib/referral/apply, shared with
    // onboarding's invite step. Two copies is how one of them quietly stops
    // consuming the nonce, or starts trusting the address in the body.
    const outcome = await applyReferralCode(code, address, signMessageAsync);
    if (outcome.ok) {
      takeStashed();
      setStatus("linked");
      return;
    }
    setStatus("error");
    setMessage(outcome.message);
  };

  const short = referrer ? `${referrer.slice(0, 6)}…${referrer.slice(-4)}` : code;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3 px-[22px] pt-16 pb-24">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-[24px]"
        style={{ background: "color-mix(in srgb, var(--m-success) 16%, transparent)" }}
        aria-hidden
      >
        ✦
      </div>

      {resolved === false ? (
        <>
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            That code doesn&apos;t exist
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
            Check the link, or carry on without one — the app works exactly the same.
          </p>
          <button
            type="button"
            onClick={() => router.push(buildPageUrl("explore", { slug: networkSlug }))}
            className="mt-1 w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[14px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)]"
          >
            Explore Rate
          </button>
        </>
      ) : (
        <>
          <h1 className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em]">
            {short} invited you
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
            They&apos;ll earn a share of the points you earn — minted on top, so{" "}
            <b className="font-semibold text-[color:var(--m-text-primary)]">
              nothing is taken from you
            </b>
            .
          </p>

          <dl className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5">
            <div className="flex items-center justify-between gap-3 py-2.5 text-[12px] text-[color:var(--m-text-secondary)]">
              <dt>Their code</dt>
              <dd className="font-dm-mono font-semibold text-[color:var(--m-logo)]">{code}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--m-border)] py-2.5 text-[12px] text-[color:var(--m-text-secondary)]">
              <dt>Taken from you</dt>
              <dd className="font-semibold text-[color:var(--m-success)]">Nothing</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--m-border)] py-2.5 text-[12px] text-[color:var(--m-text-secondary)]">
              <dt>Changeable later</dt>
              <dd className="font-semibold text-[color:var(--m-text-primary)]">Support only</dd>
            </div>
          </dl>

          <p
            className="rounded-xl border px-3.5 py-2.5 text-[12px] leading-snug text-[color:var(--m-text-secondary)]"
            style={{
              borderColor: "color-mix(in srgb, var(--m-error) 38%, transparent)",
              background: "color-mix(in srgb, var(--m-error) 8%, transparent)",
            }}
          >
            You can only set this once. If it&apos;s wrong afterwards, support can re-point it — you
            can&apos;t.
          </p>

          {status === "linked" ? (
            <>
              <p className="text-[13px] font-semibold text-[color:var(--m-success)]">
                ✓ Code applied.
              </p>
              <button
                type="button"
                onClick={() => router.push(buildPageUrl("explore", { slug: networkSlug }))}
                className="w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[14px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)]"
              >
                Start using Rate
              </button>
            </>
          ) : (
            <>
              {message && (
                <p className="text-[12.5px] text-[color:var(--m-error)]">{message}</p>
              )}
              <button
                type="button"
                disabled={isLoading || status === "linking"}
                onClick={() => (isConnected && address ? void accept() : open())}
                className="mt-1 w-full rounded-xl bg-[color:var(--m-primary)] py-3 text-[14px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)] disabled:opacity-50"
              >
                {status === "linking"
                  ? "Applying…"
                  : isConnected
                    ? "Accept invitation"
                    : "Connect & accept"}
              </button>
              <button
                type="button"
                onClick={() => router.push(buildPageUrl("explore", { slug: networkSlug }))}
                className="w-full rounded-xl border border-[color:var(--m-border)] py-3 text-[14px] font-semibold text-[color:var(--m-text-primary)] hover:bg-[color:var(--m-surface-2)]"
              >
                Skip
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
