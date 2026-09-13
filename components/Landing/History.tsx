import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";

const BEATS = [
  {
    lead: "One curve answered both.",
    body: "Uniswap let anyone provide liquidity, a breakthrough worth keeping. But a curve quotes every price the market walks it to, not a price you set, and bots sat in that gap on every trade and took people's money. The people who put up the liquidity got exactly one option: pull out.",
  },
  {
    lead: "Better curves are still curves.",
    body: "v3 concentrated the same curve and amplified the same loss. Curve flattened it and validated UST all the way down. Both still quote off pool state instead of a price you choose, so the bots kept taking that money too.",
  },
  {
    lead: "Order books solved settlement, then brought the operator back.",
    body: "Your limit price is your tolerance now, so a bot can't move the price on you at settlement. But on every book so far, inventory stayed with a handful of permissioned market makers, and that centralization is exactly the opening bots are waiting for.",
  },
];

export function History() {
  return (
    <section className="bg-black-300 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            Every step solved one question and reopened the other.
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-12 md:gap-14">
          {BEATS.map((beat, i) => (
            <Reveal key={beat.lead} delay={0.05 * i}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-8">
                <h3 className="font-display text-xl font-medium text-white md:col-span-5 md:text-2xl">
                  {beat.lead}
                </h3>
                <p className="text-base leading-relaxed text-dark-grey-1 md:col-span-7">
                  {beat.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mt-16 max-w-2xl text-lg leading-relaxed text-purple-400 sm:text-xl">
            The way forward keeps both open.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
