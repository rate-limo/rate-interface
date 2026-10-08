import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { buildExploreSectionUrl, buildPageUrl } from "@/lib/routing/chainParams"
import type { ExploreSection } from "@/lib/routing/chainParams"

/**
 * The trail every market-ish profile sits under: Explore › <section> ›
 * <network> › <this thing>.
 *
 * It took a `SpotToken` and read exactly one field off it — `token.symbol` —
 * which was enough to keep the PAIR profile from using it at all. `/pair`
 * therefore hand-rolled a lookalike: a `<p>` of `<span>`s with a literal `/`
 * separator and two levels instead of four, so the one page that shares this
 * page's job had no `<nav>`, no `<ol>`, no `aria-current`, and was invisible as
 * a breadcrumb to crawlers and screen readers.
 *
 * So it takes a LABEL and a section. `"pools"` is the pair page's section
 * because that is what the Explore tab is called, `ExploreSection` already
 * carries it, and `/explore/pools/[pair]` redirects to `/pair` — the trail
 * describes a hierarchy that exists.
 */
export function BreadcrumbNav({
  label,
  networkName,
  section = "tokens",
  sectionLabel = "Tokens",
}: {
  label: string
  networkName: string
  section?: ExploreSection
  sectionLabel?: string
}) {
  return (
    <Breadcrumb className="mb-6 text-[color:var(--m-text-secondary)]">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild className="transition-colors hover:text-[color:var(--m-text-primary)]">
            {/*
              EXPLORE, not Home.

              The crumb below it is `/explore/tokens`, so the parent of this
              trail is the directory, not the app's front page — a first crumb
              reading "Home" described a hierarchy that does not exist. It
              pointed at `/` for a while too, which is the marketing landing
              page, so from inside the app it led out of the app entirely.
            */}
            <Link href={buildPageUrl("explore")}>Explore</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild className="transition-colors hover:text-[color:var(--m-text-primary)]">
            {/* Through the builder, like every other route in this trail. */}
            <Link href={buildExploreSectionUrl(section)}>{sectionLabel}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {/*
          The network NAVIGATES again, to a scope that now exists.

          It was a link to `/explore/tokens?chain=<slug>` once, and that was
          removed for good reason: Explore is cross-chain, `SCHEME.explore` is
          "none", and `readDisplaySlug` returns DEFAULT_CHAIN_SLUG whatever the
          URL says — so the crumb landed on the page before it and changed
          nothing. It was demoted to a label because, in that comment's words,
          "there is no URL that filters Explore to one chain (the scope control
          is client state)".

          There is one now. `MarketPageProvider` reads `?chains=` into
          `chainFilter` on mount, which is the same value the scope control
          writes and the aggregator already takes, so this crumb lands on
          Explore actually narrowed to this token's network.

          Note `chains` (plural, a network NAME), not the dead `chain` (slug):
          the two differ by a letter and only one of them does anything.
        */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild className="transition-colors hover:text-[color:var(--m-text-primary)]">
            <Link href={buildExploreSectionUrl(section, { chains: networkName })}>{networkName}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="text-[color:var(--m-text-primary)]">
          <BreadcrumbPage>{label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
