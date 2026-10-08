"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { networkNameToSlug } from "@/consts";
import { proHref } from "@/lib/markets/pickerRow";
import { cn } from "@/lib/utils";
import type { SpotPair } from "@/types";

/**
 * Copies this market's link.
 *
 * At launchpad scale the pair link IS how most markets are reached: the picker
 * lists favorites, recent, listed and trending markets, and everything else is
 * opened by its link or a pasted address. The link names both tokens by
 * address, so it survives two coins sharing a symbol.
 */
export function CopyMarketLink({
  pair,
  networkName,
  className,
  label = true,
}: {
  pair: Pick<SpotPair, "symbol"> & { base: { id?: string; symbol: string }; quote: { id?: string; symbol: string } };
  networkName: string;
  className?: string;
  label?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const href = proHref(networkNameToSlug[networkName] ?? "", {
    baseSymbol: pair.base.symbol,
    quoteSymbol: pair.quote.symbol,
    baseAddress: pair.base.id,
    quoteAddress: pair.quote.id,
  });

  const copy = async () => {
    const url = `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(`Link to ${pair.symbol} copied`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link", { description: url });
    }
  };

  const Icon = copied ? Check : Link2;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy link to ${pair.symbol}`}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--m-border)] px-2.5 text-[11.5px] font-medium text-[color:var(--m-text-secondary)] transition-colors duration-[120ms] hover:text-[color:var(--m-text-primary)]",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label ? (copied ? "Copied" : "Copy link") : null}
    </button>
  );
}
