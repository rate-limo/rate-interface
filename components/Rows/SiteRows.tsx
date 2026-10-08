import { NoticeRow } from "./NoticeRow";
import { TradingRow } from "./TradingRow";
import { getRowContent } from "@/lib/rows/content";
import { getVisibleChains } from "@/lib/chains/visibleServer";

/**
 * The two site rows, in order: **notice** then **trading information**.
 *
 * Mounted once in `app/[locale]/layout.tsx`, above everything, so every page
 * carries them — landing, the app shell, and the legal pages that sit outside
 * it. This is the ONLY mount point: rendering either row from a page as well
 * would stack a second copy under the first, and nothing about that fails
 * loudly.
 *
 * ## One read per request, shared by both rows
 *
 * `getRowContent` is called here rather than in each row, so a page costs one
 * query instead of two and the two rows can never disagree about whether the
 * content row was readable — which is the exact condition apps/admin's `/rows`
 * view reports on. The operator's visible-chain list is resolved alongside it,
 * in parallel, and for the same reason.
 *
 * ## Cost of being everywhere
 *
 * Roughly 76px of chrome at the top of every viewport. `/trade/pro` is the
 * page that feels it: its spec already gives up the sticky status bar to
 * reclaim 40px. Neither row is sticky, so both scroll away — the cost is the
 * first screen, not permanent terminal real estate. If Pro needs that back,
 * suppress the rows for that route here rather than teaching either row about
 * pathnames.
 */
export async function SiteRows() {
  /*
   * Both reads happen here, for the same reason the content one always has:
   * one per request, and the two rows cannot disagree about what they were
   * given. `getVisibleChains` is what stops the tape listing a chain the
   * operator has hidden — see lib/chains/visibleServer.
   */
  const [content, visibleChains] = await Promise.all([getRowContent(), getVisibleChains()]);

  return (
    <>
      <NoticeRow content={content} />
      <TradingRow content={content} visibleChains={visibleChains} />
    </>
  );
}
