"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { depositHref } from "@/lib/transfer/routes";
import { requestWalletConnect } from "@/lib/wallet/connectGate";
import { networkNameToSlug } from "@/consts";
import {
  chainSteps,
  stepLabel,
  type ChainOnboardingProfile,
  type ChainStepKey,
} from "@/lib/onboarding/chainProfile";

/**
 * One chain's card in the Get-started stack.
 *
 * ## A card per chain, not one card that changes
 *
 * The app merges chains everywhere it reads — Explore, the leaderboards, the
 * tape — so onboarding merging too is the consistent choice rather than a new
 * idea. It also means adding a chain is additive: a card appears, and nothing
 * about the existing ones forks.
 *
 * The alternative, one card that rewrites itself from the selected chain, hides
 * exactly the thing worth showing. A reader cannot discover that another chain
 * is where coins get launched if the card only ever describes the chain they are
 * already on.
 *
 * ## The steps come from the chain, the sentence comes from us
 *
 * See `lib/onboarding/chainProfile`. A step that cannot be completed on this
 * chain is never rendered — no LP step where the quote is a wrapped native,
 * no wrap step where gas and quote are one asset.
 */
// Below 700px the card is a carousel slide too narrow to share a row with the
// button — beside it the chain name truncated to one letter — so the action
// takes a full-width row of its own.
const ACTION =
  "shrink-0 self-center whitespace-nowrap rounded-xl bg-[color:var(--m-primary)] px-3 py-1.5 text-center text-[12.5px] font-bold max-[699px]:w-full max-[699px]:py-2 text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90";

export function ChainOnboardingCard({
  profile,
  done,
  activeStep,
  hideConnect = false,
  className,
}: {
  profile: ChainOnboardingProfile;
  /**
   * The stack shows ONE Connect wallet for the whole section while every chain
   * is waiting on it (a wallet is not per chain), so the cards drop their own.
   */
  hideConnect?: boolean;
  /** Steps already satisfied on this chain. */
  done: ReadonlySet<ChainStepKey>;
  /** The step to lead with, or null when this chain is finished. */
  activeStep: ChainStepKey | null;
  className?: string;
}) {
  const { data: chainBrands } = useChainBrand();
  const steps = chainSteps(profile);
  const slug = networkNameToSlug[profile.name] ?? "";
  const finished = activeStep === null;

  return (
    <article
      className={cn(
        // A compact row (2026-10-03): it was a tall card — pitch, a wrapping row
        // of step chips and a button — and four of them filled two phone
        // screens before the feed began. Same facts, about a third the height.
        "flex flex-wrap items-start gap-3 rounded-2xl min-[700px]:flex-nowrap border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3.5 py-3",
        // Finished chains stay on screen, greyed. The same argument the single
        // card already made for completed steps: progress you can see is what
        // makes the next step feel small, and a card that vanishes reads as
        // something breaking rather than something achieved.
        finished && "opacity-60",
        className,
      )}
    >
      {/* The chain's own mark, rendered AS a token — the established shape for a
          standalone network logo here, matching ChainSwitcher and the deposit
          sheet. `ChainBadge` cannot be reused: it is absolutely positioned to
          ride a token icon's corner. */}
      <TokenImageIcon
        symbol={profile.name}
        color="#666666"
        logoURI={chainIconFrom(chainBrands, profile.name)}
        size="md"
        badge={false}
        className="mt-0.5 h-8 w-8 shrink-0"
      />

      <div className="flex min-w-0 flex-1 basis-[calc(100%-44px)] flex-col gap-1.5 min-[700px]:basis-auto">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14px] font-bold tracking-[-0.01em] text-[color:var(--m-text-primary)]">
            {profile.name}
          </span>
          <span className="shrink-0 font-dm-mono text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
            fees in {profile.gasSymbol}
          </span>
        </div>

        {/* One line; the full sentence is the tooltip. */}
        <p title={profile.pitch} className="truncate text-[12.5px] leading-[18px] text-[color:var(--m-text-secondary)]">
          {profile.pitch}
        </p>

        {/* The steps as a segmented bar plus the NEXT one by name — the chip row
            said the same thing in four pills that wrapped onto two lines. The
            full list stays readable to assistive tech and on hover. */}
        <div
          className="flex items-center gap-2"
          role="img"
          aria-label={`Steps: ${steps.map((st) => `${stepLabel(st, profile)}${done.has(st) ? " (done)" : ""}`).join(", ")}`}
          title={steps.map((st) => `${done.has(st) ? "✓" : "○"} ${stepLabel(st, profile)}`).join("   ")}
        >
          <span className="flex gap-1" aria-hidden>
            {steps.map((step) => (
              <span
                key={step}
                className={cn(
                  "h-1 w-5 rounded-full",
                  done.has(step)
                    ? "bg-[color:var(--m-success-fg)]"
                    : step === activeStep
                      ? "bg-[color:var(--m-primary)]"
                      : "bg-[color:var(--m-surface-2)]",
                )}
              />
            ))}
          </span>
          <span className="truncate font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
            {finished ? "all done" : `next: ${stepLabel(activeStep, profile)} · ${done.size + 1} of ${steps.length}`}
          </span>
        </div>
      </div>

      {/* ONE action — the next step, never a menu of them. */}
      {activeStep === "wallet" && hideConnect ? null : activeStep === "wallet" ? (
        /*
         * CONNECTING is not a destination, so this is a button and not a link.
         *
         * It used to fall through to the branch below, which sent a reader with
         * no wallet to /explore under a label reading "Trade on Arc". Both
         * halves were wrong: the label named a step that was not next, and the
         * navigation answered a requirement by walking away from it. Explore
         * renders perfectly well without a wallet, so nothing failed — the
         * button simply did not do what it said, which is the worst shape a
         * primary action can take.
         *
         * `requestWalletConnect` is the seam every other gated control uses; the
         * dialog itself is mounted once in AppShell, which this card renders
         * inside (`/home` → HomeFeed → here).
         *
         * The reason deliberately does NOT name the chain. A wallet here is not
         * per chain — the section's own subtitle says "Your wallet works on all
         * of them" — and a card-specific sentence would contradict it.
         */
        <button
          type="button"
          onClick={() =>
            requestWalletConnect(
              "Connect a wallet to start. The same wallet works on every chain Rate serves.",
            )
          }
          className={ACTION}
        >
          Connect wallet
        </button>
      ) : activeStep === "fund" || activeStep === "wrap" ? (
        <Link
          href={depositHref()}
          className={ACTION}
        >
          Add {profile.gasSymbol}
        </Link>
      ) : activeStep ? (
        <Link
          /* The LP step goes to /pool, not /explore. It used to fall into the
             same `explore` branch as the trade step, so a button reading
             "Provide liquidity" landed on the directory — a control that names
             one destination and opens another. */
          href={buildPageUrl(
            activeStep === "launch" ? "launch" : activeStep === "lp" ? "pool" : "explore",
            { slug },
          )}
          className={ACTION}
        >
          {activeStep === "launch"
            ? "Launch a coin"
            : activeStep === "lp"
              ? "Provide liquidity"
              : `Trade on ${profile.name.replace(" Testnet", "")}`}
        </Link>
      ) : null}
    </article>
  );
}
