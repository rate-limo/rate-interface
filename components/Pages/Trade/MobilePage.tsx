'use client';

import { chartTicker } from "@/lib/chart/ticker";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { X, ChevronDown } from 'lucide-react';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { useTradePageContext } from '@/contexts/TradePageProvider';
import Trades from '@/components/Organisms/Orderbook/Trades';
import SideBySideBook from '@/components/Organisms/Orderbook/SideBySideBook';
import { useWalletAccount, useWalletConnect } from '@/lib/wallet';
import TradingPanel from '@/components/Organisms/TradingPanel';
import { PhoneAccount } from '@/components/Organisms/SpotAccountPanel/PhoneAccount';
import { MobilePairSearch } from './MobilePairSearch';
import { StarButton } from '@/components/Organisms/StarButton';
import { CopyMarketLink } from '@/components/Organisms/TradeChart/CopyMarketLink';
import { formatPrice } from '@/lib/format/price';
import { cn } from '@/lib/utils';
import { PairImageIcon } from '@/components/Atoms/PairImageIcon';
import { tokenColor } from '@/lib/swap/tokens';
import { motion, useReducedMotion } from 'motion/react';
import { SlideGroup, SlidingIndicator } from '@/components/ui/sliding-indicator';
import { motionTokens } from '@/lib/motion-tokens';
import { TAB_BAR_CLEARANCE } from '@/components/Shell/MobileTabs';

const TradingViewChart = dynamic(
  () => import('@/components/Organisms/TradingView/TradingViewChart'),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-neutral-dark-default" />,
  },
);

type Tab = 'chart' | 'book' | 'trades';

const TABS: { key: Tab; label: string }[] = [
  { key: 'chart', label: 'Chart' },
  { key: 'book', label: 'Order book' },
  { key: 'trades', label: 'Trades' },
];

/**
 * Mobile / tablet trade screen.
 *
 * A fixed shell — sticky price header, ONE panel switched by Chart · Order
 * book · Trades tabs, the account panel below it, and a Buy/Sell bar that lifts
 * the order form in a bottom drawer — reusing the same panel components as
 * desktop.
 *
 * It honours the one rule the desktop tree exists to enforce: no panel
 * remounts. Every panel is mounted once and shown or hidden with `hidden` /
 * a CSS transform, never conditionally rendered. So switching tabs never
 * tears down the chart's socket, and opening the order drawer never wipes a
 * half-typed order. That's why the drawer is a translate — not a Radix
 * Sheet, which would unmount TradingPanel on close.
 */
