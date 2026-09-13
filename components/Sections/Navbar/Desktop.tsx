"use client";

import { BrandLogo } from "@/components/Atoms/BrandLogo";
import PumpNotificationBanner from "@/components/Organisms/Banners/PumpNotificationBanner";
import { ChainSwitcher } from "@/components/Organisms/ChainSwitcher";
import { NavMenu } from "@/components/Organisms/NavMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/Shell/WalletButton";

/**
 * Desktop navbar, per the approved Explore design: brand left, the five page
 * links centered, wallet cluster right. The navbar's own search field is
 * gone — search is the unified token+pair field on the page (Explore spec) —
 * and the "More" dropdown went with it (see NavMenu). ChainSwitcher and
 * ThemeToggle stay: the wireframe elides them, but chain and theme are
 * functional necessities, kept compact beside Connect.
 *
 * `activeTab` is legacy — NavMenu now derives the active link from the
 * pathname; the prop is accepted so existing pages keep compiling.
 */
export default function NavBarDesktop({ activeTab }: { activeTab?: string }) {
  return (
    <div className="flex flex-col">
      <PumpNotificationBanner />
      {/* Same theme-aware surface as the landing header (Landing/Nav.tsx):
          black-400 maps to --m-background, so this is white in light mode and
          deep navy in dark. */}
      <div className="hidden h-[64px] w-full items-center justify-between border-b border-white/5 bg-black-400/80 px-6 py-0.5 backdrop-blur-md min-[1200px]:flex">
        <BrandLogo />
        <NavMenu activeTab={activeTab} />
        <div className="flex h-full items-center gap-3">
          <ChainSwitcher />
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </div>
  );
}
