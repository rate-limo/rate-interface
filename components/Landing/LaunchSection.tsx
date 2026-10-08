import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { Button } from "@components/Landing/ui/Button";
import { DEFAULT_CHAIN_SLUG, buildExploreSectionUrl, buildPageUrl } from "@/lib/routing/chainParams";

/**
 * The launchpad, told as the brand line's third act (brand book v1): a launch
 * built for holders, not flippers.
 *
 * Every fact below is a property of the contracts, and the wording is
 * deliberately no stronger than they are:
 *
 * - Coin (AssetGenerator.sol): supply minted once in the constructor, no mint
 *   function, no owner. Listed on the book in the launch transaction.
 * - PresaleLaunch.sol: ONE fixed price per sale, set by the creator. It is not
 *   a price-discovery auction, so never say the auction "finds" a price.
 *   Oversubscribed sales fill pro-rata and refund the rest; a sale under its
 *   minimum refunds everyone in full; each wallet has a cap. At least 20% of
 *   the accepted raise (MIN_LP_BPS) seeds band liquidity that is locked for a
 *   period the sale sets, and the creator's tokens vest on a cliff + schedule.
 *   If anyone lists the coin before the sale graduates, the sale FAILS and
 *   every contributor is refunded.
 *
 * "Locked" has no minimum length in the contract, so the copy never calls a
 * launch rug-proof or safe; it says the lock and the vesting exist, and the
 * sale page shows the dates.
 */
const PATHS = [
  {
    kicker: "Launch now",
    title: "A coin nobody can change.",
    points: [
      "Supply is minted once. No mint function, no owner.",
      "Listed on the order book in the same transaction.",
      "Its logo and details attach by your wallet's signature, not an operator's say-so.",
    ],
  },
  {
    kicker: "Run an auction",
    title: "One price for everyone.",
    points: [
      "Every buyer commits at the rate you set. No curve, no sniping race.",
      "Oversubscribed? Everyone fills pro-rata and gets the rest back. Under the minimum? Full refunds.",
      "At least 20% of the raise becomes locked liquidity, and your own tokens vest.",
    ],
  },
];

export function LaunchSection() {
  const slug = DEFAULT_CHAIN_SLUG;
  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            Launch for holders, not flippers.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Create a token on the same book everyone trades on. In an auction
            the creator holds too: the liquidity stays locked and their tokens
            vest, so the people who believe in it early aren&apos;t the exit.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PATHS.map((path, i) => (
            <Reveal key={path.kicker} delay={0.06 * i}>
              <div className="h-full rounded-2xl border border-dark-grey-3 bg-black-300 p-8">
                <span className="font-mono-brand text-xs tracking-[0.14em] text-[color:var(--m-accent)] uppercase">
                  {path.kicker}
                </span>
                <h3 className="font-display mt-3 text-2xl font-medium text-white">{path.title}</h3>
                <ul className="mt-4 space-y-2.5 text-base leading-relaxed text-dark-grey-1">
                  {path.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span aria-hidden className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-[color:var(--m-accent)]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-dark-grey-1">
            And if anyone lists an auction&apos;s token before it graduates,
            the sale fails and every buyer is refunded in full.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button href={buildPageUrl("create", { slug })}>Launch a token</Button>
            <Button href={`/create/auction?chain=${encodeURIComponent(slug)}`} variant="outline">
              Run an auction
            </Button>
            <Button href={buildExploreSectionUrl("auctions")} variant="outline">
              See live auctions
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