export function TradeMobilePage() {
  const [tab, setTab] = useState<Tab>('chart');
  const reduced = useReducedMotion();
  const { isConnected } = useWalletAccount();
  const { open: openConnect } = useWalletConnect();
  const [orderOpen, setOrderOpen] = useState(false);
  // The Buy / Sell bar and the drawer render into <body>: this page sits
  // inside an animated wrapper that is transformed, which (a) makes its own
  // stacking context, so no z-index here could clear the tab bar (z-50,
  // mounted by AppShell), and (b) turns `position: fixed` inside it relative
  // to the wrapper instead of the screen.
  // ...and only from the copy of this page that is actually DISPLAYED: the
  // route renders one copy per width range and hides the other with CSS,
  // which a portal escapes. A display:none subtree has no client rects.
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const check = () => setMounted(root.getClientRects().length > 0);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const { displayNetworkName } = useMarketPageContext();
  const { pair, isBid, setIsBid, setQuoteAmount, setBaseAmount } = useTradePageContext();
  // The button you tap is the side you get. Both opened the same drawer with
  // whatever side it last had, so Sell routinely opened a Buy ticket. Amounts
  // reset only when the side actually changes (the panel's own toggle does the
  // same); reopening on the same side keeps a half-typed order.
  const openOrder = (side: 'buy' | 'sell') => {
    const bid = side === 'buy';
    if (bid !== isBid) {
      setIsBid(bid);
      setQuoteAmount(0);
      setBaseAmount(0);
    }
    setOrderOpen(true);
  };

  const change = pair.dayPriceDifferencePercentage ?? 0;
  const up = change >= 0;

  return (
    <div ref={rootRef} className="relative flex min-h-[calc(100vh-64px)] flex-col">
      {/* Sticky price header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-light-white-12 bg-neutral-dark-default px-4 py-2.5">
        <MobilePairSearch>
          <button className="flex items-center gap-2 rounded-md px-1 py-0.5 -ml-1 active:bg-neutral-light-white-12">
            {/* The same pair trades on several networks (ETH/USDC on RISE and
                on Arc), so the pair mark carries the network badge — as the
                desktop header and the pair profile already do. */}
            <PairImageIcon
              base={pair.base.symbol}
              quote={pair.quote.symbol}
              baseLogoURI={pair.base.logoURI}
              quoteLogoURI={pair.quote.logoURI}
              baseColor={tokenColor(pair.base.symbol)}
              quoteColor={tokenColor(pair.quote.symbol)}
              chainName={displayNetworkName}
              className="h-7 w-7"
            />
            <span className="text-sm font-semibold text-white">{pair.symbol}</span>
            <ChevronDown className="h-4 w-4 text-dark-grey-1" aria-hidden />
          </button>
        </MobilePairSearch>
        <div className="flex items-center gap-1">
          <span className="grid h-11 w-9 place-items-center">
            <StarButton id={pair.id} symbol={pair.symbol} option="spot" size={18} />
          </span>
          <CopyMarketLink pair={pair} networkName={displayNetworkName} label={false} className="h-9 w-9 justify-center px-0" />
        </div>
        <div className="ml-auto flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-sm text-white">
            {formatPrice(pair.price)}
          </span>
          <span className={cn('text-xs', up ? 'text-green-400' : 'text-red-400')}>
            {up ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart · Order book · Trades share ONE panel (Hyperliquid's mobile
          pattern, adopted 2026-10-03). They were stacked — a 42vh chart, then
          a Market | Account tab pair under it — so the book started below the
          fold. All three stay mounted and the inactive ones are only
          `invisible`, never `display:none`: the chart keeps its socket AND its
          size (a TradingView widget measured inside display:none comes back
          at zero width). */}
      <SlideGroup>
        <div role="tablist" aria-label="Market view" className="flex shrink-0 border-b border-neutral-light-white-12 bg-neutral-dark-default">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex-1 py-3 text-center text-xs font-medium transition-colors',
                tab === t.key ? 'text-white' : 'text-dark-grey-1',
              )}
            >
              {tab === t.key && <SlidingIndicator className="inset-x-0 -bottom-px h-0.5 rounded-full bg-purple-400" />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </SlideGroup>

      <div className="relative h-[52vh] min-h-[320px] w-full shrink-0 overflow-hidden border-b border-neutral-light-white-12 bg-neutral-dark-default">
        {TABS.map((t, i) => {
          const active = tab === t.key;
          const from = TABS.findIndex((x) => x.key === tab);
          return (
            <motion.div
              key={t.key}
              role="tabpanel"
              aria-label={t.label}
              aria-hidden={!active}
              inert={!active}
              className={cn('absolute inset-0', active ? 'visible' : 'invisible pointer-events-none')}
              initial={false}
              animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: i < from ? -12 : 12 }}
              transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}
            >
              {t.key === 'chart' ? (
                <TradingViewChart networkName={displayNetworkName} symbol={chartTicker(pair)} interval={'2'} />
              ) : t.key === 'book' ? (
                <SideBySideBook />
              ) : (
                <div className="h-full overflow-y-auto"><Trades /></div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Account (balances, open orders, history) sits below, always there —
          Hyperliquid's positions strip. It was a tab beside the book; trading
          and checking what you hold are not either/or. */}
      {/* Clears the stacked Buy / Sell bar + tab bar (~64 + 64 + gaps). */}
      {isConnected ? (
        // Cards, not the desktop tables (~1,100px wide in a 390px screen). The
        // bottom padding clears the fixed Buy / Sell bar + tab bar, measured
        // from the same constant that positions them, so the last card can
        // always scroll above both.
        <div className="min-h-[320px] flex-1" style={{ paddingBottom: `calc(${TAB_BAR_CLEARANCE} + 88px)` }}>
          <PhoneAccount />
        </div>
      ) : (
        // Logged out, the account panel was a ~150px "Connect wallet" box
        // between the book and Buy / Sell. One line says the same thing.
        <div className="flex-1 pb-[160px]">
          <div className="flex h-11 items-center justify-between border-b border-neutral-light-white-12 px-4 text-xs">
            <span className="text-dark-grey-1">Orders &amp; balances</span>
            <button type="button" onClick={() => openConnect()} className="font-semibold text-[color:var(--m-primary)]">
              Connect wallet
            </button>
          </div>
        </div>
      )}

      {mounted && createPortal(
        <>
      {/* Buy / Sell bar, in <body> for the same reason as the drawer: inside
          the page's animated (transformed) wrapper, `position: fixed` is
          relative to THAT box, so the bar landed wherever the content's
          height put it (measured 84px lower at 360x740). */}
      {/* Buy / Sell sit directly on the tab bar, one bottom unit: the tab bar
          stays on the terminal so every page is one tap away, and this bar
          rides above it. Positioned from MobileTabs' own clearance constant. */}
      <div
        data-testid="pro-trade-bar"
        className="fixed inset-x-2.5 z-40 flex gap-2 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 p-1.5 shadow-xl backdrop-blur-xl"
        style={{ bottom: TAB_BAR_CLEARANCE }}
      >
        <button
          onClick={() => openOrder('buy')}
          className="flex-1 rounded-xl bg-green-400 py-3 text-sm font-semibold text-white"
        >
          Buy
        </button>
        <button
          onClick={() => openOrder('sell')}
          className="flex-1 rounded-xl bg-red-400 py-3 text-sm font-semibold text-white"
        >
          Sell
        </button>
      </div>

      {/* Order drawer — always mounted, translated off-screen when closed so
          in-progress order input survives being dismissed. Above the tab bar
          (z-50): it opened UNDER it, hiding the bottom of the ticket. */}
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-black/50 transition-opacity',
          orderOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setOrderOpen(false)}
        aria-hidden={!orderOpen}
      />
      <div
        role="dialog"
        aria-label="Place order"
        data-open={orderOpen || undefined}
        // Closed, it is only translated off-screen (so a half-typed order
        // survives); inert keeps it out of focus and the accessibility tree.
        inert={!orderOpen}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[70] max-h-[85vh] overflow-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] border-t border-neutral-light-white-12 bg-neutral-dark-default transition-transform duration-300',
          orderOpen ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-light-white-12 px-4 py-3">
          <span className="text-sm font-semibold text-white">Place order</span>
          <button onClick={() => setOrderOpen(false)} aria-label="Close">
            <X className="h-5 w-5 text-dark-grey-1" />
          </button>
        </div>
        <div className="p-4">
          <TradingPanel />
        </div>
      </div>
        </>,
        document.body,
      )}
    </div>
  );
}
