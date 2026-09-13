import { cn } from "@/lib/utils";

/**
 * The one step indicator. Launch, Liquidity, the swap transaction flow and
 * onboarding all render this.
 *
 * ## Why it exists
 *
 * There were four. Launch and Liquidity were byte-identical inline copies of
 * each other; SwapFlow was the same design re-typed, and every value had
 * landed a notch off — 11px label instead of 11.5, 16px connector instead of
 * 18, 4/6px gaps instead of 5/7, and a different active fill AND ink. Nothing
 * anywhere explained one of those differences, which is what told us they were
 * drift rather than intent. This repo keeps writing down that two
 * implementations is how one quietly stops matching the other; three was the
 * same mistake at smaller scale.
 *
 * ## The active chip is a SOLID fill, and that is the bug fix
 *
 * The step number is 10px bold. That is normal text, so the floor is AA 4.5:1,
 * and every previous variant failed it somewhere:
 *
 *   Launch + Liquidity  --m-primary-100 / --m-primary-600   4.00 light · 3.71 dark
 *   SwapFlow            --m-primary 15% / --m-primary       1.81 light · 4.99 dark
 *   this                --m-primary     / --m-on-primary    6.45 light · 6.69 dark
 *
 * SwapFlow's light chip was effectively an empty circle. And --m-primary-100 is
 * the LIGHTEST step of the ramp in both themes — the palette notes in
 * globals.css say reaching for it as a fill "puts a near-white slab on the dark
 * theme", which is exactly what it did.
 *
 * --m-on-primary is not a new token and not a guess: it is defined as the ink
 * that sits on the primary fill, and it already flips with the theme.
 *
 * The completed chip is `--m-success` with --m-text-primary-inverse rather than
 * white, for the same reason — white on --m-success is 2.53:1 in light. A tick
 * is a glyph rather than text so it escapes the letter of the rule, but it was
 * the same washed-out mark.
 *
 * ## Two shapes, and why bar is not just a smaller dots
 *
 * `dots` is for a fixed, named, small set of steps where the labels carry
 * meaning. `bar` is for onboarding, whose step count is genuinely variable —
 * three screens when a referrer is already known, four when not. A dot row that
 * changes length between sessions reads as a different flow; a bar does not.
 *
 * ## Semantics
 *
 * An ordered list with `aria-current="step"` on the active item, plus a
 * visually-hidden "Step 2 of 3: Market" so the progress is announced rather
 * than inferred from four unlabelled numbers. None of the four originals had
 * any of this; onboarding conveyed progress non-visually only because "2 / 4"
 * happened to be literal text.
 */

export interface StepperStep {
  key: string;
  label: string;
  /**
   * Rendered struck through and announced as unavailable. SwapFlow uses this
   * for Approve when an allowance already exists. It used to be a 40% opacity
   * dim, which reads as disabled-and-still-coming rather than skipped — and at
   * 40% the label sat under 2:1 against the card.
   */
  skipped?: boolean;
}

interface StepperProps {
  steps: readonly StepperStep[];
  /** Index into `steps`. Everything before it renders complete. */
  activeIndex: number;
  shape?: "dots" | "bar";
  /** Names the list for assistive tech, e.g. "Launch a coin". */
  label: string;
  /** Shown beside the count in `bar` shape only — onboarding prints Iter there. */
  barBrand?: string;
  className?: string;
}

export function Stepper({
  steps,
  activeIndex,
  shape = "dots",
  label,
  barBrand,
  className,
}: StepperProps) {
  const active = steps[activeIndex];
  const position = `Step ${activeIndex + 1} of ${steps.length}${
    active ? `: ${active.label}` : ""
  }`;

  if (shape === "bar") {
    const pct = steps.length > 0 ? ((activeIndex + 1) / steps.length) * 100 : 0;
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <p
          className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[color:var(--m-primary-fg)] uppercase"
          aria-hidden
        >
          {barBrand && (
            <span className="font-bold text-[color:var(--m-logo)]">{barBrand}</span>
          )}
          {barBrand && "·"} {activeIndex + 1} / {steps.length}
        </p>
        <div
          className="h-[2px] rounded-full bg-[color:var(--m-border)]"
          role="progressbar"
          aria-label={label}
          aria-valuenow={activeIndex + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuetext={position}
        >
          <div
            className="h-full rounded-full bg-[color:var(--m-primary)] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <span className="sr-only">{position}</span>
      <ol aria-label={label} className="flex flex-wrap items-center gap-[5px]">
        {steps.map((step, i) => {
          const done = i < activeIndex;
          const on = i === activeIndex;
          return (
            <li key={step.key} className="flex items-center gap-[5px]">
              <span
                aria-current={on ? "step" : undefined}
                aria-disabled={step.skipped || undefined}
                className={cn(
                  "flex items-center gap-[7px] font-mono text-[11.5px]",
                  on
                    ? "text-[color:var(--m-text-primary)]"
                    : "text-[color:var(--m-text-secondary-2)]",
                  step.skipped && "text-[color:var(--m-text-secondary-2)] line-through",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold",
                    done
                      ? "border-[color:var(--m-success)] bg-[color:var(--m-success)] text-[color:var(--m-text-primary-inverse)]"
                      : on
                        ? "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                        : "border-[color:var(--m-border)] bg-[color:var(--m-surface)]",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                {step.label}
                {step.skipped && <span className="sr-only">(not needed)</span>}
              </span>
              {/* The connector fills behind completed steps, so how far along
                  you are reads without counting dots. */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-[1.5px] w-[18px] rounded-[1px]",
                    done
                      ? "bg-[color:var(--m-success)]"
                      : "bg-[color:var(--m-border)]",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
