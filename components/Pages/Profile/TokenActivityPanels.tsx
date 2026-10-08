"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatSubscriptDecimal } from "@/utils/number";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useTokenTraders } from "@/hooks/useTokenTraders";
import type { TokenTrader } from "@/queries/server/tokenTraders";
import { useRecentTrades } from "@/hooks/useRecentTrades";
import { useThesesFeed } from "@/hooks/useThesesFeed";
import { useIdentities } from "@/hooks/useIdentities";
import { profileImageUrl } from "@/lib/portfolio/profile";
import { CalloutCard } from "@/components/Social/CalloutCard";
import { ThesisComposer } from "@/components/Pages/Profile/ThesisComposer";
import { UNTRACKED_LABEL, UNTRACKED_TITLE } from "@/lib/portfolio/positions";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { signedMoney } from "@/components/Social/PositionMiniCard";
import { TraderProfileModal } from "@/components/Social/TraderProfileModal";
import { networkNameToSlug } from "@/consts";
import type { SpotPair } from "@/types";
import type { SpotTradeEvent } from "@iter/types";

/**
 * The two panels under the token profile's chart: who holds a position, and —
 * on the right, behind two tabs — what people have SAID about the coin and what
 * is trading in it right now.
 *
 * ## The left table is traders, NOT holders, and that is not a wording choice
 *
 * The reference design labels this column "Holder". This system cannot answer
 * that question: nothing indexes ERC-20 `Transfer`, so there is no wallet
 * balance anywhere — only `broker.spotPositions`, folded from the fill ledger.
 * A wallet that was airdropped the token and never traded is absent; one that
 * bought and sent the tokens away is still listed. `pctSupply` is therefore a
 * share of TRADED supply and does not sum to 100%.
 *
 * Labelling that "Holders" would be wrong in a way a reader cannot detect, so
 * the header, the column and the footnote all say traders, and the gateway
 * repeats it in `basis` on every response. Real holders would need Transfer
 * indexing and a balances table — a backend change, not a rename here.
 *
 * ## Realised and unrealised PnL stay separate
 *
 * Realised comes off the ledger and is a fact. Unrealised depends on the live
 * price and is `null` when we have none. One combined number would be part fact
 * and part guess, and would silently become a guess for every unpriced token —
 * so the cell shows unrealised with the realised amount beneath it, and an
 * unpriced row says so instead of rendering a confident zero.
 */
export function TokenActivityPanels({
  networkName,
  address,
  pair,
  symbol,
  showTraders,
  className,
}: {
  networkName: string;
  address: string | undefined;
  pair: SpotPair | null;
  symbol: string;
  /**
   * False for a token Rate did not launch — see lib/token/coverage.ts. The tape
   * then takes the full width rather than sitting beside a panel that would be
   * explaining itself, because a half-page apology next to real data reads as
   * something being broken.
   */
  showTraders: boolean;
  className?: string;
}) {
  if (!showTraders) {
    return (
      <div className={cn("grid gap-5", className)}>
        <OffVenueNotice symbol={symbol} />
        <ActivityPanel networkName={networkName} address={address} pair={pair} symbol={symbol} />
      </div>
    );
  }

  return (
    // minmax(0,1fr): a bare grid column sized to its widest content, and the
    // callouts card ran ~30px past a phone's edge, clipping its own text.
    <div className={cn("grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[repeat(2,minmax(0,1fr))]", className)}>
      <TradersTable networkName={networkName} address={address} symbol={symbol} />
      <ActivityPanel networkName={networkName} address={address} pair={pair} symbol={symbol} />
    </div>
  );
}

/**
 * Why this profile is thinner than a launched coin's.
 *
 * Stated rather than left as an absence. A reader who has seen a launched coin's
 * profile will notice two missing panels, and silence invites the wrong
 * conclusion — that the data is loading, or broken, or that nobody holds this
 * token. The real reason is narrow and worth saying: Rate indexes the full
 * transfer history of coins it launched, and cannot for one it did not.
 */
