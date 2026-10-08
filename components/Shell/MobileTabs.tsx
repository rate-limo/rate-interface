"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { House, ArrowLeftRight, Compass, Rocket, Wallet } from "lucide-react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl, pageKindFromPathname, tradeGearFromPathname, type PageKind } from "@/lib/routing/chainParams";
import { useTranslations } from "next-intl";
import { SlideGroup, SlidingIndicator } from "@/components/ui/sliding-indicator";
import { cn } from "@/lib/utils";

/**
 * The mobile primary nav — a floating pill bar, the counterpart to AppSidebar.
 *
 * FIVE destinations, one row (decided 2026-10-03, option A of the mobile tab
 * bar proposal). It was seven in a `grid-cols-6`, so the seventh (Rate) wrapped
 * to a second row and the bar grew to 126px — 15–17% of a phone screen, the
 * second row holding one icon. This file's own note had warned that a seventh
 * needed a different pattern rather than another column; it got the column.
 *
 * Pool and Rate live in the header's ☰ More sheet (MobileHeader's MENU_LINKS),
 * beside Rewards, OG Pass and Tokens; Pool is also Explore's Pools tab. A sixth
 * tab here squeezes every tab to ~54px at 360px wide — add it to the sheet instead.
 *
 * - The active highlight GLIDES between tabs (the shared SlidingIndicator, same
 *   motion as the Pro terminal's tabs) instead of snapping.
 * - It slides out of the way while you scroll down and returns on any scroll up
 *   or at the top. Reading a long list should not cost a 64px strip of it.
 * - On `/trade/pro` it stays, and the terminal's Buy / Sell bar sits directly
 *   ON TOP of it as one bottom unit (decided 2026-10-03). It briefly did not
 *   render there, which uncovered Buy / Sell (this bar, z-50, had covered them
 *   completely) but left Home, Launch and Portfolio unreachable from the
 *   terminal. Its height is TAB_BAR_HEIGHT below; the terminal positions its bar
 *   from that, so change both together.
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
 * have no nav entry and therefore no `shell.nav.*` message.
 */
type NavKind = Extract<PageKind, "home" | "explore" | "trade" | "launch" | "portfolio">;

const tabs: { kind: NavKind; icon: typeof Compass }[] = [
  { kind: "home", icon: House },
  { kind: "explore", icon: Compass },
  { kind: "trade", icon: ArrowLeftRight },
  { kind: "launch", icon: Rocket },
  { kind: "portfolio", icon: Wallet },
];

/** The bar's height, inset included: the Pro terminal stacks its Buy / Sell bar on it. */
export const TAB_BAR_CLEARANCE = "calc(max(10px, env(safe-area-inset-bottom)) + 74px)"; // 66px bar + 8px gap

/** Scrolled this far down past the top before the bar is allowed to hide. */
const HIDE_AFTER = 80;
/** Ignore jitter smaller than this (momentum scrolling, address-bar resizes). */
const DEAD_ZONE = 6;

/** True while the user is scrolling DOWN the page; false on scroll up, near the top, or at the end. */
function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    last.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last.current;
      if (Math.abs(delta) < DEAD_ZONE) return;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
      setHidden(delta > 0 && y > HIDE_AFTER && !atEnd);
      last.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

export function MobileTabs() {
  const t = useTranslations("shell.nav");
  const pathname = usePathname() ?? "";
  const { displayNetworkSlug } = useMarketPageContext();
  const routeActive = pageKindFromPathname(pathname);
  // The tapped tab lights up at once, before the next page has loaded: the
  // highlight glides inside THIS bar while the route changes, instead of the new
  // page's bar appearing with it already in place. Cleared when the route lands.
  const [pending, setPending] = useState<NavKind | null>(null);
  useEffect(() => setPending(null), [pathname]);
  const active = pending ?? routeActive;
  // On the Pro terminal the bar stays put: the page's Buy / Sell bar rests on
  // top of it, and a bar that slid away would leave that one floating.
  const onTerminal = tradeGearFromPathname(pathname) === "pro";
  const scrolledAway = useHideOnScroll();
  const hidden = scrolledAway && !onTerminal;

  return (
    <nav
      aria-label={t("mobilePrimaryLabel")}
      data-hidden={hidden || undefined}
      className={cn(
        "fixed right-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] left-2.5 z-50 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 p-1.5 shadow-2xl backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none min-[1200px]:hidden",
        hidden && "pointer-events-none translate-y-[calc(100%+16px)] opacity-0",
      )}
    >
      <SlideGroup>
        <div className="grid grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.kind;
            return (
              <Link
                key={tab.kind}
                href={buildPageUrl(tab.kind, { slug: displayNetworkSlug })}
                aria-current={routeActive === tab.kind ? "page" : undefined}
                onClick={() => setPending(tab.kind)}
                className={cn(
                  "relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors duration-150",
                  isActive
                    ? "text-[color:var(--m-text-primary)]"
                    : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                )}
              >
                {isActive && (
                  <SlidingIndicator className="inset-0 rounded-xl bg-[color:color-mix(in_srgb,var(--m-primary)_18%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--m-primary)_30%,transparent)]" />
                )}
                <Icon className={cn("relative h-5 w-5", isActive && "text-[color:var(--m-primary)]")} />
                <span className="relative max-w-full truncate">{t(tab.kind)}</span>
              </Link>
            );
          })}
        </div>
      </SlideGroup>
    </nav>
  );
}
