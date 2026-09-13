import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";

interface PageProps { params: Promise<{ token: string }>; searchParams: Promise<{ chain?: string }> }

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const network = readDisplaySlug("token", await searchParams);
  const networkName = supportedNetworkName(network);
  const image = `/api/og/explore?kind=token&token=${encodeURIComponent(token)}&network=${encodeURIComponent(networkName)}`;
  return { title: `${token} | Iter Explore`, description: `${token} on Iter ${networkName}.`, openGraph: { title: `${token} | Iter Explore`, description: `${token} on Iter ${networkName}.`, images: [image] }, twitter: { card: "summary_large_image", images: [image] } };
}

export default async function ExploreTokenItem({ params, searchParams }: PageProps) {
  const { token } = await params;
  const network = readDisplaySlug("token", await searchParams);
  redirect(`/token/${encodeURIComponent(token)}?chain=${encodeURIComponent(network)}`);
}