function OffVenueNotice({ symbol }: { symbol: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
      <h2 className="text-[15px] font-semibold text-[color:var(--m-text-primary)]">
        Holder data is not available for {symbol}
      </h2>
      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-5 text-[color:var(--m-text-secondary)]">
        {symbol} was not launched on Rate. Holder balances and the holder map are reconstructed
        from a coin&apos;s full transfer history, which Rate indexes only for coins launched here —
        so for {symbol} there is no complete picture of who holds it, and showing a partial one
        would misrepresent the distribution.
      </p>
      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-5 text-[color:var(--m-text-secondary)]">
        Everything below is measured directly from trades on Rate and is exact.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ traders */

function TradersTable({
  networkName,
  address,
  symbol,
}: {
  networkName: string;
  address: string | undefined;
  symbol: string;
}) {
  const { address: viewer } = useAccount();
  const [tab, setTab] = useState<"all" | "following">("all");
  const { data, isLoading } = useTokenTraders(networkName, address, viewer);

  const traders = data?.traders ?? [];
  const following = useMemo(() => traders.filter((t) => t.followedByViewer), [traders]);
  const rows = tab === "following" ? following : traders;

  /**
   * The same name resolution the tape beside this table uses.
   *
   * The traders route joins `broker.accountProfiles` and stops there, so a
   * wallet that set a username in the edit modal — which writes `admin.profiles`
   * — came back with nothing and rendered as an address HERE while rendering by
   * name in the trades tab, on the same page, for the same wallet. Neither table
   * is a superset of the other; `/api/identities` is the one place that merges
   * them, so both panels ask it rather than each trusting the join it happens to
   * have.
   *
   * The row's own fields stay as the fallback: they come from the same
   * `accountProfiles` row the merge reads, so this can only add a name, never
   * take one away if the batch read fails.
   */
  const identities = useIdentities(
    networkName,
    useMemo(() => rows.map((t) => t.account), [rows]),
  );

  /**
   * The trader being previewed, or null.
   *
   * Same control the leaderboard rows use, and for the reason its modal
   * documents: this table is a BROWSING surface. A reader comparing four rows
   * who clicks one to see who it is should not lose the list, their tab and
   * their scroll position to find out — which is what navigating to
   * `/profile/[address]` costs them. The modal's own footer keeps the link out
   * for when they do want the page.
   */
  const [openTrader, setOpenTrader] = useState<string | null>(null);

  return (
    <PanelCard>
      <TabGroup>
        <Tab active={tab === "all"} onClick={() => setTab("all")}>
          All ({data?.totalCount ?? 0})
        </Tab>
        <Tab
          active={tab === "following"}
          onClick={() => setTab("following")}
          // Without a connected wallet there is nobody to have follows FOR, and
          // an enabled tab resolving to an empty list would read as "none of the
          // people you follow trade this" rather than "we cannot know".
          disabled={!viewer}
          title={viewer ? undefined : "Connect a wallet to see traders you follow"}
        >
          Following ({viewer ? following.length : 0})
        </Tab>
      </TabGroup>

      <TableCard>
        <table className="w-full min-w-[400px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--m-border)] text-left text-[12px] text-[color:var(--m-text-secondary)]">
              <th className="px-4 py-3 font-normal">Trader</th>
              <th className="px-3 py-3 font-normal">Position</th>
              <th className="px-3 py-3 font-normal">PnL</th>
              <th className="px-4 py-3 font-normal">% traded supply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--m-border)]">
            {isLoading && <SkeletonRows cols={4} />}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[color:var(--m-text-secondary)]">
                  {tab === "following"
                    ? "None of the traders you follow hold a position here."
                    : "No positions yet — nobody has traded this token."}
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <TraderRow
                key={t.account}
                trader={t}
                symbol={symbol}
                networkName={networkName}
                name={identities.nameOf(t.account)}
                avatarUrl={identities.avatarOf(t.account)}
                onOpen={setOpenTrader}
              />
            ))}
          </tbody>
        </table>
      </TableCard>

      {/* The caveat rides with the data, not in a tooltip nobody opens. Inside
          the card and separated by a rule: it is a footnote about this panel, so
          it belongs to the panel. Left outside it was unowned text sitting on the
          page background. */}
      <p className="mt-3 border-t border-[color:var(--m-border)] pt-3 text-[10.5px] leading-4 text-[color:var(--m-text-secondary-2)]">
        Positions are derived from trades on Rate, not from wallet balances. Tokens received by
        transfer, airdrop or LP withdrawal are not counted, so these shares do not add up to the
        full supply.
      </p>

      <TraderProfileModal
        address={openTrader}
        networkName={networkName}
        networkSlug={networkNameToSlug[networkName] ?? ""}
        open={openTrader !== null}
        // Cleared on close rather than left set, so the next open does not paint
        // the previous trader for a frame while its query resolves — the same
        // note the leaderboard's copy of this carries.
        onOpenChange={(next) => {
          if (!next) setOpenTrader(null);
        }}
      />
    </PanelCard>
  );
}

