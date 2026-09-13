import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { LogoMarkV2 } from "@components/Atoms/LogoMarkV2";

export function CoreIdeas() {
  return (
    <section className="py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            One book. Both problems solved.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Settlement, by limit orders. Inventory, by the pool. Together, a
            real market.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className="md:col-span-2">
            <div className="relative overflow-hidden rounded-2xl border border-purple-700 bg-gradient-to-br from-purple-100 via-black-300 to-black-300 p-8 md:p-10 dark:from-purple-800">
              <LogoMarkV2
                size={220}
                className="pointer-events-none absolute -right-10 -bottom-10 opacity-[0.12]"
              />
              <h3 className="font-display text-2xl font-medium text-white">
                Settlement: solved by limit orders
              </h3>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-dark-grey-1">
                Every trade is a limit order on one on-chain book: you name
                your price, the book matches you with the best one available.
                The price comes from people actually trading, not from a
                formula, and nothing fills at a price you didn&apos;t set.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="h-full rounded-2xl border border-dark-grey-3 bg-black-300 p-8">
              <h3 className="font-display text-2xl font-medium text-white">
                Inventory: solved by the pool
              </h3>
              <p className="mt-3 text-base leading-relaxed text-dark-grey-1">
                Anyone can deposit into the pool. Deposits fill the other side
                of trades, only inside the price range each depositor chose,
                and earn a fee every time. The assets come from everyone, not
                from a market-making firm.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="h-full rounded-2xl border border-dark-grey-3 bg-black-300 p-8">
              <h3 className="font-display text-2xl font-medium text-white">
                Together: an organic market
              </h3>
              <p className="mt-3 text-base leading-relaxed text-dark-grey-1">
                Orders and pool deposits meet on the same book, so prices come
                from real trades, averaged over ten minutes so nobody can rig a
                moment. Real prices, real liquidity, no middleman.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
