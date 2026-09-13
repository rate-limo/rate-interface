import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";

interface PageProps { params: Promise<{ id: string }>; searchParams: Promise<{ chain?: string }> }

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const network = readDisplaySlug("create", await searchParams);
  const networkName = supportedNetworkName(network);
  const image = `/api/og/explore?kind=auction&id=${encodeURIComponent(id)}&network=${encodeURIComponent(networkName)}`;
  return { title: `Auction ${id} | Iter`, description: `Presale auction ${id} on Iter ${networkName}.`, openGraph: { title: `Auction ${id} | Iter`, description: `Presale auction ${id} on Iter ${networkName}.`, images: [image] }, twitter: { card: "summary_large_image", images: [image] } };
}

export default async function ExploreAuctionItem({ params, searchParams }: PageProps) {
  const { id } = await params;
  const network = readDisplaySlug("create", await searchParams);
  redirect(`/create/auction/${encodeURIComponent(id)}?chain=${encodeURIComponent(network)}`);
}
