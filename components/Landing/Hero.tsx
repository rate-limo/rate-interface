import { Container } from "@components/Landing/ui/Container";
import { Button } from "@components/Landing/ui/Button";
import { JoinWaitlistButton } from "@components/Landing/JoinWaitlistButton";
import { HeroBackdrop } from "@components/Landing/HeroBackdrop";
import { StatStrip } from "@components/Landing/StatStrip";
import { SwapCard } from "@components/Swap/SwapCard";
import { DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { defaultConnectedChain } from "@/consts";

/**
 * One centred column: headline, sub, the card, the CTAs, the stat strip.
 *
 * ## Why this replaced the two-column version
 *
 * Not the app-style layout for its own sake. The two-column hero rendered the
 * card only from 1200px up (`hidden min-[1200px]:block`), because 360px of card
 * beside a headline needs width that is not there below it — which meant every
 * phone visitor saw a headline and two buttons, and none of the work that makes
 * the card operable reached them. A centred column is ONE layout at every
 * width: the card just narrows.
 *
 * The cost is the headline. It was 72px in a full-width column and 60px beside
 * the card; centred it tops out around 46px, because a centred line longer than
 * roughly 16 characters per line stops scanning as a headline and starts
 * reading as a paragraph. The copy itself is unchanged.
 *
 * ## Order is deliberate: card ABOVE the CTAs
 *
 * The card is the argument and the CTAs are what you do about it, so the card
 * comes first and "Join the waitlist" sits under the thing it is asking you to
 * want. Putting the buttons above would make the visitor decide before seeing
 * the evidence.
 *
 * ## The card is the compact preview
 *
 * `variant="preview"` on the real SwapCard — operable (slider, both pickers,
 * flip, the three-way remainder toggle), but it links to /trade rather than
 * running the mocked transaction flow. Preview also drops the route bar, the
 * warning box and three meta rows, which is what keeps the remainder toggle
 * above the fold on a 900px viewport. See the `variant` note in SwapCard.
 *
 * No MarketPageProvider here, so the chain is the default rather than the URL's
 * — the landing page is not chain-scoped and never has been.
 */
export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-[88dvh] items-center overflow-hidden pt-14 pb-20 md:pt-16 md:pb-24"
    >
      {/* Radial rather than the default left-to-right scrim: that gradient was
          built to hold an opaque left edge under left-aligned copy, and centred
          content sits over the brightest part of the canvas instead. */}
      <HeroBackdrop variant="centered" art="colonnade" />

      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
          {/* An imperative, not a slogan. "The way on-chain. / One order book.
              Every fill, a price you chose." described the product but never
              asked for anything, so the first thing a visitor read was a claim
              rather than an invitation. The verb leads now and the accent
              carries the differentiator — an order book that settles on chain,
              which is what separates this from an AMM.

              The break falls on the comma, so the two tonal halves are also two
              clauses. See the note above on why a centred headline cannot run
              much past ~16 characters a line before it reads as a paragraph. */}
          <h1 className="font-display text-[2.25rem] leading-[1.06] font-medium tracking-tight text-balance text-white sm:text-[2.75rem] md:text-[2.875rem]">
            Trade on an order book,
            <br />
            <span className="text-purple-400">fully on-chain.</span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--m-text-primary)] dark:text-dark-grey-1">
            Every fill, a price you chose. Iter routes, matches and settles in
            the open — self-custody the whole way.
          </p>

          {/* The halo behind the card is SUBTRACTIVE in light and ADDITIVE in dark,
              and it has to be, because the two themes give it opposite jobs.

              Light: the Monet is bright and busy, so the card needs paint taken
              AWAY from under it — a radial of --m-background erases the canvas and
              the resulting clean patch is what separates the card.

              Dark: the same gradient is black on black. --m-background is #0D0F12,
              the section is already #0D0F12, and Whistler's nocturne under it is a
              dark canvas held at opacity-55 beneath a near-opaque scrim. Erasing
              nothing from nothing renders exactly nothing — which is why dark mode
              read as a flat void with the card floating unexplained in it. So dark
              gets LIGHT ADDED instead: a low-alpha --m-primary glow that falls off
              to transparent, so the card sits in the one luminous part of the
              section rather than in an unmarked patch of the same black.

              Split with the same `dark:` class the backdrop uses, so the correct
              one is chosen at first paint with no flash. */}
          <div className="relative mt-8 w-full max-w-[452px]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-12 -inset-y-8 bg-[radial-gradient(60%_54%_at_50%_46%,var(--m-background)_0%,color-mix(in_srgb,var(--m-background)_55%,transparent)_48%,transparent_78%)] dark:hidden"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-20 -inset-y-14 hidden bg-[radial-gradient(58%_54%_at_50%_46%,color-mix(in_srgb,var(--m-primary)_16%,transparent)_0%,color-mix(in_srgb,var(--m-primary)_7%,transparent)_44%,transparent_76%)] dark:block"
            />
            {/* Elevation in dark comes from HERE, not from SwapCard's own shadow —
                that one is rgba(20,40,60,…), a blue-black tuned for a light page,
                and it is invisible against #0D0F12. A hairline rim gives the card
                an edge, and the blue cast underneath reads as lift rather than as
                a shadow nobody can see. Kept on the hero wrapper rather than the
                card so the in-app SwapCard is untouched. */}
            <div className="relative dark:rounded-[20px] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_28px_70px_-34px_color-mix(in_srgb,var(--m-primary)_55%,transparent)]">
              <SwapCard
                variant="preview"
                networkName={defaultConnectedChain}
                networkSlug={DEFAULT_CHAIN_SLUG}
              />
              <p className="mt-3 text-center font-mono text-[10.5px] tracking-[0.06em] text-white/45 uppercase">
                Live quote · illustrative depth · settles in the app
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <JoinWaitlistButton />
            <Button
              href="https://github.com/iter-cx/iter-research/blob/main/iter-whitepaper.md"
              variant="outline"
            >
              Read the paper
            </Button>
          </div>

          {/* Left-aligned inside the centred column: the strip's slots carry
              their own dividers and a right-pinned chain pill, so centring the
              text would fight both. */}
          <div className="w-full text-left">
            <StatStrip />
          </div>
        </div>
      </Container>
    </section>
  );
}
