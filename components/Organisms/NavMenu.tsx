"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import {
  buildPageUrl,
  pageKindFromPathname,
  type PageKind,
} from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";

/**
 * Primary nav, per the approved Explore design (spec in apps/web/CLAUDE.md):
 * five page links — Explore · Swap · Trade · Pool · Portfolio — uppercase
 * mono, active = bold full-color. The old "More" dropdown is gone: /account
 * and /referrals never existed as pages, and its external links pointed at
 * pre-rebrand URLs.
 *
 * Active state derives from the pathname (page-first URLs), so pages don't
 * need to pass anything; the legacy `activeTab` prop is accepted and ignored
 * to keep existing call sites compiling until they're cleaned up.
 */

const LINKS: { kind: PageKind; label: string }[] = [
  { kind: "explore", label: "Explore" },
  { kind: "swap", label: "Swap" },
  { kind: "trade", label: "Trade" },
  { kind: "pool", label: "Pool" },
  { kind: "portfolio", label: "Portfolio" },
  { kind: "iter", label: "Iter" },
];

// Profile pages highlight their parent family: /token/[token] lives under
// Explore (the token profile is reached from it).
function activeKind(pathname: string): PageKind | null {
  const kind = pageKindFromPathname(pathname);
  if (kind === "token") return "explore";
  return kind;
}

export function NavMenu({ activeTab: _activeTab }: { activeTab?: string }) {
  const pathname = usePathname();
  const { displayNetworkSlug } = useMarketPageContext();
  const active = activeKind(pathname ?? "");

  return (
    <nav aria-label="Primary" className="flex h-full items-center gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.kind}
          href={buildPageUrl(l.kind, { slug: displayNetworkSlug })}
          aria-current={active === l.kind ? "page" : undefined}
          className={cn(
            "px-3 py-2 font-dm-mono text-[12px] tracking-[0.14em] uppercase transition-colors",
            active === l.kind
              ? "font-bold text-[color:var(--m-text-primary)]"
              : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
