import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExploreDirectoryPage } from "@/components/Pages/Explore/ExploreDirectoryPage";
import { readDisplaySlug, supportedNetworkName, type ExploreSection } from "@/lib/routing/chainParams";

const sections: ExploreSection[] = ["tokens", "launches", "pools", "auctions", "transactions"];

interface PageProps {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ chain?: string }>;
}

function sectionTitle(section: ExploreSection) {
  return section[0]!.toUpperCase() + section.slice(1);
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { section: rawSection } = await params;
  if (!sections.includes(rawSection as ExploreSection)) return {};
  const section = rawSection as ExploreSection;
  const network = readDisplaySlug("explore", await searchParams);
  const networkName = supportedNetworkName(network);
  const title = `${sectionTitle(section)} | Rate Explore`;
  return {
    title,
    description: `Explore ${section} on Rate ${networkName}.`,
    openGraph: {
      title,
      description: `Explore ${section} on Rate ${networkName}.`,
      images: [`/api/og/explore?kind=section&section=${section}&network=${encodeURIComponent(networkName)}`],
    },
    twitter: { card: "summary_large_image", images: [`/api/og/explore?kind=section&section=${section}&network=${encodeURIComponent(networkName)}`] },
  };
}

export default async function ExploreSectionPage({ params, searchParams }: PageProps) {
  const { section: rawSection } = await params;
  if (!sections.includes(rawSection as ExploreSection)) notFound();
  const section = rawSection as ExploreSection;
  const network = readDisplaySlug("explore", await searchParams);
  return <ExploreDirectoryPage section={section} network={network} />;
}
