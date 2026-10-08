import type { SpotToken } from "@/types";

/**
 * What a launch tile or row shows for a ladder coin (design C+, 2026-10-03).
 *
 * The gateway does the counting (`token.ladder`: steps sold, the graduation
 * market cap, pool value); this only turns it into words, a ring and notches,
 * so the tile, the table and the tests read one mapping.
 *
 * Graduation here is the coin's ONCHAIN graduation ("Graduate"), never the
 * backend listing ("List") — apps/web/CLAUDE.md.
 */

export type Ladder = NonNullable<SpotToken["ladder"]>;
export type LadderTone = "placing" | "step" | "armed" | "graduated";

export interface LadderDisplay {
  tone: LadderTone;
  /** The corner pill on the art. */
  pill: string;
  /** The bold line beside the ring. */
  headline: string;
  /** The second line beside the ring. */
  detail: string;
  /** 0..1, how much of the ring is filled. */
  progress: number;
  /** Ring fractions (0..1) where each later step starts. */
  notches: number[];
  /** Unix seconds the countdown runs to, when armed. */
  countdownTo: number | null;
}

/** "$12.3K" — same scale as the rest of the launch surfaces; a dash when unknown. */
export function compactUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const v = Math.max(0, value);
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

/** A quote amount in USD when the quote has a price, else in its own symbol. */
function money(usd: number | null, quote: number | null, symbol: string | null): string {
  if (usd !== null && Number.isFinite(usd)) return compactUsd(usd);
  if (quote === null || !Number.isFinite(quote)) return "—";
  const n = quote >= 1_000 ? `${(quote / 1_000).toFixed(1)}K` : quote.toFixed(quote >= 10 ? 0 : 2);
  return `${n} ${symbol ?? ""}`.trim();
}

/** "3:12" from seconds remaining; "0:00" once due. */
export function countdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Where each step after the first starts, as a fraction of the graduation cap. */
export function ladderNotches(ladder: Ladder): number[] {
  const grad = ladder.graduationMarketCap.quote;
  if (!(grad > 0)) return [];
  return ladder.steps
    .slice(1)
    .map((s) => s.marketCapQuote / grad)
    .filter((f) => f > 0 && f < 1);
}

export function ladderDisplay(ladder: Ladder, nowSec: number): LadderDisplay {
  // FIRST, because a placing ladder has no steps and null prices: every branch
  // below reads one or the other, and the selling branch would quietly render
  // "— to graduate · last step" for a coin that has never offered a step.
  if (ladder.state === "placing") {
    return {
      tone: "placing",
      pill: "placing ladder",
      headline: "Not for sale yet",
      detail: `${ladder.stepsTotal} steps are being placed`,
      progress: 0,
      notches: [],
      countdownTo: null,
    };
  }
  const notches = ladderNotches(ladder);
  const progress = Math.max(0, Math.min(1, ladder.progress));
  const sym = ladder.quote.symbol;
  const gradText = money(ladder.graduationMarketCap.usd, ladder.graduationMarketCap.quote, sym);

  if (ladder.state === "graduated") {
    return {
      tone: "graduated",
      pill: "✓ graduated",
      headline: `${money(ladder.marketCapUsd, ladder.marketCapQuote, sym)} market cap`,
      detail: `pool ${money(ladder.poolValueUsd, ladder.poolValueQuote, sym)} locked`,
      progress: 1,
      notches,
      countdownTo: null,
    };
  }
  if (ladder.state === "armed") {
    return {
      tone: "armed",
      pill: "armed",
      headline: `Graduating in ${countdown((ladder.readyAt ?? nowSec) - nowSec)}`,
      detail: `pool opens at ${gradText}`,
      progress: 1,
      notches,
      countdownTo: ladder.readyAt,
    };
  }
  if (ladder.state === "soldOut") {
    return {
      tone: "step",
      pill: "sold out",
      headline: "Ready to graduate",
      detail: `all ${ladder.stepsTotal} steps sold`,
      progress: 1,
      notches,
      countdownTo: null,
    };
  }

  // Selling: the step currently on offer is the first unsold one.
  const current = ladder.steps.find((s) => !s.sold);
  const currentIdx = current ? ladder.steps.indexOf(current) : ladder.steps.length - 1;
  const next = ladder.steps[currentIdx + 1];
  let detail = `last step · graduates at ${gradText}`;
  if (current && next && current.marketCapQuote > 0) {
    const jump = Math.round((next.marketCapQuote / current.marketCapQuote - 1) * 100);
    detail = `next step at ${money(next.marketCapUsd, next.marketCapQuote, sym)} (+${jump}%)`;
  }
  return {
    tone: "step",
    pill: `step ${Math.min(ladder.stepsTotal, currentIdx + 1)} / ${ladder.stepsTotal}`,
    headline: `${money(ladder.toGraduateUsd, ladder.toGraduateQuote, sym)} to graduate`,
    detail,
    progress,
    notches,
    countdownTo: null,
  };
}
