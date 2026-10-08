"use client";

import { useState } from "react";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";

/**
 * A chain's mark at display size, for the landing's chain list.
 *
 * Same source and fallback as `ChainBadge`: the operator's upload, else the
 * two-letter initials. It exists because `ChainBadge` is a corner badge that
 * positions itself over a token icon — it has no standalone form.
 */
export function ChainMark({ chainName }: { chainName: string }) {
  const { data: brands } = useChainBrand();
  const resolved = chainIconFrom(brands, chainName);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(resolved) && failedUrl !== resolved;
  const initials = chainName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[30%] bg-[var(--m-primary)] font-dm-mono text-sm font-bold text-white">
      {showImage ? (
        <img src={resolved} alt="" className="h-full w-full object-cover" onError={() => setFailedUrl(resolved ?? null)} />
      ) : (
        initials
      )}
    </span>
  );
}