function TraderRow({
  trader,
  symbol,
  networkName,
  name: resolved,
  avatarUrl,
  onOpen,
}: {
  trader: TokenTrader;
  symbol: string;
  networkName: string;
  /** From `/api/identities`; null when nobody has claimed the address. */
  name: string | null;
  avatarUrl: string | null;
  onOpen: (account: string) => void;
}) {
  const claimed = resolved ?? trader.handle ?? trader.displayName ?? null;
  const name = claimed ?? shorten(trader.account);
  const pnl = trader.unrealizedPnlUSD;

  return (
    <tr className="transition-colors hover:bg-[color:var(--m-surface-2)]">
      <td className="px-4 py-3">
        {/*
          A real button, not a click handler on the <tr>.

          The row is a table row and screen readers announce it as one; giving it
          `role="button"` would trade correct table semantics for a control, and
          a bare `onClick` on a <tr> is unreachable by keyboard entirely. Putting
          the control on the identity — which is the thing being opened — keeps
          both, and matches where the leaderboard puts its own.
        */}
        <button
          type="button"
          onClick={() => onOpen(trader.account)}
          // The address stays reachable even under a name: a name is claimed,
          // not verified, and two wallets can pick similar ones.
          title={claimed ? `View ${claimed} (${shorten(trader.account)})` : `View ${name}`}
          className="-mx-1 flex max-w-full items-center gap-2.5 rounded px-1 py-0.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--m-primary)]"
        >
          <Avatar
            url={profileImageUrl(networkName, avatarUrl ?? trader.avatarUrl)}
            seed={trader.account}
            name={name}
          />
          <span
            className={cn(
              "truncate text-[color:var(--m-text-primary)]",
              claimed ? "font-medium" : "font-dm-mono",
            )}
          >
            {name}
          </span>
        </button>
      </td>
      <td className="px-3 py-3 font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
        {trader.priced && trader.valueUSD !== null ? (
          usd(trader.valueUSD)
        ) : (
          // An unpriced token must not render as $0 — that reads as a worthless
          // position rather than an unknown one.
          <span className="text-[color:var(--m-text-secondary-2)]">
            {compact(trader.amount)} {symbol}
          </span>
        )}
      </td>
      <td className="px-3 py-3 font-dm-mono tabular-nums">
        {pnl === null ? (
          <span className="text-[color:var(--m-text-secondary-2)]">no price</span>
        ) : (
          /*
            ONE string, from the shared formatter — not a sign glued to a number.

            This used to render `{pnl >= 0 ? "+" : "−"}` and `{usd(Math.abs(pnl))}`
            as two adjacent JSX children, i.e. two text nodes. In a column this
            narrow the browser takes the boundary between them as a line-break
            opportunity, so the sign wrapped onto a line of its own and the cell
            read as a stray "−" floating above the figure.

            It also spelled the sign two ways in one cell: the minus came from
            here for the unrealised line while the realised line below let `usd`
            print its own hyphen INSIDE the string. `signedMoney` is the app's
            one answer for a PnL surface — a true minus, outside, matching the
            leading plus it lines up against — so both lines use it.
          */
          <span className={pnl >= 0 ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]"}>
            {signedMoney(pnl)}
          </span>
        )}
        {trader.realizedPnlUSD !== 0 && (
          <div className="text-[10px] text-[color:var(--m-text-secondary-2)]">
            {signedMoney(trader.realizedPnlUSD)} realised
          </div>
        )}
        {/* Sold more than the ledger ever saw bought: the basis is incomplete and
            the PnL beside it is understated. Say so rather than quietly showing it —
            in the SAME words the other two surfaces use, from `UNTRACKED_LABEL`. */}
        {trader.untrackedSold > 0 && (
          <div
            title={UNTRACKED_TITLE}
            className="text-[10px] text-[color:var(--m-warning,#d08700)]"
          >
            {UNTRACKED_LABEL}
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
        {/*
          Subscript notation below 0.01%, the same rule the USD columns follow.

          `toFixed(2)` rendered EVERY row as "0.00%": a trader's share of traded
          supply on a billion-supply launch sits around 1e-9, so two decimals is
          a column of identical zeros that says a real holder owns nothing. The
          notation is what keeps those rows distinguishable at the same width —
          0.0₈999% rather than 0.00%.
        */}
        {trader.pctSupply === null
          ? "—"
          : `${formatSubscriptDecimal(trader.pctSupply) ?? trader.pctSupply.toFixed(2)}%`}
      </td>
    </tr>
  );
}

/* ------------------------------------------------ callouts and trades panel */

const SIZE_STEPS = [100, 1_000, 10_000] as const;

/**
 * The right-hand panel: what people SAID about this coin, and what is trading.
 *
 * Two tabs on one surface rather than two stacked panels, because they answer
 * the same question at different resolutions — "what is happening with this
 * coin right now" — and only one of them is worth reading at a time. The tape
 * moves every few seconds and pulls the eye off anything beside it; a callout
 * is worth stopping on. Side by side, the tape wins and the callouts are never
 * read.
 *
 * Callouts lead. A tape is the same shape on every coin, and the thing that is
 * only true of THIS one is what somebody staked a position to say about it.
 *
 * The filters live in the tab row rather than inside the card, so the card is
 * only ever the list. That is what makes the three panels on this page read as
 * one system: controls above, bordered list below, in all of them.
 */
function ActivityPanel({
  networkName,
  address,
  pair,
  symbol,
}: {
  networkName: string;
  address: string | undefined;
  pair: SpotPair | null;
  symbol: string;
}) {
  const [tab, setTab] = useState<"callouts" | "trades">("callouts");

  // Lifted out of the table because the reference puts these controls in the
  // tab row, and because they must survive a trip to the Callouts tab and back:
  // a reader who set "Sells over $1k", glanced at the callouts and came back to
  // an unfiltered tape would reasonably read that as the filter being broken.
  const [side, setSide] = useState<"all" | "buys" | "sells">("all");
  const [minUsd, setMinUsd] = useState<number>(0);

  return (
    <PanelCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TabGroup>
          <Tab active={tab === "callouts"} onClick={() => setTab("callouts")}>
            Callouts
          </Tab>
          <Tab active={tab === "trades"} onClick={() => setTab("trades")}>
            Trades
          </Tab>
        </TabGroup>

        {tab === "trades" && pair && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as typeof side)}
              aria-label="Trade side"
              className="rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 py-2 text-[13px] text-[color:var(--m-text-primary)]"
            >
              <option value="all">All trades</option>
              <option value="buys">Buys</option>
              <option value="sells">Sells</option>
            </select>

            {/*
              One select, with "Any size" as a named option.

              This was a switch plus a threshold that greyed out when the switch
              was off. The argument for splitting them was that the pair
              remembers a chosen threshold across an off/on toggle — but it cost
              three controls in a row for one decision, and the off state left a
              visibly disabled dropdown still showing "$100.00", which reads as a
              filter that is applied and broken rather than one that is off.

              "Any size" names the no-filter case instead of leaving it implied,
              which is what the split was really guarding against.
            */}
            <select
              value={minUsd}
              onChange={(e) => setMinUsd(Number(e.target.value))}
              aria-label="Filter trades by size"
              className="rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 py-2 font-dm-mono text-[13px] tabular-nums text-[color:var(--m-text-primary)]"
            >
              <option value={0}>Any size</option>
              {SIZE_STEPS.map((v) => (
                <option key={v} value={v}>
                  Min ${compact(v)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === "callouts" ? (
        <>
          {/*
           * The composer sits with the feed it writes into, and that is a
           * REGRESSION being closed rather than a new idea.
           *
           * `ux-flows.spec.ts` records the original: "the callout composer
           * existed but was mounted only on the retired /price page, so the
           * chart drew callouts nobody on /token could write". `/price` has
           * since been deleted outright — `app/[locale]/price` does not exist —
           * which left `DesktopProfilePage` unreachable and took the only mount
           * with it. The chart's marks, the Callouts tab and this panel all
           * survived; the one control that produces a callout did not.
           *
           * Here rather than beside the chart, because writing one is the same
           * act as reading them: a reader who can see what others staked is the
           * reader with something to say. The composer gates itself — it needs a
           * connected wallet and a qualifying fill, and says which is missing —
           * so it is safe to render unconditionally.
           */}
          {address ? (
            <ThesisComposer
              tokenAddress={address}
              tokenSymbol={symbol}
              networkName={networkName}
              className="mb-4 mt-0"
            />
          ) : null}
          <CalloutsFeed networkName={networkName} address={address} symbol={symbol} />
        </>
      ) : (
        <TradesTable
          networkName={networkName}
          pair={pair}
          symbol={symbol}
          side={side}
          minUsd={minUsd}
        />
      )}
    </PanelCard>
  );
}

/* ----------------------------------------------------------------- callouts */

/**
 * Every callout written about this coin, newest first.
 *
 * Scoped SERVER-side, through `/api/theses/token/:address` — a route added for
 * this panel. `admin.theses` was already readable by token (the chart marks ride
 * that predicate) but only as marks: capped, ordered by size, and bounded to the
 * chart's visible window. Filtering the global river in the browser instead
 * would silently drop whole pages of a quiet coin's callouts and report a total
 * that belongs to a different question.
 *
 * A callout is anchored to a trade, so this list cannot exist for a coin nobody
 * has traded — the empty state says that rather than implying the feed failed.
 */
function CalloutsFeed({
  networkName,
  address,
  symbol,
}: {
  networkName: string;
  address: string | undefined;
  symbol: string;
}) {
  const { rows, failed, isLoading } = useThesesFeed({
    networkName,
    scope: "token",
    subject: address,
    pageSize: 20,
  });
  const slug = networkNameToSlug[networkName] ?? "";

  /*
    Callouts are a STACK OF CARDS, not a table — so this deliberately does not
    use `TableCard`.

    `TableCard` bleeds to the panel's edges with `-mx-4 sm:-mx-6`, which is right
    for a wide table that wants the full width and wrong for anything that draws
    its own border: it pushed each callout's rounded frame out until it sat flush
    against the panel's own frame, one line inside another, while the panel's
    bottom padding still left a band of empty surface under the last card. A
    divider between them on top of that gave every boundary two lines.

    So: normal flow inside the panel's padding, and one gap between cards.
  */
  return (
    <div className="flex flex-col gap-2">
      {isLoading &&
        [0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-xl bg-[color:var(--m-surface-2)]"
          />
        ))}

      {/* `failed` and empty are separate states on purpose — the hook keeps them
          apart so a reader is never told nobody has posted when the read broke. */}
      {!isLoading && failed && (
        <div className="py-10 text-center text-[13px] text-[color:var(--m-text-secondary)]">
          Callouts could not be loaded.
        </div>
      )}

      {!isLoading && !failed && rows.length === 0 && (
        <div className="py-10 text-center text-[13px] text-[color:var(--m-text-secondary)]">
          No callouts on {symbol} yet. A callout is anchored to a trade, so the first one
          comes from somebody who has taken a position.
        </div>
      )}

      {!isLoading &&
        rows.map((thesis) => (
          <CalloutCard
            key={thesis.id}
            thesis={thesis}
            networkSlug={slug}
            // The page is already the coin — see the prop's note on the card.
            showToken={false}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------- trades */

function TradesTable({
  networkName,
  pair,
  symbol,
  side,
  minUsd,
}: {
  networkName: string;
  pair: SpotPair | null;
  symbol: string;
  side: "all" | "buys" | "sells";
  minUsd: number;
}) {
  // A token with no pair has nothing to subscribe to, and this hook opens a
  // websocket subscription keyed on the pair symbol — so the empty state has to
  // come BEFORE it runs. Hooks cannot be called conditionally, hence the split
  // into an inner component rather than an early return here.
  if (!pair) {
    return (
      <TableCard>
        <div className="px-4 py-10 text-center text-[13px] text-[color:var(--m-text-secondary)]">
          No market yet — this token has no pair to trade in.
        </div>
      </TableCard>
    );
  }
  return (
    <TradesTableForPair
      networkName={networkName}
      pair={pair}
      symbol={symbol}
      side={side}
      minUsd={minUsd}
    />
  );
}

/** Rows per page on the trade tape. Enough to fill the card without the panel
 *  growing past the chart beside it. */
const TRADES_PER_PAGE = 25;

function TradePagerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[9px] px-3 py-1.5 text-[13px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TradesTableForPair({
  networkName,
  pair,
  symbol,
  side,
  minUsd,
}: {
  networkName: string;
  pair: SpotPair;
  symbol: string;
  side: "all" | "buys" | "sells";
  minUsd: number;
}) {
  const { data, isLoading } = useRecentTrades(networkName, pair.base, pair.quote);

  /**
   * The taker whose profile is open, or null.
   *
   * Same control the traders table beside this one uses. The column header said
   * "Account" over a bare `0x1234…abcd` in mono — an identifier, not an
   * identity, and nothing you could act on. A trade tape is a browsing surface:
   * the reader's next question about a row is who made it.
   */
  const [openTrader, setOpenTrader] = useState<string | null>(null);

  const matching = useMemo(() => {
    let out = data ?? [];
    if (side !== "all") {
      const wantBuy = side === "buys";
      out = out.filter((t) => isBuyOf(t, pair.base.id) === wantBuy);
    }
    if (minUsd > 0) out = out.filter((t) => (t.valueUSD ?? 0) >= minUsd);
    return out;
  }, [data, side, minUsd, pair.base.id]);

  /*
   * Paged, because this tape has no end.
   *
   * `useRecentTrades` keeps a socket-backed window and every fill on the market
   * lands in it, so the panel grew without limit — a coin with a few hundred
   * trades rendered a few hundred rows inside a card, and the page below it went
   * wherever that pushed it. There was no control of any kind.
   *
   * Paging over the rows ALREADY HELD rather than asking the gateway for a page:
   * the tape is live, and a server page would be a snapshot that goes stale the
   * moment the next fill arrives — page 2 would quietly show a row that was on
   * page 1 when it was fetched. Slicing a list the socket keeps current cannot
   * drift from itself.
   */
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(matching.length / TRADES_PER_PAGE));

  // A filter change re-scopes the list under the reader, so page 5 of the old
  // one is meaningless — and if the new list is shorter it is also EMPTY, which
  // reads as "no trades match" when there are plenty on page 1.
  useEffect(() => {
    setPage(1);
  }, [side, minUsd]);

  // Clamped rather than reset: new fills arriving can only ever grow the list,
  // but a filter that narrows it while the reader sits on the last page would
  // otherwise strand them past the end.
  const current = Math.min(page, totalPages);
  const rows = useMemo(
    () => matching.slice((current - 1) * TRADES_PER_PAGE, current * TRADES_PER_PAGE),
    [matching, current],
  );

  // Resolved for the rows actually on screen, not for every fill the socket has
  // ever delivered: a filtered tape asks about the wallets it is showing.
  const identities = useIdentities(
    networkName,
    useMemo(() => rows.map((t) => t.taker), [rows]),
  );

  return (
    <TableCard>
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--m-border)] text-left text-[12px] text-[color:var(--m-text-secondary)]">
            <th className="px-4 py-3 font-normal">Profile</th>
            <th className="px-3 py-3 font-normal">Type</th>
            <th className="px-3 py-3 font-normal">Amount ({pair.quoteSymbol})</th>
            <th className="px-3 py-3 font-normal">{symbol}</th>
            <th className="px-4 py-3 font-normal">
              <span className="inline-flex items-center gap-1.5">
                Time
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--m-border)]">
          {isLoading && <SkeletonRows cols={5} />}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-[color:var(--m-text-secondary)]">
                {minUsd > 0 || side !== "all" ? "No trades match this filter." : "No trades yet."}
              </td>
            </tr>
          )}
          {rows.map((t) => {
            const buy = isBuyOf(t, pair.base.id);
            return (
              <tr
                key={`${t.txHash}-${t.orderId}`}
                className="transition-colors hover:bg-[color:var(--m-surface-2)]"
              >
                <td className="px-4 py-3">
                  <TradeIdentity
                    networkName={networkName}
                    account={t.taker}
                    name={identities.nameOf(t.taker)}
                    avatarUrl={identities.avatarOf(t.taker)}
                    onOpen={setOpenTrader}
                  />
                </td>
                <td
                  className={cn(
                    "px-3 py-3 font-medium",
                    buy ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]",
                  )}
                >
                  {buy ? "Buy" : "Sell"}
                </td>
                <td className="px-3 py-3 font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                  {compact(t.quoteAmount)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 font-dm-mono tabular-nums",
                    buy ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]",
                  )}
                >
                  {compact(t.baseAmount)}
                </td>
                <td className="px-4 py-3 font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                  {ago(t.timestamp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Only when there is a second page. A pager under a seven-row tape is a
          control that can never do anything. */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-t border-[color:var(--m-border)] px-3 py-3">
          <TradePagerButton onClick={() => setPage(current - 1)} disabled={current <= 1}>
            ‹ Previous
          </TradePagerButton>
          {/* The total, not just the position: "3" alone does not say whether
              there is anything after it, which is the question a pager answers. */}
          <span className="rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-1.5 text-center font-dm-mono text-[12px] tabular-nums">
            {current} / {totalPages}
          </span>
          <TradePagerButton
            onClick={() => setPage(current + 1)}
            disabled={current >= totalPages}
          >
            Next ›
          </TradePagerButton>
        </div>
      )}

      <TraderProfileModal
        address={openTrader}
        networkName={networkName}
        networkSlug={networkNameToSlug[networkName] ?? ""}
        open={openTrader !== null}
        // Cleared on close rather than left set, so the next open does not paint
        // the previous trader for a frame while its query resolves.
        onOpenChange={(next) => {
          if (!next) setOpenTrader(null);
        }}
      />
    </TableCard>
  );
}

