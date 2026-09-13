import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LeaderboardColumn } from "@/components/Social/LeaderboardColumn";
import { TopTrades } from "@/components/Social/TopTrades";

/**
 * The three-column social layout: leaderboard, subject, top trades.
 *
 * ## What this is and is not
 *
 * It is the layout BETWEEN the app chrome and a page's own content. `AppShell`
 * already owns the top bar and the StatusBar at the foot (and the sidebar, and
 * the mobile header/tabs); this renders inside its `children` and owns only the
 * column structure. Do not add page chrome here — a second header would sit
 * under the shell's real one.
 *
 * ## The centre is a slot, the flanks are fixed
 *
 * ```tsx
 * <AppShell>
 *   <SocialColumns networkSlug={slug} subjectAddress={address}>
 *     <ProfileView … />          {/* or <HomeFeed /> *}
 *   </SocialColumns>
 * </AppShell>
 * ```
 *
 * `/home` and `/profile/[address]` differ ONLY in what goes in the middle and
 * whose trades the right rail ranks. That is the whole reason this exists as a
 * component: the two pages were going to grow their own copies of the same two
 * rails, and the rails would then drift.
 *
 * ## `subjectAddress` is the page's subject, and `/home` has none
 *
 * On `/profile` it is the wallet in the URL, and the right rail ranks that
 * wallet's trades. `/home` passes nothing, which is not "the viewer" but "the
 * venue": both rails are then global, ranked across every chain by the
 * aggregator. Neither takes a chain, because neither answer varies with the one
 * the page happens to be showing.
 *
 * ## Widths and what drops first
 *
 * 292 / fluid-to-670 / 360, matching the reference. The right rail goes at
 * 1024px and the left at 1280px, so the narrowing order is flanks-then-centre
 * and the subject column is the last thing standing. Both are `hidden`, not
 * unmounted conditionally — a JS width check would flash the wrong composition
 * on first paint, and these are static rails with nothing to gain from it.
 */
export function SocialColumns({
  children,
  networkSlug,
  subjectAddress,
  topTradesTitle,
  className,
}: {
  /** The centre column: the profile view, the home feed, whatever the page is. */
  children: ReactNode;
  networkSlug: string;
  /** Whose trades the right rail ranks. Undefined renders its empty state. */
  subjectAddress?: string;
  /** Right-rail heading — "Top trades" reads oddly as your own on /home. */
  topTradesTitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1400px] flex-1 px-4 pt-3", className)}>
      <aside className="hidden w-[292px] shrink-0 self-stretch border-r border-[color:var(--m-border)] pr-[31px] min-[1280px]:block">
        <LeaderboardColumn networkSlug={networkSlug} />
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-[670px] flex-1 flex-col gap-4 pt-3 lg:px-4">
        {children}
      </div>

      <aside className="hidden w-[360px] shrink-0 flex-col gap-3 self-stretch border-l border-[color:var(--m-border)] pl-[31px] lg:flex 2xl:w-[400px]">
        {/* No explicit subject means the VENUE — /home ranks the best trades
            across every chain, not the viewer's own. It used to fall back to the
            connected wallet, which put your trades under a heading that reads as
            everyone's. */}
        <TopTrades
          address={subjectAddress}
          networkSlug={networkSlug}
          title={topTradesTitle}
        />
      </aside>
    </div>
  );
}
