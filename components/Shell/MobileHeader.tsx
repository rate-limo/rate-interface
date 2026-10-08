"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Coins, Droplets, Gift, LineChart, Menu, WalletCards } from "lucide-react";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { SupportButton } from "@/components/Support/SupportWidget";
import { WalletMenu } from "@/components/Shell/WalletMenu";
import { CreateButton } from "@/components/Shell/CreateButton";
import { LogoMarkV2 } from "@/components/Atoms/LogoMarkV2";
import { SearchTrigger } from "@/components/Search/SearchTrigger";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SoundToggle } from "@/components/Sound/SoundToggle";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { buildPageUrl, type PageKind } from "@/lib/routing/chainParams";

/**
 * The mobile top bar — logo, search, wallet, menu. Counterpart to AppShell's
 * desktop header.
 *
 * Promoted out of components/Iter/ on 2026-07-29, where it was wired into /iter
 * alone. AppShell renders it now, so every app page has it.
 *
 * ## Why the menu had to be built to promote this
 *
 * The menu button was previously a `<button>` with no handler — dead on one page,
 * which would have become dead on ten. Worse, the chain switcher and theme toggle
 * live only in AppSidebar and StatusBar, both desktop-only, so before this there
 * was **no way to switch chain or theme on a phone at all**. The sheet is where
 * they live, alongside the destinations that don't earn one of the five tabs
 * (Pool and Rate among them since the bar went from seven to five).
 */

// Pool and Rate lead: they were tabs until the bar went to five (2026-10-03,
// see MobileTabs), and this sheet is now how a phone reaches them.
const MENU_LINKS: { kind: PageKind; label: string; icon: typeof Gift }[] = [
  { kind: "pool", label: "Pool", icon: Droplets },
  { kind: "iter", label: "Rate", icon: Activity },
  { kind: "rewards", label: "Rewards", icon: Gift },
  { kind: "pass", label: "OG Pass", icon: Coins },
  { kind: "token", label: "Tokens", icon: LineChart },
];

const EXTERNAL = [
  { label: "X", href: "https://x.com/off____grid" },
  { label: "GitHub", href: "https://github.com/rate-limo/rate-monorepo" },
  {
    label: "Whitepaper",
    href: "https://github.com/rate-limo/rate-research/blob/main/iter-whitepaper.md",
  },
];

const ICON_BUTTON =
  "grid h-12 w-12 place-items-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)] shadow-[inset_0_-2px_var(--m-text-primary-12)]";

export function MobileHeader({
  onSearchOpen,
  supportOpen,
  onSupportToggle,
}: {
  onSearchOpen: () => void;
  supportOpen: boolean;
  onSupportToggle: () => void;
}) {
  const { open } = useWalletConnect();
  const { address, isConnected } = useWalletAccount();
  const { displayNetworkSlug } = useMarketPageContext();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[58px] items-center justify-between border-b border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 px-4 backdrop-blur-xl min-[1200px]:hidden">
      <Link
        href={buildPageUrl("explore", { slug: displayNetworkSlug })}
        aria-label="Rate"
      >
        <LogoMarkV2 size={30} />
      </Link>

      <div className="flex items-center gap-2">
        {/* Search mirrors the desktop shell, where the control sits beside the
            wallet button. On a phone it can't sit inline — results need room —
            so the icon opens the same modal the desktop pill does.

            This used to be its own top Sheet wrapping ExploreSearch, which meant
            phone and desktop ran different search implementations against
            different data. AppShell owns the modal now; this button only asks for
            it, so the two cannot drift. */}
        <SearchTrigger
          onOpen={onSearchOpen}
          variant="icon"
          className={ICON_BUTTON}
        />

        {/* Icon only, and part of the bar — not a pill floating over the page. */}
        <SupportButton
          open={supportOpen}
          onClick={onSupportToggle}
          compact
          className={ICON_BUTTON}
        />

        {/* Before the wallet, matching the desktop header — the wallet stays the
            rightmost control at both widths. */}
        <CreateButton variant="mobile" />

        {/* Connected and disconnected are DIFFERENT controls here. This was a
            single button hard-coded to "Connect wallet" that always called
            `open()`, so a connected user on a phone saw no address, no account,
            and had no way to disconnect at all — the desktop pill was the only
            place a session could be ended. Same menu as the pill, so the two
            shells cannot offer different actions. */}
        {isConnected && address ? (
          <WalletMenu address={address}>
            <button
              type="button"
              title={address}
              aria-label="Wallet menu"
              className={ICON_BUTTON}
            >
              <WalletCards className="h-5 w-5" />
            </button>
          </WalletMenu>
        ) : (
          <button
            type="button"
            aria-label="Connect wallet"
            onClick={() => open()}
            className={ICON_BUTTON}
          >
            <WalletCards className="h-5 w-5" />
          </button>
        )}

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="grid h-12 w-12 place-items-center rounded-full text-[color:var(--m-text-primary)]"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="gap-0 rounded-t-3xl border-[color:var(--m-border)] bg-[color:var(--m-background)] px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <SheetTitle className="font-dm-mono text-[11px] tracking-[0.12em] text-[color:var(--m-text-secondary)] uppercase">
              More
            </SheetTitle>

            <nav aria-label="Secondary" className="mt-3 flex flex-col">
              {MENU_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.kind}
                    href={buildPageUrl(item.kind, { slug: displayNetworkSlug })}
                    // The sheet owns its open state, and navigating within the
                    // same shell doesn't unmount it — so close it explicitly.
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 border-b border-[color:var(--m-border)] py-3.5 text-[15px] font-semibold text-[color:var(--m-text-primary)] last:border-b-0"
                  >
                    <Icon className="h-5 w-5 text-[color:var(--m-text-secondary)]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Chain, theme and sound have no other home on a phone: the sidebar
                and status bar that carry them are both desktop-only. Sound sits
                here rather than in the top bar (five 48px controls already fill
                360px) or the tab bar (five tabs is the cap). */}
            <div className="mt-4 flex items-center gap-3 border-t border-[color:var(--m-border)] pt-4">
              <ChainSwitcher />
              <ThemeToggle />
              <SoundToggle />
            </div>

            <div className="mt-4 flex items-center gap-4">
              {EXTERNAL.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
