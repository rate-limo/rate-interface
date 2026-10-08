"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LaunchFlow } from "./LaunchFlow";
import { AuctionFlow } from "./AuctionFlow";
import type { LaunchKind } from "./CreateChooserModal";

/**
 * The launch or auction flow, in a modal, with the coin it is making beside it.
 *
 * ## Why the dialog is this wide
 *
 * Both flows are two-column by design: the form on the left and the artefact on
 * the right, because every field on them is permanent — `Coin` has no owner and
 * no mint function — so what is being signed for is rendered ALONGSIDE rather
 * than revealed on a success screen, by which point knowing costs a deploy.
 * `LaunchFlow` switches to that layout at `min-[1100px]` and `AuctionFlow` at
 * `lg`, so a dialog narrow enough to feel like a dialog would collapse the
 * preview to the stacked phone treatment on a desktop that has room for both.
 *
 * Hence `min(1180px, 96vw)` and internal scrolling rather than a fixed height:
 * the flows are 3 and 5 steps and their steps are not the same height, so a
 * fixed body would either clip the tallest or leave the shortest floating in
 * space.
 *
 * ## The draft outlives the modal, which is the point
 *
 * `LaunchFlow` persists its step and fields, so dismissing this does not throw
 * the work away — reopening resumes. That is what makes a modal acceptable here
 * at all: a multi-step form behind a backdrop that discards on a stray click
 * would be worse than the page it replaced.
 */
export function CreateFlowModal({
  kind,
  onOpenChange,
  networkSlug,
}: {
  /** Null closes it. The kind is the open state, so there is one source of truth. */
  kind: LaunchKind | null;
  onOpenChange: (open: boolean) => void;
  networkSlug: string;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent
        // `sm:max-w-none` is NOT redundant with `max-w-none`. `DialogContent`'s
        // own classes end in `sm:max-w-lg` (512px), and a responsive variant
        // beats an unprefixed utility in the generated stylesheet whatever the
        // order in this string — so the unprefixed override alone left the
        // dialog 454px wide and collapsed the flow's two columns to an 86px
        // form beside the preview. Measured; `EarningsModal` has the same
        // unprefixed override and never noticed because 480px < 512px.
        className="max-h-[92vh] w-[min(1180px,96vw)] max-w-none overflow-y-auto border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-2xl p-5 sm:max-w-none sm:p-7"
        data-testid="create-flow-modal"
      >
        <DialogHeader className="pb-1">
          <DialogTitle className="text-[17px] tracking-[-0.01em]">
            {kind === "auction" ? "Create an auction" : "Create a token"}
          </DialogTitle>
        </DialogHeader>

        {kind === "fair" && <LaunchFlow networkSlug={networkSlug} />}
        {kind === "auction" && <AuctionFlow networkSlug={networkSlug} />}
      </DialogContent>
    </Dialog>
  );
}
