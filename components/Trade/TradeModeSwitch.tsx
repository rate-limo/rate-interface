"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { tradeGearFromPathname } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";

/**
 * The Basic ↔ Pro gear switch for the merged Trade surface.
 *
 * Basic (`/trade`) is the convert card: tokens in, tokens out, routed across
 * whatever books it needs. Pro (`/trade/pro`) is the order book for one market.
 * The spec's rule is "same surface, never a separate app" (apps/web/CLAUDE.md),
 * so this control keeps the same position in both gears — it reads as a gear
 * change rather than a navigation.
 *
 * ## Why the pair only travels one way
 *
 * Basic isn't pair-bound, so there is nothing to hand Pro on the way in beyond
 * whatever market Pro is already on — a multi-hop swap has no single pair to
 * name. Going the other way, Pro's `base`/`quote` are simply dropped, because
 * Basic ignores them. Each gear keeps its own state; this only moves between
 * them, preserving the chain.
 *
 * Rendered through AppShell's `headerContent`, i.e. the left slot of the top
 * bar that opened up when search moved to the right.
 */
export function TradeModeSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const gear = tradeGearFromPathname(pathname ?? "") ?? "basic";

  const chain = params.get("chain");
  const base = params.get("base");
  const quote = params.get("quote");

  const basicHref = `/trade${chain ? `?chain=${chain}` : ""}`;

  // Carry the market into Pro when we already have one, so switching gears on a
  // deep-linked pair doesn't silently reset it.
  const proParams = new URLSearchParams();
  if (chain) proParams.set("chain", chain);
  if (base) proParams.set("base", base);
  if (quote) proParams.set("quote", quote);
  const proQuery = proParams.toString();
  const proHref = `/trade/pro${proQuery ? `?${proQuery}` : ""}`;

  const tab =
    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors";
  // Use the solid primary fill for the selected gear. The selected-surface ramp
  // is too close to the switch chrome in dark mode; the primary/on-primary pair
  // matches the stronger active controls used throughout the shell.
  const on = "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] shadow-[0_2px_10px_color-mix(in_srgb,var(--m-primary)_30%,transparent)]";
  const off =
    "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-0.5",
        className,
      )}
    >
      <Link
        href={basicHref}
        aria-current={gear === "basic" ? "page" : undefined}
        className={cn(tab, gear === "basic" ? on : off)}
      >
        Basic
      </Link>
      <Link
        href={proHref}
        aria-current={gear === "pro" ? "page" : undefined}
        className={cn(tab, gear === "pro" ? on : off)}
      >
        Pro
      </Link>
    </div>
  );
}
