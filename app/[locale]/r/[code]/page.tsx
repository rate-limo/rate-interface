import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { InviteView } from "@/components/Onboarding/InviteView";
import { readDisplaySlug } from "@/lib/routing/chainParams";

/**
 * Referral landing — `iter.cx/r/CODE`.
 *
 * The destination of every shared link, so it must work for a signed-out
 * visitor who has never heard of Iter. The code is captured here and applied
 * after they connect; asking someone to connect a wallet before telling them
 * what the link was for is how a referral link becomes a bounce.
 */
export const metadata: Metadata = {
  title: "You've been invited | Iter",
  description: "Join Iter with a referral code.",
  // A per-code page has nothing to offer a search result, and indexing them
  // would put thousands of near-identical pages in the index.
  robots: { index: false, follow: true },
};

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ chain?: string }>;
}

export default async function ReferralLanding({ params, searchParams }: PageProps) {
  const { code } = await params;
  const network = readDisplaySlug("explore", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <InviteView code={code.toUpperCase()} networkSlug={network} />
      </AppShell>
    </MarketPageProvider>
  );
}
