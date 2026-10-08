"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Compass,
  ArrowLeftRight,
  Droplets,
  Rocket,
  Wallet,
  Activity,
} from "lucide-react";
import { BrandLogo } from "@/components/Atoms/BrandLogo";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import {
  buildPageUrl,
  pageKindFromPathname,
  type PageKind,
} from "@/lib/routing/chainParams";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Coinbase-app-style left sidebar (user direction, 2026-07-28): brand on top,
 * the six primary destinations as icon+label rows, chain switcher pinned to
 * the bottom (theme moved to the status bar). Active state derives from the
 * pathname (page-first URLs); /token/[token] highlights Explore as its parent
 * family. Desktop-only — mobile keeps the bottom-bar pattern from the Explore
 * spec. AppShell applies the width gating, so this renders unconditionally.
 */

/**
 * Six destinations, matching the mobile tab bar exactly. Swap folded into Trade
 * (2026-07-29): Trade opens in Basic — the convert card — and shifts to Pro for
 * the order book, so a separate Swap row would point at the same surface.
 *
 * Launch added 2026-08-01 and sits next to Pool: both are supply-side surfaces,
 * and Launch is where a token that doesn't exist yet gets one. Pool's own
 * "Launch a pool" mode is a different job — an existing token, a new pool.
 */
// No `label` field: the nav key space IS the PageKind space, so the label comes
// from `t(kind)`. That removes the copy duplicated between this file and
// MobileTabs — the two lists could previously drift, and a translated one
// certainly would.
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

const LINKS: { kind: NavKind; icon: typeof Compass }[] = [
  { kind: "home", icon: House },
  { kind: "explore", icon: Compass },
  { kind: "trade", icon: ArrowLeftRight },
  { kind: "pool", icon: Droplets },
  { kind: "launch", icon: Rocket },
  { kind: "portfolio", icon: Wallet },
  { kind: "iter", icon: Activity },
];

function activeKind(pathname: string): PageKind | null {
  const kind = pageKindFromPathname(pathname);
  if (kind === "token") return "explore";
  return kind;
}

export function AppSidebar({ className }: { className?: string }) {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();
  const { displayNetworkSlug } = useMarketPageContext();
  const active = activeKind(pathname ?? "");

  return (
    <aside
      aria-label={t("primaryLabel")}
      className={cn(
        /*
         * `z-30` so the chain menu is not painted over.
         *
         * The rail comes FIRST in the DOM and the content column that follows
         * carries a `z-20` sticky header, so anything the sidebar opens beyond
         * its own 76px — which the 340px chain menu does by design — was
         * covered from the rail's edge onward. Above the header, below the
         * support panel's `z-[60]` and the consent banner's `z-50`.
         */
        "sticky top-0 z-30 flex max-h-screen self-stretch w-[76px] shrink-0 flex-col items-center border-r border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-2 py-5",
        className,
      )}
    >
      <div className="pb-7">
        <BrandLogo showName={false} size="md" />
      </div>

      <nav className="flex w-full flex-col items-center gap-1.5">
        {LINKS.map((l) => {
          const Icon = l.icon;
          const isActive = active === l.kind;
          return (
            <Tooltip key={l.kind}>
              <TooltipTrigger asChild>
                <Link
                  href={buildPageUrl(l.kind, { slug: displayNetworkSlug })}
                  aria-label={t(l.kind)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-11 w-12 items-center justify-center rounded-xl transition-colors",
                    isActive
                      ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] shadow-[0_2px_10px_color-mix(in_srgb,var(--m-primary)_30%,transparent)]"
                      : "text-[color:var(--m-text-secondary)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]",
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5 shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={10}
                className="border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)] shadow-xl"
              >
                {t(l.kind)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Theme toggle deliberately absent: it lives in the status bar (see
          Shell/StatusBar) rather than being duplicated in both places. */}
      <div className="mt-auto flex w-full flex-col items-center gap-3">
        {/*
          * Collapse the TRIGGER, not the component.
          *
          * These rules used to ride `className`, which lands on the wrapper —
          * so `[&_button]:h-10 [&_button]:w-10 [&_button]:p-0` and
          * `[&_button>span]:hidden` applied to every button INSIDE, the menu's
          * own chain rows included. Each option collapsed to a 40px circle with
          * its name hidden, so the network list rendered as unlabelled dots and
          * there was no way to tell which chain you were picking. `triggerClassName`
          * is the prop for exactly this and reaches only the button.
          */}
        <ChainSwitcher triggerClassName="h-10 w-10 justify-center p-0 [&>span]:hidden [&>svg]:hidden" />
      </div>
    </aside>
  );
}
