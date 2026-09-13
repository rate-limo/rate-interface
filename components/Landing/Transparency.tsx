import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";

const LINKS = [
  {
    label: "Whitepaper",
    href: "https://github.com/iter-cx/iter-research/blob/main/iter-whitepaper.md",
  },
  {
    label: "Simulation",
    href: "https://github.com/iter-cx/iter-research/tree/main/experiments",
  },
  {
    label: "Contracts",
    href: "https://github.com/iter-cx/iter-contracts",
  },
];

export function Transparency() {
  return (
    <section className="bg-black-300 py-24 md:py-32">
      <Container className="flex flex-col items-center text-center">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            Nothing to trust.{" "}
            <span className="text-purple-400">Everything to verify.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Settlement is verifiable on-chain. The paper, the simulation, and
            the contracts are public. No token, no pitch: an argument to steal
            from, not a product to buy.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-full border border-dark-grey-2 px-6 py-3 font-mono-brand text-xs font-medium tracking-[0.14em] text-white uppercase transition-colors hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                {link.label}
              </a>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
