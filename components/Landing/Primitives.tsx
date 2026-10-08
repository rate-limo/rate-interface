import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";

const USES = [
  {
    title: "Lending",
    body: "A lending market's liquidations are only as safe as the price that triggers them. A flash loan can move a single block's price; it can't move a ten-minute average.",
  },
  {
    title: "Futures",
    body: "A perpetual's mark price can read straight from this same book instead of a separate oracle, so the price that liquidates you is one a flash loan can't move.",
  },
  {
    title: "Options",
    body: "An option settles against whatever price is quoted at expiry. That price should survive someone trying to move it in the last block — this one does.",
  },
  {
    title: "Stablecoins",
    body: "A peg holds only as long as the price watching it can't be cheaply lied to. Read from a book that's already built to resist that.",
  },
];

export function Primitives() {
  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            A price that survives someone trying to move it.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Every trade here settles at a price averaged over real trading,
            not whatever happened in the last block. That price is a
            primitive other products can build on, not just a number shown to
            traders.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {USES.map((use, i) => (
            <Reveal key={use.title} delay={0.05 * i}>
              <div className="h-full rounded-2xl border border-dark-grey-3 bg-black-300 p-8">
                <h3 className="font-display text-xl font-medium text-white">
                  {use.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-dark-grey-1">
                  {use.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mt-10 max-w-2xl text-lg leading-relaxed text-white sm:text-xl">
            Every product above needs the same thing:{" "}
            <span className="text-purple-400">
              a price nobody can cheaply move.
            </span>{" "}
            This book already is one.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
