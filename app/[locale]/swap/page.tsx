import { redirect } from "next/navigation";
import { DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";

/**
 * `/swap` is gone — the convert card is Trade's Basic gear at `/trade`.
 *
 * Kept as a redirect rather than deleted because the URL is out in the wild:
 * shared links, the Action Dock's phase-1 CTAs, and anything that bookmarked it.
 *
 * Old swap links carried the chain as `?fromchain=` (it was the only page on the
 * from-to scheme, with `?tochain=` intentionally inert). Trade uses `?chain=`,
 * so both spellings are accepted here and normalised on the way through.
 */

interface PageProps {
  searchParams: Promise<{ chain?: string; fromchain?: string; tochain?: string }>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SwapRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const slug = first(sp.chain) ?? first(sp.fromchain) ?? DEFAULT_CHAIN_SLUG;
  redirect(`/trade?chain=${slug}`);
}
