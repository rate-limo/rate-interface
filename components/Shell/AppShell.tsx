"use client";

import { createContext, Suspense, useCallback, useContext, useState } from "react";

/** Opens the shell's single SearchModal. Null outside AppShell, so a consumer
 *  can render nothing rather than throw. */
const ShellSearchContext = createContext<(() => void) | null>(null);
export const useShellSearch = () => useContext(ShellSearchContext);
import { usePathname } from "next/navigation";
import { MotionConfig } from "motion/react";
import { SearchModal } from "@/components/Search/SearchModal";
import { SearchTrigger, useSearchShortcut } from "@/components/Search/SearchTrigger";
import { AppSidebar } from "./AppSidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileTabs } from "./MobileTabs";
import { StatusBar } from "./StatusBar";
import { WalletButton } from "./WalletButton";
import { CreateButton } from "./CreateButton";
import { LoginRouter } from "@/components/Onboarding/LoginRouter";
import { RefCapture } from "@/components/Onboarding/RefCapture";
import { SupportWidget } from "@/components/Support/SupportWidget";
import { tradeGearFromPathname } from "@/lib/routing/chainParams";
import { ConnectWalletDialog } from "@/components/Wallet/ConnectWalletDialog";

/**
 * The Coinbase-app-style app shell (user direction, 2026-07-28):
 * left sidebar navigation, a slim top bar carrying the unified token+pair
 * search and the wallet button, content below, status bar pinned at the foot.
 * Must render inside MarketPageProvider (sidebar links, search and the trade
 * banner all read the display chain and live market lists from it).
 *
 * ## Every piece gates itself; `children` always render
 *
 * Desktop gets AppSidebar + the top bar + StatusBar; mobile gets MobileHeader +
 * MobileTabs. Each is gated individually, and `children` render at every width.
 *
 * This used to be `hidden min-[1200px]:flex` on the outer wrapper, which hid the
 * shell *and everything inside it* below 1200px — which silently deleted the
 * mobile page of anything that renders one composition at every width.
 *
 * **Do not gate this component externally.** Wrapping it in
 * `hidden min-[1200px]:block` now costs the page its mobile header and tab bar,
 * which is how /iter and /explore ended up as the only pages without them. A page
 * that needs a different composition per width should branch *inside* `children`
 * (see /trade/pro) rather than around the shell.
 *
 * ## Reduced motion is handled here, once
 *
 * `MotionConfig reducedMotion="user"` wraps the whole shell so every page's load
 * animation honours the OS "reduce motion" setting without each page opting in.
 * It suppresses *transform* animations (the y-offset rise) while leaving opacity
 * alone — the accessible behaviour: content still fades in rather than popping,
 * but nothing slides. Being context, it also covers any motion component a page
 * renders deeper inside `children`.
 *
 * The shell's own chrome (sidebar, top bar, status bar, mobile header/tabs) is
 * deliberately NOT animated: it persists across navigations, so a load animation
 * on it would re-fade the navigation on every route change.
 */
