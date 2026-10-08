import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { InviteView } from "@/components/Onboarding/InviteView";
import { readDisplaySlug } from "@/lib/routing/chainParams";

/**
 * Referral landing — `iter.cx/r/CODE`.
 *
 * The destination of every shared link, so it must work for a signed-out
 * visitor who has never heard of Rate. The code is captured here and applied
 * after they connect; asking someone to connect a wallet before telling them
 * what the link was for is how a referral link becomes a bounce.
 */
/**
 * The card is what makes a shared link worth clicking: X, Telegram and Discord
 * unfurl `/r/CODE` from these tags, and `/api/og/referral` draws the inviter and
 * the code. Per request because the code is in the path; the route itself
 * degrades to "You're invited" when the code resolves to nobody.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = (await params).code.trim().toUpperCase();
  const title = "You've been invited | Rate";
  const description = `Join Rate with invite code ${code}.`;
  const image = `/api/og/referral?code=${encodeURIComponent(code)}`;
  return {
    title,
    description,
    // A per-code page has nothing to offer a search result, and indexing them
    // would put thousands of near-identical pages in the index.
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image, alt: title }] },
  };
}

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
