"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl, DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";

/**
 * The shell's entry point to `/create`.
 *
 * One component with two shapes rather than two buttons, because the desktop
 * header and `MobileHeader` are separate trees that already drifted once over
 * the wallet control — the mobile side spent a while hard-coded to "Connect
 * wallet" while the desktop pill had a whole account menu. A shared component
 * is what stops the two shells offering different destinations.
 *
 * **Placed before the wallet control at both widths.** The wallet stays the
 * rightmost thing in the bar, and the two shells present one order.
 *
 * The chain slug comes from the OPTIONAL market context: AppShell always
 * renders inside `MarketPageProvider` today, but the throwing hook would take
 * the entire shell down over a navigation link, which is the same call
 * `LoginRouter` makes for the same reason.
 */
export function CreateButton({ variant }: { variant: "desktop" | "mobile" }) {
  const t = useTranslations("shell.nav");
  const market = useOptionalMarketPageContext();
  const href = buildPageUrl("create", {
    slug: market?.displayNetworkSlug ?? DEFAULT_CHAIN_SLUG,
  });
  const label = t("create");

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        aria-label={label}
        title={label}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] shadow-[inset_0_-2px_var(--m-text-primary-12)] transition-colors hover:bg-[color:var(--m-primary-hover)]"
      >
        <Plus aria-hidden className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-[color:var(--m-primary)]",
        "bg-[color:var(--m-primary)] px-3.5 text-sm font-semibold text-[color:var(--m-on-primary)]",
        "transition-colors hover:bg-[color:var(--m-primary-hover)]",
      )}
    >
      <Plus aria-hidden className="h-4 w-4" />
      {label}
    </Link>
  );
}