/**
 * Who made a trade, by name where there is one.
 *
 * Presentational only. The names arrive already resolved from `useIdentities`,
 * one request for every wallet on the tape — see that hook for why this is not
 * a per-row lookup, and `/api/identities` for why resolving a name needs both
 * profile tables rather than either one.
 *
 * ## The fallback is the address, and it is not a failure
 *
 * Most wallets have never claimed a name, and the route says so with a null
 * rather than an error. The shortened address is the honest reading there — it
 * is what the wallet is called when it is called nothing else — and it keeps the
 * column populated instead of blanking a row mid-list while a query settles.
 */
function TradeIdentity({
  networkName,
  account,
  name,
  avatarUrl,
  onOpen,
}: {
  networkName: string;
  account: string;
  name: string | null;
  avatarUrl: string | null;
  onOpen: (account: string) => void;
}) {
  const label = name ?? shorten(account);

  return (
    // A real button on the identity, not a handler on the <tr> — the same
    // reasoning TraderRow documents.
    <button
      type="button"
      onClick={() => onOpen(account)}
      // The address stays in the tooltip even when a name is shown. A name is
      // claimed, not verified, and two wallets can pick similar ones — so the
      // one identifier that cannot be chosen has to remain reachable.
      title={name ? `View ${name} (${shorten(account)})` : `View ${shorten(account)}`}
      className="-mx-1 flex max-w-full items-center gap-2.5 rounded px-1 py-0.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--m-primary)]"
    >
      {/* Through `profileImageUrl`, never raw: an avatar from `admin.profiles`
          is a path on the GATEWAY (`/api/avatar/<sha256>`), so an <img src>
          would resolve it against this app's origin, 404 silently, and leave the
          gradient showing — indistinguishable from a wallet with no avatar. */}
      <Avatar url={profileImageUrl(networkName, avatarUrl)} seed={account} name={name} />
      <span
        className={cn(
          "truncate text-[color:var(--m-text-primary)]",
          // A name reads as prose; an address is a hash and only lines up in
          // mono. Same distinction the rest of the app makes.
          name ? "font-medium" : "font-dm-mono",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------- shared */

/**
 * Whether this fill BOUGHT the token the page is about.
 *
 * `isBid` describes the taker's direction against the PAIR, so on a quote-side
 * token it means the opposite thing. Same rule the stats endpoint applies
 * server-side; kept identical here so the two panels cannot disagree about what
 * a buy is.
 */
function isBuyOf(trade: SpotTradeEvent, tokenId: string | undefined): boolean {
  // `useRecentTrades` flattens base/quote/asset to bare address strings before
  // they reach the store, so this compares ids, not token objects.
  const isBase = !!tokenId && String(trade.base).toLowerCase() === tokenId.toLowerCase();
  return trade.isBid === isBase;
}

/**
 * The card each panel on this page sits in.
 *
 * Every other panel on the token profile — Price, Holder map, Launch progress,
 * Market details, About — is a self-contained card: its title, its body and its
 * footnotes are all inside one bordered box. These two were not. Only the TABLE
 * was carded, which left the tab pills and the "positions are derived from
 * trades" caveat floating on the page background, aligned to nothing and
 * inheriting none of the column's padding.
 *
 * `p-4 sm:p-6` matches the Price card directly above it, which is the
 * neighbour a reader compares this against. The right rail runs tighter (`p-5`)
 * because it is a narrower column, not because the two disagree.
 */
function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 sm:p-6">
      {children}
    </div>
  );
}

/**
 * The scrolling region a wide table sits in.
 *
 * It used to carry its own border and background, from when the table WAS the
 * card. Inside `PanelCard` that renders a box inside an identical box — the
 * card-in-card the padding fix exists to remove — so it is now just the
 * horizontal scroll, negative-margined to the card's padding so a long row can
 * still use the card's full width instead of being inset twice.
 */
function TableCard({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 overflow-x-auto sm:-mx-6">{children}</div>;
}

/** The pill group the tabs sit in, above the card rather than inside it. */
function TabGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] bg-[color:var(--m-surface-2)] p-1">
      {children}
    </div>
  );
}

