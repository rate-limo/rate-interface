"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowDownToLine, Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { fetchReferralCode, inviteLink, inviteUrl } from "@/lib/referral/link";
import { gasFaucetFor } from "@/lib/errors/insufficientGas";
import { depositHref } from "@/lib/transfer/routes";
import { useGasStatus } from "@/lib/wallet/gasStatus";
import { onboardingProgress } from "@/lib/onboarding/progress";

/**
 * "Get started" — a card at the top of Home, not a modal over it.
 *
 * ## Why a card
 *
 * This replaced a one-shot panel that fired on connect, and the swap came from
 * looking at how Coinbase and Plum handle the same moment: both put a persistent
 * progress card in the home feed rather than interrupting. That removes three
 * problems at once — the interruption itself, the race with the deposit sheet
 * (nothing races a card), and the one-shot problem where abandoning onboarding
 * meant never being offered it again.
 *
 * ## It lives on HOME, and that is the point
 *
 * Home is the callout feed. Social trading needs no explaining card because it is
 * already the page underneath this one; the capabilities that DO need naming —
 * launch, auctions, band-pool LP — are the ones a feed cannot show. Putting this
 * on Explore, a market table, would have meant a card for social trading pointing
 * at something the user cannot see from there.
 *
 * ## Progress is observed
 *
 * Nothing is stored. A balance and a trade count are the truth; a flag saying
 * "we already asked" can drift from it. See `lib/onboarding/progress`.
 */
export function GetStartedCard() {
  const { address, chainId, isConnected } = useAccount();
  const { status } = useGasStatus();
  const market = useOptionalMarketPageContext();
  const slug = market?.displayNetworkSlug;
  const account = useAccountProfile(market?.displayNetworkName ?? "", address, address);

  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Asking for the code is what REGISTERS it — `GET /referral/code/:address`
   * writes the derived code on first ask, so the link resolves the moment it is
   * handed out. That is why this fetch runs for every connected wallet rather
   * than only when the row is expanded.
   */
  useEffect(() => {
    if (!address) return;
    let live = true;
    void fetchReferralCode(address)
      .then((res) => live && setCode(res.code))
      .catch(() => live && setCode(null));
    return () => {
      live = false;
    };
  }, [address]);

  const progress = onboardingProgress({
    connected: isConnected,
    gas: status,
    trades: account.isLoading ? undefined : account.data.stats.trades,
  });

  // Nothing while a source is still answering, and nothing once it is done. The
  // card removing itself is the whole exit — there is no dismiss to remember.
  if (!progress.ready || progress.finished) return null;

  const faucet = gasFaucetFor(chainId);
  const symbol = faucet ? faucet.label.replace(/^Get test /, "") : "funds";
  // `inviteLink`/`inviteUrl`, never `referralLink` — a guard test in
  // `lib/referral/link.test.ts` enforces that no sharing surface picks its own
  // destination, so all of them move together when the destination changes.
  // Display form and clipboard form are separate on purpose.
  const link = code ? inviteLink(code) : null;
  const needsFunds = progress.next?.key === "fund";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(code as string));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The link is selectable either way; claiming a copy that did not happen
      // is the only wrong answer.
    }
  };

  return (
    <section
      aria-label="Get started"
      className="mb-4 rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              "font-dm-mono text-[10px] uppercase tracking-[0.1em]",
              needsFunds ? "text-[color:var(--m-primary)]" : "text-[color:var(--m-success-fg)]",
            )}
          >
            {needsFunds ? "Unlock trading" : "Nicely done"}
          </span>
          {/* The headline is the STATE, not a fixed label — the pattern Coinbase
              uses to turn a checklist into a sentence about you. */}
          <h2 className="mt-1 text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-[color:var(--m-text-primary)]">
            {needsFunds ? `Add ${symbol} to your wallet` : "You're ready to trade"}
          </h2>
          {needsFunds && (
            <p className="mt-1 text-[12.5px] text-[color:var(--m-text-secondary)]">
              {market?.displayNetworkName ?? "This chain"} charges network fees in {symbol}, and
              this wallet has none yet.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="shrink-0 whitespace-nowrap text-[12.5px] font-bold text-[color:var(--m-primary)]"
        >
          {expanded ? "Hide steps" : "View all steps ›"}
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuenow={progress.completed}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--m-surface-2)]"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width]",
            needsFunds ? "bg-[color:var(--m-primary)]" : "bg-[color:var(--m-success-fg)]",
          )}
          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
        />
      </div>
      <span className="mt-1.5 block font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
        {progress.completed} of {progress.total} complete
      </span>

      {/* ONE primary action — the next step, never a menu of them. */}
      {needsFunds ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {faucet && (
            <a
              href={faucet.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-[color:var(--m-primary)] px-4 py-2.5 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
            >
              {faucet.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Link
            href={depositHref()}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[11px] px-4 py-2.5 text-[13px] font-bold transition-colors",
              faucet
                ? "border border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
                : "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] hover:opacity-90",
            )}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            {faucet ? "My address" : `Deposit ${symbol}`}
          </Link>
        </div>
      ) : (
        <Link
          href={buildPageUrl("explore", { slug })}
          className="mt-3 block rounded-[11px] bg-[color:var(--m-primary)] px-4 py-2.5 text-center text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
        >
          Find a market
        </Link>
      )}

      {expanded && (
        <div className="mt-3 border-t border-[color:var(--m-border)] pt-1">
          <Step
            done
            title="Wallet created"
            note="Yours alone. Iter never holds your keys."
          />
          <Step
            done={progress.steps[1]?.state === "done"}
            title={`Add ${symbol}`}
            note={`Fees here are paid in ${symbol}.${faucet ? " The testnet faucet is free and takes about a minute." : ""}`}
          />
          <Step
            done={progress.steps[2]?.state === "done"}
            title="Make your first trade"
            note="Or launch a coin, open an auction, or provide liquidity — whichever you came for."
          />
          {/* Ticked, not a task: the code exists from the moment the wallet
              connects, so presenting it as work to complete would invent work —
              and burying it at the end is what made the old flow fail. */}
          {link && (
            <div className="flex gap-3 py-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color:var(--m-success-fg)] text-[10px] text-white">
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-[color:var(--m-text-secondary)]">
                  Your invite code is ready
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                    {link}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Completed steps stay on screen, greyed — progress you can see is what makes
 *  the remaining work look small. */
function Step({ done, title, note }: { done: boolean; title: string; note: string }) {
  return (
    <div className="flex gap-3 border-b border-[color:var(--m-border)] py-2.5 last:border-b-0">
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]",
          done
            ? "bg-[color:var(--m-success-fg)] text-white"
            : "border border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[13px] font-bold",
            done ? "text-[color:var(--m-text-secondary)]" : "text-[color:var(--m-text-primary)]",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[color:var(--m-text-secondary)]">
          {note}
        </span>
      </span>
    </div>
  );
}
