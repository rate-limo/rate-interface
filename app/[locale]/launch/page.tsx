import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { LaunchGrid } from "@/components/Launch/LaunchGrid";
import { readGraduationThreshold } from "@/lib/liquidity/threshold";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { Metadata } from "next";

/**
 * Launch — discovery, not creation.
 *
 * This route used to BE the creation flow, which left the app with no surface
 * for seeing what other people launched and one word meaning two things.
 * Creating moved to `/create`, reached from the shell's + Create button; the
 * Rocket nav slot still points here, because browsing is the thing people do
 * far more often than deploying.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("launch", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `Launches | Rate ${networkName}`,
    description: `Every token launched on ${networkName} — market caps, momentum, and how far each one is from listing.`,
  };
}

export default async function Launch({ searchParams }: PageProps) {
  const network = readDisplaySlug("launch", await searchParams);
  const thresholdUsd = await readGraduationThreshold();

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-9">
          <LaunchGrid thresholdUsd={thresholdUsd} />
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
