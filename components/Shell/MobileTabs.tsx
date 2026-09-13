"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Activity, ArrowLeftRight, Compass, Droplets, Rocket, Wallet } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl, pageKindFromPathname, type PageKind } from "@/lib/routing/chainParams";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The mobile primary nav — a floating pill bar, the counterpart to AppSidebar.
 *
 * Promoted out of components/Iter/ on 2026-07-29: it was wired into /iter alone,
 * so every other page had no mobile navigation whatsoever. AppShell renders it
 * now, which means all ten app pages get it.
 *
 * Six destinations, the same six the sidebar shows and in the same order. Swap
 * folded into Trade, which is what freed the slot for Pool — and Pool sits in the
 * centre per user direction, the easiest reach for a thumb.
 *
 * Launch (2026-08-01) is the sixth, which takes each tab from a fifth of the bar
 * to a sixth — roughly 58px on a 375px screen. The 9px labels already truncate,
 * so the icon carries recognition at that width; if a seventh is ever proposed,
 * this bar needs a different pattern rather than another column.
 *
 * It is `fixed`, so it floats over content. **AppShell owns the bottom clearance**
 * that keeps page content from ending underneath it; don't add per-page padding
 * for it or the two will stack.
 */
// Labels come from `t(kind)`, same source as AppSidebar — the two lists must
// show the same words, and duplicating the copy is how they stop doing that.
/**
 * The subset of PageKind that appears in the nav.
 *
 * Not `PageKind`: that also includes swap, pair, pass, rewards and price, which
 * have no nav entry and therefore no `shell.nav.*` message. Typing the arrays
 * as the full union made `t(kind)` unprovable — the typed message catalogue is
 * what surfaced it.
 */
type NavKind = Extract<
  PageKind,
  "home" | "explore" | "trade" | "pool" | "launch" | "portfolio" | "iter"
>;

const tabs: { kind: NavKind; icon: typeof Compass }[] = [
  { kind: "home", icon: House },
  { kind: "explore", icon: Compass },
  { kind: "trade", icon: ArrowLeftRight },
  { kind: "pool", icon: Droplets },
  { kind: "launch", icon: Rocket },
  { kind: "portfolio", icon: Wallet },
  { kind: "iter", icon: Activity },
];

export function MobileTabs() {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();
  const { displayNetworkSlug } = useMarketPageContext();
  const active = pageKindFromPathname(pathname ?? "");

  return (
    <nav
      aria-label={t("mobilePrimaryLabel")}
      className="fixed right-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] left-2.5 z-50 grid grid-cols-6 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 p-1.5 shadow-2xl backdrop-blur-xl min-[1200px]:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.kind;
        return (
          <Link
            key={tab.kind}
            href={buildPageUrl(tab.kind, { slug: displayNetworkSlug })}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-semibold transition-colors",
              isActive
                ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] shadow-[0_2px_10px_color-mix(in_srgb,var(--m-primary)_30%,transparent)]"
                : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="max-w-full truncate">{t(tab.kind)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