export function AppShell({
  children,
  headerContent,
  walletContent,
}: {
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  walletContent?: React.ReactNode;
}) {
  /**
   * Search state lives here, not in the triggers.
   *
   * MobileHeader and the desktop bar both mount at every width — only CSS hides
   * one — so a trigger that owned its own dialog would put two SearchModals in the
   * tree and register the ⌘K listener twice. One dialog, one shortcut, two buttons.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);

  /** Support opens from the shell's chrome, not from a floating pill. */
  const [supportOpen, setSupportOpen] = useState(false);
  const toggleSupport = useCallback(() => setSupportOpen((v) => !v), []);
  const pathname = usePathname();
  const isTerminal = tradeGearFromPathname(pathname ?? "") === "pro";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen w-full flex-col">
        {/* Sends a wallet connecting for the first time to /welcome, once ever
            per wallet per browser. This is the ONLY mount — the landing page had
            one until 2026-08-08 and must not get it back; see the component. */}
        <LoginRouter />
        {/* Reads ?ref= on any page and stashes it. Renders NOTHING as of
            2026-08-15 — it is a capture point, not UI; onboarding's invite step
            is what surfaces the code to the visitor. Still
            Suspense-wrapped because useSearchParams opts the whole subtree into
            client-side rendering otherwise, which would cost every page its static
            prerender — that cost is unchanged by the banner going away. */}
        <Suspense fallback={null}>
          <RefCapture />
        </Suspense>
        {/* PumpNotificationBanner is REMOVED FOR NOW (user direction,
            2026-08-07) — the recent-trade strip across the top of every page.
            The component is untouched and still self-hides when there is no
            trade to show; only this mount is gone. Restore by re-adding the
            import and this line, nothing else. */}

        <div className="flex w-full flex-1">
          <AppSidebar className="hidden min-[1200px]:flex" />

          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader
              onSearchOpen={openSearch}
              supportOpen={supportOpen}
              onSupportToggle={toggleSupport}
            />

            {/* Search sits on the right, next to the wallet button (user direction,
              2026-07-29). That leaves the left of the bar for page context —
              a page title, or the pair + Basic/Pro switch on Trade — which is
              what `headerContent` now fills. It used to hold the search and
              REPLACE it, so a page passing headerContent lost search entirely;
              search is fixed chrome now and every page keeps it. */}
            <header className="sticky top-0 z-20 hidden h-[60px] items-center justify-between gap-4 border-b border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 px-6 backdrop-blur-md min-[1200px]:flex">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {headerContent}
              </div>

              <div className="flex min-w-0 items-center gap-3">
                {/* Was ExploreSearch, an inline `String.includes` filter over the
                  lists MarketPageProvider had already fetched — so it could only
                  find roughly the first 20 tokens, and anything outside that
                  window came back as "no results", which reads as "does not
                  exist". This opens the modal, which queries /api/search. */}
                <SearchTrigger
                  onOpen={openSearch}
                  className="w-[20rem] max-w-full min-[1440px]:w-[26rem]"
                />
                <CreateButton variant="desktop" />
                <div className="shrink-0">
                  {walletContent ?? <WalletButton />}
                </div>
              </div>
            </header>

            {/* The mobile tab bar is `fixed` and floats over content, so the shell
              owns the clearance that keeps the last row of a page from ending
              underneath it: 68px of bar + its 10px inset + breathing room. Pages
              must NOT add their own bottom padding for the bar or the two stack
              — /iter used to carry pb-28 for exactly this and it came out when
              the bar moved here. */}
            <main className={`min-w-0 flex-1 pb-[104px] min-[1200px]:pb-0 ${isTerminal ? "min-[1200px]:pb-10" : ""}`}>
              {/* The shell owns the one SearchModal, so a page that wants its own
                  search control borrows this opener rather than mounting a second
                  dialog -- the failure the trigger's own note warns about. */}
              <ShellSearchContext.Provider value={openSearch}>
                {children}
              </ShellSearchContext.Provider>
            </main>

            <StatusBar supportOpen={supportOpen} onSupportToggle={toggleSupport} />
          </div>
        </div>

        <MobileTabs />

        {/* Bottom-right launcher + chat panel, beside MobileTabs because both are
          `fixed` chrome that floats over the page rather than sitting in flow.
          It lives HERE and not in app/[locale]/layout.tsx (user direction,
          2026-08-05), which makes support an in-app feature: the landing page
          and the legal pages render no shell and therefore no launcher.
          Mount it in exactly one place — the panel is a singleton and two
          mounts render two launchers, which is not something React warns about.
          Its own offsets already clear this shell's chrome (68px MobileTabs on
          mobile, the 40px StatusBar on desktop) plus the measured height of the
          consent banner, which is still in the root layout. */}
        <SupportWidget open={supportOpen} onClose={() => setSupportOpen(false)} />
        {/* One mount for the whole app. Any control that needs a wallet opens it
            through `requestWalletConnect`; a per-caller dialog would stack copies. */}
        <ConnectWalletDialog />

        {/* One mount for both triggers. Renders its own portal, so its position
          here in the tree is irrelevant to where it appears. */}
        <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </MotionConfig>
  );
}
