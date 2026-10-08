"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptionalMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl, DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";
import { CreateChooserModal, type LaunchKind } from "@/components/Launch/CreateChooserModal";
import { CreateFlowModal } from "@/components/Launch/CreateFlowModal";

/**
 * The shell's entry point to creating something.
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
 *
 * ## It opens a modal, and is still a link
 *
 * Pressing it asks which kind of launch and then opens the flow in place — no
 * navigation, so a creator does not lose the market they were looking at.
 *
 * It stays an `<a href>` rather than becoming a `<button>`, and that is
 * deliberate: a button cannot be cmd-clicked into a new tab, cannot be copied
 * as a link, and disappears from the page's outbound links. `preventDefault`
 * runs only on a PLAIN left click, so every modified click still navigates to
 * `/create`, which renders the same flow full-page. One entry point, two
 * presentations, and the keyboard gets the modal because Enter on a link fires
 * an unmodified click.
 *
 * The test id carries the variant. Both shapes are always in the DOM — only CSS
 * hides one per width — so a shared id resolves to two nodes and every
 * `getByTestId("create-open")` would have to guess which.
 */
export function CreateButton({ variant }: { variant: "desktop" | "mobile" }) {
  const t = useTranslations("shell.nav");
  const market = useOptionalMarketPageContext();
  const slug = market?.displayNetworkSlug ?? DEFAULT_CHAIN_SLUG;
  const href = buildPageUrl("create", { slug });
  const label = t("create");

  const [chooserOpen, setChooserOpen] = useState(false);
  const [kind, setKind] = useState<LaunchKind | null>(null);

  /** True for a plain left click — the one case the modal should take over. */
  const isPlainClick = (event: React.MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  const open = (event: React.MouseEvent) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setChooserOpen(true);
  };

  const shared = (
    <>
      <CreateChooserModal
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        networkSlug={slug}
        onChoose={(chosen) => {
          setChooserOpen(false);
          setKind(chosen);
        }}
      />
      <CreateFlowModal
        kind={kind}
        networkSlug={slug}
        onOpenChange={(next) => {
          if (!next) setKind(null);
        }}
      />
    </>
  );

  if (variant === "mobile") {
    return (
      <>
        <Link
          href={href}
          onClick={open}
          aria-label={label}
          title={label}
          data-testid="create-open-mobile"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)] shadow-[inset_0_-2px_var(--m-text-primary-12)] transition-colors hover:bg-[color:var(--m-primary-hover)]"
        >
          <Plus aria-hidden className="h-5 w-5" />
        </Link>
        {shared}
      </>
    );
  }

  return (
    <>
      <Link
        href={href}
        onClick={open}
        data-testid="create-open-desktop"
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-[color:var(--m-primary)]",
          "bg-[color:var(--m-primary)] px-3.5 text-sm font-semibold text-[color:var(--m-on-primary)]",
          "transition-colors hover:bg-[color:var(--m-primary-hover)]",
        )}
      >
        <Plus aria-hidden className="h-4 w-4" />
        {label}
      </Link>
      {shared}
    </>
  );
}
