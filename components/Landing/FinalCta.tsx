import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { EnterAppButton } from "@components/Landing/EnterAppButton";
import { Button } from "@components/Landing/ui/Button";

export function FinalCta() {
  return (
    <section id="join" className="py-24 md:py-32">
      <Container>
        <Reveal>
          <div className="flex flex-col items-center rounded-3xl border border-purple-700 bg-gradient-to-b from-purple-100 to-black-300 px-6 py-16 text-center sm:px-16 dark:from-purple-800">
            <h2 className="font-display max-w-xl text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl">
              Make your money work. Let the traders pay you.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-dark-grey-1">
              And when you do move, move at your rate: every fill on an open
              onchain book, at a price you chose.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <EnterAppButton />
              <Button
                href="https://github.com/rate-limo/rate-research/blob/main/iter-whitepaper.md"
                variant="outline"
              >
                Read the paper
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
