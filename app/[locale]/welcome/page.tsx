import type { Metadata } from "next";
import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { WelcomeGate } from "@/components/Onboarding/WelcomeGate";
import { readDisplaySlug } from "@/lib/routing/chainParams";

/**
 * First-run onboarding.
 *
 * `noindex`: a page that only makes sense for a signed-in first-time user has
 * nothing to offer a search result, and indexing it would surface "Welcome,
 * anon" as an entry point for people who then see nothing.
 */
export const metadata: Metadata = {
  title: "Welcome | Rate",
  description: "Getting started on Rate.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export default async function Welcome({ searchParams }: PageProps) {
  const network = readDisplaySlug("welcome", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <WelcomeGate networkSlug={network} />
      </AppShell>
    </MarketPageProvider>
  );
}
