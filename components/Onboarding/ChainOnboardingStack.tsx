"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { useChainOnboarding } from "@/hooks/useChainOnboarding";
import { chainOnboardingProfile, type ChainOnboardingProfile } from "@/lib/onboarding/chainProfile";
import { wagmiChains } from "@/lib/customChains";
import { ChainOnboardingCard } from "./ChainOnboardingCard";

/**
 * "Where do you want to trade?" — one card per chain, ordered by how close the
 * reader is to acting.
 *
 * ## The list is the OPERATOR'S
 *
 * `useVisibleChains` is the compiled list minus anything admin-service has
 * switched off, so a chain hidden during an incident or a testnet reset is not
 * offered as somewhere to start. The build still decides what CAN be served —
 * nothing fetched at runtime can add a chain — which is the same asymmetry the
 * chain switcher relies on.
 *
 * ## Ordering, and why it is not "newest first"
 *
 * A chain you are already funded on outranks one that would send you to a
 * faucet. Anything else optimises for the venue's interests over the reader's:
 * the shortest path to a first trade is the one they came for, and a chain they
 * cannot act on today is a card they have to skip past every visit.
 *
 * Finished chains sink to the bottom and grey out rather than disappearing —
 * see the card for why a vanishing card reads as breakage.
 */
export function ChainOnboardingStack({ className }: { className?: string }) {
  const visible = useVisibleChains();
  const [slide, setSlide] = useState(0);

  const profiles = useMemo<ChainOnboardingProfile[]>(() => {
    return visible
      .map((name) => {
        // `useVisibleChains` speaks display NAMES; the registry and wagmi speak
        // ids. `wagmiChains` is the one list that carries both, and it is
        // already the build's definition of what can be served.
        const chainId = wagmiChains.find((c) => c.name === name)?.id;
        return chainId ? chainOnboardingProfile(chainId) : null;
      })
      .filter((p): p is ChainOnboardingProfile => p !== null);
  }, [visible]);

  const progress = useChainOnboarding(profiles);

  // Held back entirely while any chain is still answering: a stack that
  // reorders itself as reads land is worse than one that arrives a beat late.
  const ready = profiles.every((p) => progress.get(p.chainId)?.ready);
  if (!ready || profiles.length === 0) return null;

  // Every chain complete means onboarding is over. The stack removing itself is
  // the whole exit — there is no dismiss to remember.
  const anyUnfinished = profiles.some((p) => progress.get(p.chainId)?.activeStep !== null);
  if (!anyUnfinished) return null;

  const ordered = [...profiles].sort((a, b) => {
    const pa = progress.get(a.chainId);
    const pb = progress.get(b.chainId);
    const finishedA = pa?.activeStep === null ? 1 : 0;
    const finishedB = pb?.activeStep === null ? 1 : 0;
    if (finishedA !== finishedB) return finishedA - finishedB;
    // Then by progress: the chain you are furthest along on comes first.
    return (pb?.done.size ?? 0) - (pa?.done.size ?? 0);
  });

  // Each card carries its own Connect wallet. A section-level button used to
  // replace them, which left a swiped-to card on a phone with no action at all;
  // in the carousel only one card is on screen, so it is said once anyway.

  return (
    <section
      aria-label="Get started"
      className={cn("flex flex-col gap-2.5", className)}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[color:var(--m-text-primary)]">
            Where do you want to trade?
          </h2>
          <p className="text-[12.5px] text-[color:var(--m-text-secondary)]">
            Each chain does something different. Your wallet works on all of them.
          </p>
        </div>
      </div>

      {/* A phone gets a swipe carousel, one card and a peek of the next: four
          stacked cards pushed the rest of home below the fold. From 700px it is
          the two-per-row grid. minmax(0,1fr) keeps the truncating pitch from
          sizing the grid column past the screen. */}
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (card) setSlide(Math.round(el.scrollLeft / (card.offsetWidth + 8)));
        }}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[700px]:grid min-[700px]:grid-cols-[repeat(2,minmax(0,1fr))] min-[700px]:overflow-visible"
      >
        {ordered.map((profile) => {
          const state = progress.get(profile.chainId);
          return (
            <div key={profile.chainId} className="flex w-[86%] min-w-0 shrink-0 snap-start [&>*]:w-full min-[700px]:w-auto">
              <ChainOnboardingCard
                profile={profile}
                done={state?.done ?? new Set()}
                activeStep={state?.activeStep ?? null}
              />
            </div>
          );
        })}
      </div>
      {ordered.length > 1 && (
        <div className="flex justify-center gap-1.5 min-[700px]:hidden" aria-hidden>
          {ordered.map((p, i) => (
            <span
              key={p.chainId}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color]",
                i === slide ? "w-4 bg-[color:var(--m-primary)]" : "w-1.5 bg-[color:var(--m-border)]",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
