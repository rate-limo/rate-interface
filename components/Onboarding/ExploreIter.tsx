"use client";

import Link from "next/link";
import { Rocket, Sparkles, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";

/**
 * The three things Iter does that the feed underneath cannot show.
 *
 * ## There is deliberately no card for social trading
 *
 * This sits on Home, which IS the callout feed — a stranger can already watch
 * real people explain real trades by scrolling. A card pointing at what is
 * directly beneath it is noise. That is also why this belongs on Home rather than
 * Explore: on a market table all four would have needed a card, and the one for
 * social would have pointed somewhere the reader could not see.
 *
 * Launch, auctions and band-pool liquidity are invisible from a feed, are the
 * venue's actual differentiators, and are each one tap away.
 */
export function ExploreIter({ className }: { className?: string }) {
  const slug = useOptionalMarketPageContext()?.displayNetworkSlug;

  const items = [
    {
      key: "launch",
      icon: Sparkles,
      title: "Launch a coin",
      blurb: "Fixed supply, no owner — its market opens in the same transaction.",
      href: buildPageUrl("create", { slug }),
      tint: "bg-[#7c5cff]",
    },
    {
      key: "auction",
      icon: Rocket,
      title: "Fund a project by auction",
      blurb: "Raise from buyers before the market opens.",
      href: buildPageUrl("explore", { slug }),
      tint: "bg-[#d55181]",
    },
    {
      key: "lp",
      icon: Waves,
      title: "Earn on liquidity",
      blurb: "Your unfilled order becomes the depth other swaps draw from.",
      href: buildPageUrl("pool", { slug }),
      tint: "bg-[#2ba563]",
    },
  ];

  return (
    <section aria-label="Explore Iter" className={cn("mb-4", className)}>
      <h2 className="mb-2 text-[13px] font-bold text-[color:var(--m-text-primary)]">Explore Iter</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3 transition-colors hover:border-[color:var(--m-primary)]"
            >
              <span className={cn("mb-2 grid h-6 w-6 place-items-center rounded-lg text-white", item.tint)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="block text-[12.5px] font-bold text-[color:var(--m-text-primary)]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-[color:var(--m-text-secondary)]">
                {item.blurb}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
