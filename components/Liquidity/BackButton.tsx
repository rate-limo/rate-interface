"use client";

import { cn } from "@/lib/utils";

/**
 * One back control for every step of the liquidity flow.
 *
 * There were three, and no two agreed on anything:
 *
 * | step    | control                        | position            |
 * |---------|--------------------------------|---------------------|
 * | Fee     | 15px outlined button, "Back"   | bottom, beside Continue |
 * | Range   | 11px mono text link, "← back"  | top RIGHT of the card   |
 * | Confirm | 30×30 bordered icon, "←" only  | top LEFT of the card    |
 *
 * Three positions, three sizes, three treatments, three labels — and only the
 * Confirm one carried an `aria-label`, so the other two announced as "back" or
 * as a bare arrow. Moving between steps meant the same action appearing in a
 * different place, at a different size, wearing a different hat.
 *
 * This is that control, once. Top-left of the step's card, beside its heading,
 * which is the one position that reads as "up a level" rather than as an action
 * competing with the primary CTA at the bottom.
 *
 * `label` names the DESTINATION for screen readers ("Back to the pair"), because
 * "Back" alone is the one thing a person navigating by control list cannot act
 * on. The visible text stays "Back" — the destination is obvious on screen from
 * the stepper above it, and spelling it out would make the control wider than
 * the heading it sits beside.
 */
export function BackButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  /** Where it goes, for assistive tech. e.g. "Back to the pair". */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid="liq-back"
      className={cn(
        "flex flex-none items-center gap-1 rounded-[9px] border border-[var(--m-border)] px-2 py-1 text-[12.5px] text-[var(--m-text-secondary)] transition-colors hover:border-[var(--m-primary)] hover:text-[var(--m-primary-fg)]",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">←</span>
      Back
    </button>
  );
}
