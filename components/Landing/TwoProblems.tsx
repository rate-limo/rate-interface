import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";

const PROBLEMS = [
  {
    title: "Inventory",
    body: "Who holds the assets you trade against, and who eats the loss while prices move?",
  },
  {
    title: "Settlement",
    body: "When you want to trade, how does the venue decide the price you get?",
  },
];

export function TwoProblems() {
  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            Every venue answers two questions. Most answer them out of sight.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} delay={0.06 * i}>
              <div className="border-t border-purple-700 pt-6">
                <h3 className="font-display text-xl font-medium text-purple-700 dark:text-purple-300">
                  {p.title}
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-dark-grey-1">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.12}>
          <p className="mt-16 max-w-2xl text-lg leading-relaxed text-white sm:text-xl">
            Rate answers both{" "}
            <span className="text-purple-400">— in the open.</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
