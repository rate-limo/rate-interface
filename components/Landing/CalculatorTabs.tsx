"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { FeeCalculator } from "@components/Landing/FeeCalculator";
import { TraderCalculator } from "@components/Landing/TraderCalculator";

const TABS = [
  { key: "lps", label: "For LPs" },
  { key: "traders", label: "For traders" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CalculatorTabs() {
  const [tab, setTab] = useState<TabKey>("lps");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Compute the fee as an LP or as a trader"
        className="inline-flex rounded-full border border-dark-grey-3 bg-black-400 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "rounded-full px-5 py-2 font-mono-brand text-xs font-medium tracking-[0.1em] uppercase transition-colors",
              tab === t.key
                ? "bg-purple-400 text-on-primary"
                : "text-dark-grey-1 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "lps" ? <FeeCalculator /> : <TraderCalculator />}
      </div>
    </div>
  );
}
