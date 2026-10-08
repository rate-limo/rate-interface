"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChainMark } from "@components/Landing/ChainMark";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";

export type ChainCard = {
  name: string;
  chainId: number;
  gas: string;
  testnet: boolean;
  slug: string | null;
};

const TABS = [
  { key: "mainnet", label: "Mainnet" },
  { key: "testnet", label: "Testnet" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Mainnet first, always — including while it is empty. The order is the
 * statement of what Rate is for; an empty Mainnet tab says "not yet" honestly,
 * and the empty state points at the Testnet tab rather than hiding the one
 * that matters. Which tab a chain lands in is the registry's `testnet` flag,
 * never its name.
 */
export function ChainTabs({ chains }: { chains: ChainCard[] }) {
  const [tab, setTab] = useState<Tab>("mainnet");
  const shown = chains.filter((c) => (tab === "testnet" ? c.testnet : !c.testnet));
  const count = (key: Tab) => chains.filter((c) => (key === "testnet" ? c.testnet : !c.testnet)).length;

  return (
    <div className="mt-14">
      <div role="tablist" aria-label="Networks" className="inline-flex rounded-full border border-dark-grey-3 p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            id={`chains-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls="chains-panel"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-2 font-mono-brand text-xs tracking-[0.12em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--m-primary)]",
              tab === key ? "bg-purple-400 text-on-primary" : "text-dark-grey-1 hover:text-white",
            )}
          >
            {label} <span className="tabular-nums opacity-70">{count(key)}</span>
          </button>
        ))}
      </div>

      <div id="chains-panel" role="tabpanel" aria-labelledby={`chains-tab-${tab}`} className="mt-6">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dark-grey-3 p-8">
            <p className="font-display text-xl font-medium text-white">
              {tab === "mainnet" ? "Mainnet is next." : "No testnets right now."}
            </p>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-dark-grey-1">
              {tab === "mainnet"
                ? "Rate runs on testnet today. Each mainnet chain appears here the moment its contracts are deployed and verified."
                : "Testnet chains appear here once their contracts are deployed and verified."}
            </p>
            {tab === "mainnet" && count("testnet") > 0 ? (
              <button
                type="button"
                onClick={() => setTab("testnet")}
                className="mt-5 font-mono-brand text-xs tracking-[0.12em] text-[color:var(--m-accent-text)] uppercase hover:underline"
              >
                Try it on testnet →
              </button>
            ) : null}
          </div>
        ) : (
          <ChainCarousel count={shown.length} resetKey={tab}>
            {shown.map((c) => (
              <div key={c.name} data-chain-card className="h-full w-[85%] shrink-0 snap-start rounded-2xl border border-dark-grey-3 bg-black-300 p-6 sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]">
                <div className="flex items-center gap-4">
                  <ChainMark chainName={c.name} />
                  <div className="min-w-0">
                    <div className="font-display truncate text-xl font-medium text-white">{c.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono-brand text-[11px] tracking-[0.1em] text-[color:var(--m-success)] uppercase">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--m-success)]" />
                        Live
                      </span>
                      {c.testnet ? (
                        <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono-brand text-[10px] tracking-wider text-dark-grey-1 uppercase">
                          Testnet
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-white/5 pt-5 font-mono-brand text-sm">
                  <div>
                    <dt className="text-[10.5px] tracking-[0.1em] text-dark-grey-1 uppercase">Chain ID</dt>
                    <dd className="mt-1 text-white tabular-nums">{c.chainId}</dd>
                  </div>
                  <div>
                    <dt className="text-[10.5px] tracking-[0.1em] text-dark-grey-1 uppercase">Gas</dt>
                    <dd className="mt-1 text-white">{c.gas}</dd>
                  </div>
                </dl>
                {c.slug ? (
                  <a
                    href={buildPageUrl("trade", { slug: c.slug })}
                    className="mt-5 inline-flex font-mono-brand text-xs tracking-[0.12em] text-[color:var(--m-accent-text)] uppercase hover:underline"
                  >
                    Trade on {c.name.replace(/\s*testnet$/i, "")} →
                  </a>
                ) : null}
              </div>
            ))}
          </ChainCarousel>
        )}
      </div>
    </div>
  );
}

/**
 * The chain cards as one horizontal row that scrolls, at every width.
 *
 * Stacked, every new chain made the section a screen taller on a phone, and on
 * desktop a fourth chain wrapped onto a lonely second row. In a row the section
 * keeps one height however many chains Rate runs on: swipe or scroll it, or use
 * the arrows, and the next card always peeks in from the edge so the row reads
 * as more than what is on screen. Plain CSS scroll-snap, so it keeps native
 * momentum and keyboard scrolling and needs no library.
 */
function ChainCarousel({ count, resetKey, children }: { count: number; resetKey: string; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-chain-card]");
    const step = card ? card.offsetWidth + 16 : el.clientWidth;
    setIndex(Math.min(count - 1, Math.round(el.scrollLeft / step)));
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, [count]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, resetKey]);

  /** One card left (-1) or right (+1) of whichever card the row is at NOW,
   * read from the scroll position at click time rather than from state, which
   * only catches up when a scroll event lands. */
  const step = (dir: -1 | 1) => {
    const el = track.current;
    const cards = el ? [...el.querySelectorAll<HTMLElement>("[data-chain-card]")] : [];
    if (!el || cards.length === 0) return;
    const lefts = cards.map((c) => c.offsetLeft - cards[0]!.offsetLeft);
    let current = 0;
    for (let i = 0; i < lefts.length; i++) {
      if (Math.abs(lefts[i]! - el.scrollLeft) < Math.abs(lefts[current]! - el.scrollLeft)) current = i;
    }
    const to = Math.max(0, Math.min(cards.length - 1, current + dir));
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const max = el.scrollWidth - el.clientWidth;
    const left = Math.min(lefts[to]!, max);
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    // Set from the target, not left to the scroll listener: a smooth scroll
    // reports its end late, and the arrows must not lag a click behind.
    setIndex(to);
    setCanPrev(left > 4);
    setCanNext(left < max - 4);
  };

  const arrow =
    "grid h-10 w-10 place-items-center rounded-full border border-dark-grey-3 text-white transition-colors hover:border-white/40 disabled:opacity-30 disabled:hover:border-dark-grey-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--m-primary)]";

  return (
    <div>
      <div
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label="Chains Rate runs on"
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--m-primary)] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {canPrev || canNext ? (
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  i === index ? "w-5 bg-[color:var(--m-accent)]" : "w-1.5 bg-dark-grey-3",
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="Previous chain" disabled={!canPrev} onClick={() => step(-1)} className={arrow}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Next chain" disabled={!canNext} onClick={() => step(1)} className={arrow}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
