"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, Rows3 } from "lucide-react";
import { LAUNCH_SORTS, launchSort, type LaunchSort } from "@/lib/launch/sorts";
import type { QuoteOptionRow } from "@/hooks/useQuoteOptions";
import { cn } from "@/lib/utils";

/** All · On the ladder · Graduated · Listed — three separate events (the backend
 * `?status=`); "Graduated" is the onchain graduation, "Listed" the listing badge. */
export type LaunchTab = "all" | "ladder" | "graduated" | "listed";
export type LaunchView = "grid" | "list";

const TABS: { key: LaunchTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ladder", label: "On the ladder" },
  { key: "graduated", label: "Graduated" },
  { key: "listed", label: "Listed" },
];

/**
 * The launch directory's control bar: what to show, in what order, quoted in
 * what.
 *
 * ## Three axes, deliberately separate
 *
 * The tabs choose WHICH coins, the dropdown chooses THE ORDER, the chips choose
 * the quote. Folding the order into the tabs is what the page did before, and
 * it is why a freshly traded coin jumping to the front was defensible then and
 * is not now: with an explicit sort, a live reorder becomes a second ordering
 * fighting the one the reader picked. See `hoistReorders`.
 *
 * ## The quote row hides itself below two quotes
 *
 * `enabledQuoteTokens()` is the venue's own list — the same one the launch form
 * reads to decide what a coin may list against — so the chips are never
 * hardcoded. On a venue with one quote, "All pairs · USDC" is a filter with a
 * single option, which is a control that cannot change anything. It appears
 * when there is a choice to make.
 */
export function LaunchControls({
  tab,
  onTab,
  sort,
  onSort,
  quote,
  onQuote,
  view,
  onView,
  quotes,
}: {
  tab: LaunchTab;
  onTab: (tab: LaunchTab) => void;
  sort: LaunchSort;
  onSort: (sort: LaunchSort) => void;
  quote: string | null;
  onQuote: (quote: string | null) => void;
  view: LaunchView;
  onView: (view: LaunchView) => void;
  quotes: readonly QuoteOptionRow[];
}) {
  const [open, setOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const selected = launchSort(sort);

  /* Close on an outside click or Escape. Both, because a dropdown that only
     closes on re-click strands itself open behind whatever the reader does
     next — and Escape is the one a keyboard reader reaches for first. */
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Launch filter" className="flex items-center gap-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              data-testid={`launch-tab-${key}`}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-[color,background-color,border-color] active:scale-[0.96]",
                tab === key
                  ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-primary)]"
                  : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto" ref={sortRef}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="launch-sort"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3.5 text-xs font-medium text-[color:var(--m-text-primary)] transition-colors active:scale-[0.96]"
          >
            {selected.label}
            <ChevronDown
              aria-hidden
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <div
              role="listbox"
              aria-label="Sort launches"
              className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.12)]"
            >
              {LAUNCH_SORTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={option.key === sort}
                  onClick={() => {
                    onSort(option.key);
                    setOpen(false);
                  }}
                  data-testid={`launch-sort-${option.key}`}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                    option.key === sort
                      ? "bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-text-primary)]"
                      : "text-[color:var(--m-text-secondary)] hover:bg-[color:var(--m-surface-2)]",
                  )}
                >
                  <span className="flex flex-col">
                    {option.label}
                    {option.note && (
                      <span className="text-[10.5px] text-[color:var(--m-text-secondary-2)]">
                        {option.note}
                      </span>
                    )}
                  </span>
                  {option.key === sort && (
                    <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-[color:var(--m-primary)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          role="group"
          aria-label="Layout"
          className="flex items-center gap-1 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-1"
        >
          {([
            { key: "grid" as const, label: "Grid", Icon: LayoutGrid },
            { key: "list" as const, label: "List", Icon: Rows3 },
          ]).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              aria-label={label}
              onClick={() => onView(key)}
              data-testid={`launch-view-${key}`}
              /* 28px visible inside a 40px hit area — the control is small by
                 design but must not be small to hit. */
              className={cn(
                "relative grid h-7 w-7 place-items-center rounded-full transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-10 after:w-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
                view === key
                  ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary-2)]",
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Only when there is a choice to make — see the component note. */}
      {quotes.length > 1 && (
        <div role="group" aria-label="Quote" className="flex flex-wrap items-center gap-1.5">
          <QuoteChip active={quote === null} onClick={() => onQuote(null)} label="All pairs" />
          {quotes.map((option) => (
            <QuoteChip
              key={option.address}
              active={quote?.toLowerCase() === option.address.toLowerCase()}
              onClick={() => onQuote(option.address)}
              label={option.symbol}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={`launch-quote-${label}`}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[11.5px] font-medium transition-[color,background-color,border-color] active:scale-[0.96]",
        active
          ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] font-semibold text-[color:var(--m-primary)]"
          : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]",
      )}
    >
      {label}
    </button>
  );
}
