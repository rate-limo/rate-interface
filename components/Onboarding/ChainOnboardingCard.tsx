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
export function ChainOnboardingCard({
  profile,
  done,
  activeStep,
  className,
}: {
  profile: ChainOnboardingProfile;
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
        "flex flex-col gap-2.5 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4",
        // Finished chains stay on screen, greyed. The same argument the single
        // card already made for completed steps: progress you can see is what
        // makes the next step feel small, and a card that vanishes reads as
        // something breaking rather than something achieved.
        finished && "opacity-60",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
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
          className="h-7 w-7"
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14.5px] font-bold tracking-[-0.01em] text-[color:var(--m-text-primary)]">
            {profile.name}
          </span>
          <span className="font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
            fees in {profile.gasSymbol}
          </span>
        </div>
      </div>

      <p className="text-[13px] leading-5 text-[color:var(--m-text-secondary)]">{profile.pitch}</p>

      <div className="flex flex-wrap gap-1.5">
        {steps.map((step) => {
          const isDone = done.has(step);
          return (
            <span
              key={step}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-dm-mono text-[10.5px]",
                isDone
                  ? "border-transparent bg-[color:var(--m-surface-2)] text-[color:var(--m-success-fg)]"
                  : step === activeStep
                    ? "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]"
                    : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary-2)]",
              )}
            >
              {isDone ? "✓ " : ""}
              {stepLabel(step, profile)}
            </span>
          );
        })}
      </div>

      {/* ONE action — the next step, never a menu of them. */}
      {activeStep === "wallet" ? (
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
              "Connect a wallet to start. The same wallet works on every chain Iter serves.",
            )
          }
          className="self-start rounded-xl bg-[color:var(--m-primary)] px-3.5 py-2 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
        >
          Connect wallet
        </button>
      ) : activeStep === "fund" || activeStep === "wrap" ? (
        <Link
          href={depositHref()}
          className="self-start rounded-xl bg-[color:var(--m-primary)] px-3.5 py-2 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
        >
          Add {profile.gasSymbol}
        </Link>
      ) : activeStep ? (
        <Link
          href={buildPageUrl(activeStep === "launch" ? "launch" : "explore", { slug })}
          className="self-start rounded-xl bg-[color:var(--m-primary)] px-3.5 py-2 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
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
