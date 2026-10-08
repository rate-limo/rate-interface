"use client";

import { useState } from "react";
import { Activity, LockKeyhole, Pause, ShieldCheck } from "lucide-react";
import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { cn } from "@/lib/utils";

/*
 * Told as the brand line (brand book v1): "Don't trade." Most bots exist to
 * trade more; this one is pitched as the thing that lets a holder NOT watch the
 * screen — it waits for the owner's rate and otherwise does nothing. The mode
 * and limit copy below is unchanged, and it is what makes that true: every
 * order is bounded by owner-set pairs, size, slippage and cadence.
 */
const MODES = ["Paper", "Approval required", "Guarded live"] as const;

const MODE_COPY = {
  Paper: "Test a frozen strategy against live Rate market data. No wallet authority and no assets at risk.",
  "Approval required": "The agent proposes a complete order. You inspect the policy result and sign each transaction.",
  "Guarded live": "Later release. A dedicated vault executes only inside owner-set, deterministic limits.",
};

export function AgentDeskSection() {
  const [mode, setMode] = useState<(typeof MODES)[number]>("Paper");

  return (
    <section className="border-t border-white/5 bg-black-300 py-24 md:py-32">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-700/35 bg-purple-400/10 px-3 py-1.5 font-mono-brand text-[11px] tracking-[0.12em] text-purple-700 uppercase dark:border-purple-400/30 dark:text-purple-300">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              OG Pass early access
            </div>
            <h2 className="font-display mt-5 max-w-lg text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
              Don&apos;t trade. Let an agent wait for your rate.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-dark-grey-1">
              Most bots are built to trade more. Agent Desk is built to trade less: it waits for the price you set, acts only inside limits you signed, and does nothing the rest of the time. You hold; it watches. And the agent is on a mandate, never on your wallet.
            </p>

            <div className="mt-8 space-y-5 border-l border-dark-grey-3 pl-5">
              {[
                [ShieldCheck, "Limits enforced before execution", "Pairs, size, exposure, slippage, cadence, loss and expiry."],
                [Activity, "A track record with receipts", "Every live result links to its strategy version, proposal, transaction, fill, fees and cash flows."],
                [Pause, "Doing nothing is the default", "No price, no trade. The agent cannot widen policy, withdraw capital, or hide a rejected action, and pause stays with you."],
              ].map(([Icon, title, body]) => (
                <div key={String(title)} className="grid grid-cols-[24px_1fr] gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-purple-400" aria-hidden="true" />
                  <div>
                    <h3 className="font-display text-[15px] font-medium text-white">{String(title)}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-dark-grey-1">{String(body)}</p>
                  </div>
                </div>
              ))}
            </div>

          </Reveal>

          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-2xl border border-dark-grey-3 bg-black-400 shadow-[0_30px_80px_-48px_rgba(94,145,188,.5)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-grey-3 px-5 py-4">
                <div>
                  <div className="font-mono-brand text-[11px] tracking-[0.12em] text-dark-grey-1 uppercase">Agent Desk</div>
                  <div className="mt-1 font-display text-lg font-medium text-white">ETH passive accumulator</div>
                </div>
                <span className="rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1.5 font-mono-brand text-[11px] text-green-300">
                  Example · {mode}
                </span>
              </div>

              <div className="grid gap-px bg-dark-grey-3 sm:grid-cols-3">
                {[["Allocated", "$10,000"], ["Max drawdown", "3.00%"], ["Current exposure", "0.00%"]].map(([label, value]) => (
                  <div key={label} className="bg-black-400 px-5 py-4">
                    <div className="font-mono-brand text-[10px] tracking-[0.08em] text-dark-grey-2 uppercase">{label}</div>
                    <div className="mt-2 font-mono-brand text-xl text-white">{value}</div>
                  </div>
                ))}
              </div>

              <div className="p-5">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Agent operating mode preview">
                  {MODES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={mode === item}
                      onClick={() => setMode(item)}
                      className={cn(
                        "rounded-full border px-3 py-2 font-mono-brand text-[11px] transition-colors",
                        mode === item
                          ? "border-purple-400 bg-purple-400/10 text-purple-300"
                          : "border-dark-grey-3 text-dark-grey-1 hover:text-white",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="mt-5 min-h-[132px] rounded-xl border border-dark-grey-3 bg-black-300 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono-brand text-[10px] tracking-[0.1em] text-dark-grey-2 uppercase">Operating boundary</span>
                    <span className="font-mono-brand text-[10px] text-purple-300">policy v1</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white">{MODE_COPY[mode]}</p>
                  <div className="mt-4 flex flex-wrap gap-2 font-mono-brand text-[10px] text-dark-grey-1">
                    <span className="rounded-md bg-black-200 px-2 py-1">ETH/USDC only</span>
                    <span className="rounded-md bg-black-200 px-2 py-1">$250 / order</span>
                    <span className="rounded-md bg-black-200 px-2 py-1">0.50% slippage</span>
                    <span className="rounded-md bg-black-200 px-2 py-1">owner pause</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
