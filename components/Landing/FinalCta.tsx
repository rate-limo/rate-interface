import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { JoinWaitlistButton } from "@components/Landing/JoinWaitlistButton";

export function FinalCta() {
  return (
    <section id="join" className="py-24 md:py-32">
      <Container>
        <Reveal>
          <div className="flex flex-col items-center rounded-3xl border border-purple-700 bg-gradient-to-b from-purple-100 to-black-300 px-6 py-16 text-center sm:px-16 dark:from-purple-800">
            <span className="font-mono-brand text-xs tracking-[0.16em] text-purple-700 dark:text-purple-300 uppercase">
              Beyond the grid
            </span>
            <h2 className="font-display mt-4 max-w-xl text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl">
              Find your way in.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-dark-grey-1">
              Join the waitlist. Trade the way markets should move.
            </p>
            <div className="mt-10">
              <JoinWaitlistButton />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
