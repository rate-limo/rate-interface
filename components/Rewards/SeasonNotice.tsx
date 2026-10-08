"use client";

import { useEffect, useState } from "react";
import { epochOf, seasonEndsAt, seasonOf } from "@/lib/rewards/epoch";
import { cn } from "@/lib/utils";

/**
 * "$RATE is distributed at the end of the season", with the season's date.
 *
 * Rewards are pushed to wallets once per season from each season's budget —
 * nobody claims anything — so every surface that shows points owes the reader
 * WHEN they turn into RATE. One component, so the date and the wording cannot
 * drift between the portfolio, the earnings sheet and the affiliate page.
 *
 * The date is computed in an effect, never during render (the clock differs
 * between server and browser; same rule as the status bar's countdown), and the
 * line renders nothing until then rather than a guessed date.
 */
/** The current season and when it ends, read from the clock after mount. */
function useSeason(): { n: number; date: string; when: string } | null {
  const [season, setSeason] = useState<{ n: number; ends: Date } | null>(null);
  useEffect(() => {
    const now = new Date();
    setSeason({ n: seasonOf(epochOf(now)), ends: seasonEndsAt(now) });
  }, []);
  if (!season) return null;
  const date = season.ends.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const days = Math.max(0, Math.ceil((season.ends.getTime() - Date.now()) / 86_400_000));
  const when = days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`;
  return { n: season.n, date, when };
}

/** The payout date alone, for a figure slot ("Dec 7, 2026"). */
export function SeasonPayoutDate() {
  const s = useSeason();
  return <>{s ? s.date : "—"}</>;
}

/** "Season 4 · in 70 days", under the date. */
export function SeasonPayoutWhen() {
  const s = useSeason();
  return s ? <>Season {s.n} ends {s.when}</> : null;
}

export function SeasonNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  const s = useSeason();
  if (!s) return null;
  const season = { n: s.n };
  const { date, when } = s;

  return (
    <p data-testid="season-notice" className={cn("text-[12.5px] leading-snug text-[color:var(--m-text-secondary)]", className)}>
      <span className="font-semibold text-[color:var(--m-text-primary)]">Season {season.n}</span>
      {compact ? " · " : " — "}$RATE is distributed at the end of the season:{" "}
      <span className="font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{date}</span>{" "}
      <span className="text-[color:var(--m-text-secondary-2)]">({when})</span>.
    </p>
  );
}
