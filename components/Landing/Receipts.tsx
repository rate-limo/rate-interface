import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { LineChart } from "@components/Landing/charts/LineChart";
import { LpIncomeCard } from "@components/Landing/LpIncomeCard";
import { CalculatorTabs } from "@components/Landing/CalculatorTabs";
import { CHART_SERIES, slippageData, mevData, ilData } from "@/lib/simData";

const COMPARISON_SERIES = [
  CHART_SERIES.iter,
  CHART_SERIES.v2,
  CHART_SERIES.v3,
  CHART_SERIES.curve,
];

const STATS = [
  {
    value: "~0%",
    label: "slippage",
    body: "A large trade that loses up to 66% of its value to price impact on Uniswap v2 fills near its quoted price here. If the book can't fill you, your money comes back. No fake prices.",
  },
  {
    value: "200,000×",
    label: "less MEV loss",
    body: "A sandwich attack that takes $500,000 from one trade on Uniswap v2 gets $2.55 here. After paying gas, the attacker loses money on every trade size.",
  },
  {
    value: "Positive",
    label: "LP take, every tier",
    body: "In the simulation, a 25% move turns Uniswap and Curve LPs net negative: their impermanent loss outruns the fees. A Rate LP only ever fills at the fair price plus its own quoted tolerance, so every tier stays net positive.",
  },
];

export function Receipts() {
  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            Lose less on every trade.
          </h2>
          {/* The one word that must stay: these figures come from a simulation. */}
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Simulated results. Rerun every number yourself.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-3">
          {STATS.map((stat, i) => (
            <Reveal key={stat.value} delay={0.05 * i}>
              <div>
                <div className="font-mono-brand text-5xl font-medium tracking-tight text-purple-400">
                  {stat.value}
                </div>
                <div className="font-display mt-2 text-xl font-medium text-white">
                  {stat.label}
                </div>
                <p className="mt-3 max-w-md text-base leading-relaxed text-dark-grey-1">
                  {stat.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* The "Reading these charts" preamble was removed on 2026-08-07. It
            explained the methodology in a paragraph nobody had asked for yet —
            each chart already carries its own subtitle, and the exact figures
            are a hover or a table away. The charts now follow the stat row
            directly, which is why this grid took over the mt-16 the preamble
            used to hold. */}
        <Reveal delay={0.2}>
          <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LineChart
              title="Slippage by trade size"
              subtitle="Percent of the trade lost to price impact, as the trade grows relative to book depth."
              data={slippageData}
              series={COMPARISON_SERIES}
              format="pct"
              yDomain={[0, 70]}
              xLabel="Trade size, as % of pool depth"
            />
            <LineChart
              title="Sandwich profit by trade size"
              subtitle="What an attacker nets sandwiching one trade, net of nothing but the trade itself."
              data={mevData}
              series={COMPARISON_SERIES}
              format="usd"
              xLabel="Trade size, as % of pool depth"
            />
            <LineChart
              title="LP loss when the market moves"
              // Defines the term at first sight of the chart. "Vs. simply holding"
              // is the benchmark the figures actually use -- sim.py's il_standard
              // is the standard 2-asset formula, measured against holding the two
              // assets, and iter_il_bound clips that same formula at the LP's
              // own tolerance. Worth stating: it is what makes the LVR note under
              // the next chart able to say the two are one channel.
              subtitle="Impermanent loss — how far a position ends up behind simply holding the two assets, once the price has moved — at Rate's widest tolerance vs. passive AMM liquidity."
              data={ilData}
              series={COMPARISON_SERIES}
              format="pct"
              xLabel="Price move, as a multiple of the starting price"
            />
            <LpIncomeCard />
          </div>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-4 rounded-2xl border border-dark-grey-3 bg-black-300 p-8 md:p-10">
            <h3 className="font-display text-2xl font-medium text-white">
              Compare with data.
            </h3>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-dark-grey-1">
              Every number on this page comes from the same simulation we use
              to build the product, not a highlight reel: every chart plots
              the full data grid, including the regimes where Rate
              doesn&apos;t win. We once caught a pricing bug of our own with
              it, one that was quietly losing money on the safest position,
              before it touched a dollar, and published that too. We do
              research in the open, fair and square.
            </p>

            <span className="mt-8 block font-mono-brand text-[11px] tracking-[0.16em] text-purple-700 dark:text-purple-300 uppercase">
              How the fee is actually computed
            </span>
            <div className="mt-4">
              <CalculatorTabs />
            </div>

            <a
              href="https://github.com/rate-limo/rate-research"
              className="mt-6 inline-block font-mono-brand text-xs font-medium tracking-[0.14em] text-purple-700 dark:text-purple-300 uppercase transition-colors hover:text-purple-600 dark:hover:text-purple-400"
            >
              Try to benchmark us
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
