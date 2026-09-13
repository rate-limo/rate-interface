"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { RangeChart } from "@components/Landing/charts/RangeChart";
import { lpEconomicsData, lvrNetData } from "@/lib/simData";

/**
 * The gross and net LP-income comparisons merged into one card. Net — income
 * after what a 25% price move costs each provider — is the claim the landing
 * page makes, so it's the default view; gross is kept behind a toggle purely
 * as the comparison baseline (it's where the CEX maker-schedule figures come
 * from before their unmodeled inventory cost is credited as zero).
 */
const VIEWS = {
  net: {
    label: "Net of a 25% move",
    title: "Iter LPs still profit after the market moves 25%",
    subtitle:
      "A pool quotes a stale price until an arbitrageur takes the gap, wiping out Uniswap's and Curve's fees and leaving their LPs negative, while an Iter LP sets their own price — so the worst case is the price they chose, and profit holds even at +100%. CEX makers are counted at gross with inventory cost as zero, and the top tier still trails Iter's thinnest net.",
    data: lvrNetData,
    xLabel: "LP net profit after price move, per $1M matched volume",
  },
  gross: {
    label: "Gross",
    title: "What liquidity pays, before any loss is counted",
    subtitle:
      "Gross income per $1M matched, including the professional market makers who quote on centralized exchanges — the job Iter opens to anyone. A top-tier CEX maker keeps a rebate plus the spread they capture; a retail account pays to make a market, so its bar sits left of zero.",
    data: lpEconomicsData,
    xLabel: "Gross LP take, per $1M matched volume",
  },
} as const;

type ViewKey = keyof typeof VIEWS;

/*
 * The 130-word LVR note that used to sit here is gone, and so is the acronym.
 *
 * It existed because the net view rested on a term the page never defined — a
 * reader who does not know what LVR is cannot judge "net of LVR". That was a
 * real problem, but defining the jargon was the more expensive way out of it:
 * the note spent a paragraph teaching a term the reader then had to carry back
 * up to the chart.
 *
 * Naming the quantity plainly retires the whole problem. The axis says "LP net
 * profit after price move", the table column already said "Loss when price
 * moves", and the mechanism — a pool quoting a stale price until an arbitrageur
 * takes the difference — is one clause of the subtitle rather than a lecture.
 *
 * What went with it, deliberately: the explicit bridge saying LVR and
 * impermanent loss are the same channel measured two ways. With neither term on
 * screen any more, there is nothing left to reconcile. `lib/simData.ts` still
 * uses the vocabulary internally, where it is precise and the audience is us.
 */

export function LpIncomeCard() {
  const [view, setView] = useState<ViewKey>("net");
  const v = VIEWS[view];

  return (
    <RangeChart
      title={v.title}
      subtitle={v.subtitle}
      data={[...v.data]}
      xLabel={v.xLabel}
      headerRight={
        <div
          role="group"
          aria-label="Show LP income net of a 25% move, or gross for comparison"
          className="inline-flex shrink-0 rounded-full border border-dark-grey-3 bg-black-400 p-0.5"
        >
          {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => setView(k)}
              className={clsx(
                "rounded-full px-3 py-1 font-mono-brand text-[10px] font-medium tracking-[0.08em] uppercase transition-colors",
                view === k
                  ? "bg-purple-400 text-on-primary"
                  : "text-dark-grey-1 hover:text-white",
              )}
            >
              {VIEWS[k].label}
            </button>
          ))}
        </div>
      }
    />
  );
}
