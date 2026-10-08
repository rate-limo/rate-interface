"use client";

import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLaunchAvailability } from "@/hooks/useLaunchAvailability";

export type LaunchKind = "fair" | "auction";

/**
 * Which kind of launch, asked as a modal over wherever the creator already is.
 *
 * ## What this replaced, and why
 *
 * `/create` used to open on a marketing hero — a `clamp(42px,5vw,64px)`
 * headline, a five-item benefits list and an autoplaying CloudFront video —
 * then a SECOND full page for this choice, and only then the form. Three pages
 * before a creator could type a name, on the surface reached by pressing
 * `+ Create` in the shell. A person who pressed that button has already decided
 * to create something; the hero was selling them a decision they had made.
 *
 * The choice itself is worth keeping — fair and auction launches are genuinely
 * different products, not a toggle — so it stays, as the small question it is.
 *
 * ## Disabled, never hidden
 *
 * An operator can turn either kind off per chain (`/launch-config`). The
 * unavailable one is rendered and disabled with the reason, which is the call
 * every other gated control on this venue makes — the launch approval row, the
 * struck-through `Edit logo & description`, the below-threshold Graduate button.
 * Hiding it would read as "this product does not exist" rather than "not here,
 * not now".
 */
export function CreateChooserModal({
  open,
  onOpenChange,
  onChoose,
  networkSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (kind: LaunchKind) => void;
  networkSlug: string;
}) {
  const availability = useLaunchAvailability(networkSlug);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `sm:max-w-none` for the reason in CreateFlowModal: the base classes'
        // `sm:max-w-lg` outranks an unprefixed `max-w-none`. 460px happens to
        // fit under 512px today, so this is the trap disarmed rather than a bug
        // fixed — widen it without this and it silently stops widening.
        className="w-[min(460px,94vw)] max-w-none gap-0 border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-2xl p-0 sm:max-w-none"
        data-testid="create-chooser"
      >
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle className="text-[17px] tracking-[-0.01em]">Create</DialogTitle>
          <p className="mt-1 text-[13px] leading-5 text-[color:var(--m-text-secondary)]">
            Both open a real order book. They differ in how the opening price is found.
          </p>
        </DialogHeader>

        <div className="flex flex-col border-t border-[color:var(--m-border)]">
          <ChooserRow
            testId="create-coin-start"
            eyebrow="Open market"
            title="Fair launch"
            body="Deploy the token, open its market and seed the book in one transaction."
            available={availability.fair}
            onSelect={() => onChoose("fair")}
          />
          <ChooserRow
            testId="create-auction-start"
            eyebrow="Price discovery"
            title="Auction launch"
            body="Every buyer enters at one price, allocated pro-rata if oversubscribed."
            available={availability.auction}
            onSelect={() => onChoose("auction")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChooserRow({
  testId,
  eyebrow,
  title,
  body,
  available,
  onSelect,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  body: string;
  available: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!available}
      onClick={onSelect}
      className="group flex items-start gap-4 border-b border-[color:var(--m-border)] px-6 py-5 text-left transition-colors last:border-b-0 hover:bg-[color:var(--m-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--m-primary)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--m-text-secondary)]">
            {eyebrow}
          </span>
          {!available && (
            <span className="rounded-full border border-[color:var(--m-border)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--m-text-secondary)]">
              Unavailable here
            </span>
          )}
        </span>
        <span className="mt-1.5 block text-[16px] font-medium tracking-[-0.02em] text-[color:var(--m-text-primary)]">
          {title}
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-[color:var(--m-text-secondary)]">
          {body}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--m-text-secondary)] transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0"
      />
    </button>
  );
}
