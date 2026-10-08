"use client";

import { useState } from "react";
import { LaunchFlow } from "./LaunchFlow";
import { AuctionFlow } from "./AuctionFlow";
import { useLaunchAvailability } from "@/hooks/useLaunchAvailability";
import { cn } from "@/lib/utils";
import type { LaunchKind } from "./CreateChooserModal";

/**
 * `/create` — the form, immediately.
 *
 * ## What this used to be
 *
 * A marketing hero: a `clamp(42px,5vw,64px)` "Create an asset" headline, a
 * five-item benefits list, an autoplaying CloudFront video with its own
 * play/pause control, and a "Launch now" button. Pressing that swapped the
 * whole page for a SECOND full screen — "Choose your launch." with two
 * image-backed cards — and only then did the form appear. Three pages.
 *
 * Which was reached by pressing `+ Create` in the shell. Anyone who presses
 * that has already decided to create something, so the hero was selling a
 * decision its own audience had made before arriving. The route now renders the
 * flow, and the shell's button asks the one real question in a modal
 * (`CreateChooserModal`) before opening the same flow in place.
 *
 * **The `iter:launch-started:degen:<slug>` localStorage gate went with it, and
 * that is a fix rather than a side effect.** It remembered that you had got
 * past the hero, per chain, per browser — so whether `/create` showed a hero or
 * a form depended on your browser history, and two people comparing the page
 * saw different products. Nothing persists the gate now because there is no
 * gate.
 *
 * ## The kind is a tab here, not a modal
 *
 * The modal path already asked. Arriving at the route directly — a deep link, a
 * cmd-click on the shell button, a shared URL — has nobody to ask, and opening
 * a dialog over an empty page to ask is the hollow pattern this change exists
 * to remove. So the route shows the choice as a two-item switch above the form,
 * which is also what makes the auction flow reachable without a second route.
 */
export function LaunchLanding({ networkSlug }: { networkSlug: string }) {
  const availability = useLaunchAvailability(networkSlug);
  const [kind, setKind] = useState<LaunchKind>("fair");

  // A kind the operator has turned off must not be the one on screen. Fair
  // wins the tie because it is the flow that goes on chain today.
  const active: LaunchKind = availability[kind] ? kind : availability.fair ? "fair" : "auction";

  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em] text-[color:var(--m-text-primary)]">
            {active === "auction" ? "Create an auction" : "Create a token"}
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-[color:var(--m-text-secondary)]">
            Both open a real order book. They differ in how the opening price is found.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Launch kind"
          className="inline-flex shrink-0 rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-1"
        >
          <KindTab
            kind="fair"
            label="Fair launch"
            active={active}
            available={availability.fair}
            onSelect={setKind}
          />
          <KindTab
            kind="auction"
            label="Auction"
            active={active}
            available={availability.auction}
            onSelect={setKind}
          />
        </div>
      </div>

      {active === "fair" && <LaunchFlow networkSlug={networkSlug} />}
      {active === "auction" && <AuctionFlow networkSlug={networkSlug} />}
    </section>
  );
}

function KindTab({
  kind,
  label,
  active,
  available,
  onSelect,
}: {
  kind: LaunchKind;
  label: string;
  active: LaunchKind;
  available: boolean;
  onSelect: (kind: LaunchKind) => void;
}) {
  const selected = active === kind;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      // Disabled, never hidden — the same call the launch approval row and the
      // below-threshold Graduate button make. A missing tab reads as "this
      // product does not exist" rather than "not on this chain".
      disabled={!available}
      title={available ? undefined : `${label} is not enabled on this chain`}
      data-testid={`create-kind-${kind}`}
      onClick={() => onSelect(kind)}
      className={cn(
        "h-8 rounded-[7px] px-3 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]",
        selected
          ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-[0_1px_2px_rgba(20,40,60,.06)]"
          : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
        !available && "cursor-not-allowed opacity-50 hover:text-[color:var(--m-text-secondary)]",
      )}
    >
      {label}
    </button>
  );
}
