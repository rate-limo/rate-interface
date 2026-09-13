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
import { SpotToken } from "@/types"

export function BreadcrumbNav({ token, networkName }: { token: SpotToken, networkName: string }) {
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
            <Link href={buildExploreSectionUrl("tokens")}>Tokens</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {/*
          The network is a LABEL here, not a link, and that is a correction.

          It used to be `/explore/tokens?chain=<slug>`, which reads as "show me
          this chain's tokens" and does nothing at all: Explore is a cross-chain
          surface, `SCHEME.explore` is "none", and `readDisplaySlug` therefore
          returns DEFAULT_CHAIN_SLUG whatever the URL says. So the crumb landed
          on the same page as the one before it — the exact "control that appears
          to work and changes nothing" that scheme's own docstring warns about.

          There is no URL that filters Explore to one chain (the scope control is
          client state), so the honest options were to drop the crumb or stop
          pretending it navigates. It is kept because it still tells a reader
          which network this token is on, which is worth saying.
        */}
        <BreadcrumbItem>
          <span>{networkName}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="text-[color:var(--m-text-primary)]">
          <BreadcrumbPage>{token.symbol}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