function Tab({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-[11px] px-3.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-sm"
          : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
        disabled && "cursor-not-allowed opacity-40 hover:text-[color:var(--m-text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3.5">
              <div className="h-3 w-full max-w-[90px] animate-pulse rounded bg-[color:var(--m-surface-2)]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * The wallet's picture — `ProfileAvatar`, not a local one.
 *
 * This used to derive its own colour: `hsl(parseInt(address.slice(2,8),16) % 360,
 * 60%, 45%)`. That is a THIRD scheme, unrelated to the shared palette, so the
 * same wallet appeared brown in this table and purple in the modal that this
 * table's own rows open — reported as exactly that.
 *
 * There is one avatar for a wallet and one component that draws it. Passing the
 * name through means the initial matches the modal too, not just the hue.
 */
function Avatar({ url, seed, name }: { url: string | null; seed: string; name?: string | null }) {
  return <ProfileAvatar address={seed} name={name} src={url} size={24} className="shrink-0" />;
}

function shorten(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function usd(n: number): string {
  if (n >= 1000) return `$${compact(n)}`;
  // A launch token's trade prices sit well below a cent, where `toFixed(2)`
  // renders every one of them as "$0.00" — a whole column of rows that look
  // identical and priced at nothing. Subscript notation is what keeps them
  // distinguishable at the same width.
  const subscript = formatSubscriptDecimal(n);
  return `$${subscript ?? n.toFixed(2)}`;
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (abs >= 1) return n.toFixed(2);
  return formatSubscriptDecimal(n) ?? n.toPrecision(3);
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
