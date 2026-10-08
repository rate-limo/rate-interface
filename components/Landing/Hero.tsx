import { Container } from "@components/Landing/ui/Container";
import { Button } from "@components/Landing/ui/Button";
import { EnterAppButton } from "@components/Landing/EnterAppButton";
import { HeroBackdrop } from "@components/Landing/HeroBackdrop";
import { StatStrip } from "@components/Landing/StatStrip";
import { SwapCard } from "@components/Swap/SwapCard";
import { DEFAULT_CHAIN_SLUG, buildPageUrl } from "@/lib/routing/chainParams";
import { defaultConnectedChain, networkNameToSlug, supportedChains } from "@/consts";
import { getSwapTokens } from "@/lib/swap/tokens";

/**
 * The chain the hero's preview quotes on: the default chain when the bundled
 * token list can make a pair there, else the first served chain that can.
 *
 * Arc, the default, has no entries in @iter/token-list, so `defaultSwapPair`
 * fell back to the hub on BOTH sides and the front page demonstrated a
 * USDC -> USDC swap (seen in production 2026-10-04).
 */
const HERO_CHAIN =
  [defaultConnectedChain, ...supportedChains].find((name) => getSwapTokens(name).length >= 2) ??
  defaultConnectedChain;
const HERO_SLUG = networkNameToSlug[HERO_CHAIN] ?? DEFAULT_CHAIN_SLUG;

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
 * comes first and "Enter Rate" sits under the thing it is asking you to want.
 * Putting the buttons above would make the visitor decide before seeing the
 * evidence.
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
      {/* The music video's solarpunk village (2026-10-04). `art="ladder"`
          brings back the order-ladder graphic it replaced. */}
      <HeroBackdrop variant="centered" art="film" />

      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
          {/* The brand line (brand book v1, 2026-10-01): "Don't trade." then,
              in the accent, "Let the market come to you." (changed from "Until you
              find your best rate." on 2026-10-04, at the user's direction). Two beats that
              are never separated on the same surface — beat one alone is a
              provocation, the second is what makes it a promise.

              The beats are two SIZES, not one headline broken in two: beat one
              is 12 characters and carries the display size; beat two is 27,
              past the ~16 a centred headline line can hold before it reads as
              a paragraph (see the note above), so it drops a step. The accent
              is --m-accent, the one orange, reserved for the mark and this.

              The subline says what the line means in product terms, and every
              clause in it is literal: a one-token deposit swaps nothing, and
              the taker fee goes to the band's LPs. See the brand book's claims
              rules before changing it — "no impermanent loss" and any promised
              return are out. */}
          {/* Light mode only: the same subtractive halo the card sits on, so the
              peach ladder bars of the backdrop stop running through the words.
              Dark needs none; its bars are dim against #0D0F12. */}
          <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-16 -inset-y-10 bg-[radial-gradient(52%_56%_at_50%_50%,color-mix(in_srgb,var(--m-background)_45%,transparent)_0%,color-mix(in_srgb,var(--m-background)_18%,transparent)_55%,transparent_80%)] dark:hidden"
          />
          <h1 className="font-display relative text-balance text-white">
            <span className="block text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[3.5rem] md:text-[4rem]">
              Don&apos;t trade.
            </span>
            <span className="mt-2 block text-[1.375rem] leading-[1.15] font-medium tracking-tight text-[color:var(--m-accent-text)] sm:text-[1.625rem] md:text-[1.75rem]">
              Let the market come to you.
            </span>
          </h1>
          <p className="relative mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--m-text-primary)] dark:text-dark-grey-1">
            The rich don&apos;t trade. They make their money work. Bring the token you already
            own, set the rate you&apos;d sell at, and traders pay you the fee.
          </p>
          </div>

          {/* Light has NO halo behind the card. It had a subtractive one from the
              Monet era, when the canvas was bright and busy; over the film's clear
              day sky it only added a white ring around an already opaque card and
              stacked with the backdrop scrim into a glare (removed 2026-10-04).

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
                networkName={HERO_CHAIN}
                networkSlug={HERO_SLUG}
              />
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            {/* The LP path leads: it is the half of the line that pays. It
                opens the deposit flow, whose default is one token, converted
                gradually — nothing swapped, no fee. */}
            <Button href={buildPageUrl("pool", { slug: DEFAULT_CHAIN_SLUG, provide: true })}>
              Get paid to hold
            </Button>
            <EnterAppButton variant="outline" />
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
