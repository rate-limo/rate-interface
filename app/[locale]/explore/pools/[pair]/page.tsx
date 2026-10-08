import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";

interface PageProps { params: Promise<{ pair: string }>; searchParams: Promise<{ chain?: string }> }

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { pair } = await params;
  const network = readDisplaySlug("pair", await searchParams);
  const networkName = supportedNetworkName(network);
  const symbol = pair.replace(/_/g, "/").toUpperCase();
  const image = `/api/og/explore?kind=pool&pair=${encodeURIComponent(pair)}&network=${encodeURIComponent(networkName)}`;
  return { title: `${symbol} pool | Rate`, description: `${symbol} liquidity pool on Rate ${networkName}.`, openGraph: { title: `${symbol} pool | Rate`, description: `${symbol} liquidity pool on Rate ${networkName}.`, images: [image] }, twitter: { card: "summary_large_image", images: [image] } };
}

export default async function ExplorePoolItem({ params, searchParams }: PageProps) {
  const { pair } = await params;
  const network = readDisplaySlug("pair", await searchParams);
  const [base, quote] = pair.split("_");
  redirect(`/pair?base=${encodeURIComponent(base ?? "")}&quote=${encodeURIComponent(quote ?? "")}&chain=${encodeURIComponent(network)}`);
}
