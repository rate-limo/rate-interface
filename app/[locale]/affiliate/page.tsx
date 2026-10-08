import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { AppToaster } from "@/components/Shell/AppToaster";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { AffiliateView } from "@/components/Affiliates/AffiliateView";
import { readDisplaySlug } from "@/lib/routing/chainParams";
import { REFERRAL_SHARE_PCT } from "@/lib/affiliates/terms";

const DESCRIPTION = `Apply for your own Rate link and earn ${REFERRAL_SHARE_PCT}% of the order-book fees your audience pays, as points.`;

export const metadata: Metadata = {
  title: "Affiliate | Rate",
  description: DESCRIPTION,
  openGraph: {
    siteName: "Rate",
    title: "Affiliate | Rate",
    description: DESCRIPTION,
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Rate" }],
  },
  twitter: { card: "summary_large_image", images: ["/api/og"] },
};

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

/**
 * The creator onboarding page — `iter.cx/affiliate`. Its one ask is to apply
 * for a link: `/r/YOURNAME`, assigned to the applicant's wallet by an operator.
 *
 * Reachable signed out: it is where a creator decides whether to apply, and
 * asking for a wallet before explaining the offer is how that visit ends. The
 * wallet only matters for the "your link" step, which says so when there is none.
 */
export default async function AffiliatePage({ searchParams }: PageProps) {
  const network = readDisplaySlug("explore", await searchParams);
  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <AppToaster />
        <AffiliateView />
      </AppShell>
    </MarketPageProvider>
  );
}
