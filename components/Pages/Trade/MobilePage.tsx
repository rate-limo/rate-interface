'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { X, ChevronDown } from 'lucide-react';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { useTradePageContext } from '@/contexts/TradePageProvider';
import OrderBook from '@/components/Organisms/Orderbook';
import TradingPanel from '@/components/Organisms/TradingPanel';
import SpotAccountPanel from '@/components/Organisms/SpotAccountPanel';
import { MobilePairSearch } from './MobilePairSearch';
import { addCommasInDecimalString, adjustDecimalLength } from '@/utils/number';
import { cn } from '@/lib/utils';

const TradingViewChart = dynamic(
  () => import('@/components/Organisms/TradingView/TradingViewChart'),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-neutral-dark-default" />,
  },
);

type Tab = 'market' | 'account';

/**
 * Mobile / tablet trade screen.
 *
 * A fixed shell — sticky price header, an always-visible chart, a Tabs slot
 * for the market/account panels, and a Buy/Sell bar that lifts the order
 * form in a bottom drawer — reusing the same panel components as desktop.
 *
 * It honours the one rule the desktop tree exists to enforce: no panel
 * remounts. Every panel is mounted once and shown or hidden with `hidden` /
 * a CSS transform, never conditionally rendered. So switching tabs never
 * tears down the chart's socket, and opening the order drawer never wipes a
 * half-typed order. That's why the drawer is a translate — not a Radix
 * Sheet, which would unmount TradingPanel on close.
 */
export function TradeMobilePage() {
  const [tab, setTab] = useState<Tab>('market');
  const [orderOpen, setOrderOpen] = useState(false);
  const { displayNetworkName } = useMarketPageContext();
  const { pair } = useTradePageContext();

  const change = pair.dayPriceDifferencePercentage ?? 0;
  const up = change >= 0;

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col">
      {/* Sticky price header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-light-white-12 bg-neutral-dark-default px-4 py-2.5">
        <MobilePairSearch>
          <button className="flex items-center gap-1 rounded-md px-1 py-0.5 -ml-1 active:bg-neutral-light-white-12">
            <span className="text-sm font-semibold text-white">{pair.symbol}</span>
            <ChevronDown className="h-4 w-4 text-dark-grey-1" aria-hidden />
          </button>
        </MobilePairSearch>
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-sm text-white">
            {addCommasInDecimalString(adjustDecimalLength(pair.price, 6))}
          </span>
          <span className={cn('text-xs', up ? 'text-green-400' : 'text-red-400')}>
            {up ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart — always mounted, top billing */}
      <div className="h-[42vh] min-h-[280px] w-full shrink-0 border-b border-neutral-light-white-12 bg-neutral-dark-default">
        <TradingViewChart
          networkName={displayNetworkName}
          symbol={pair.symbol}
          interval={'2'}
        />
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-neutral-light-white-12 bg-neutral-dark-default">
        {(['market', 'account'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-3 text-center text-xs font-medium capitalize transition-colors',
              tab === t
                ? 'border-b-2 border-purple-400 text-white'
                : 'text-dark-grey-1',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab bodies — both mounted, toggled by `hidden` (no remount). */}
      <div className="min-h-0 flex-1 pb-20">
        <div hidden={tab !== 'market'} className="h-full">
          <OrderBook />
        </div>
        <div hidden={tab !== 'account'} className="h-full">
          <SpotAccountPanel />
        </div>
      </div>

      {/* Sticky Buy/Sell bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-neutral-light-white-12 bg-neutral-dark-default px-4 py-3">
        <button
          onClick={() => setOrderOpen(true)}
          className="flex-1 rounded-full bg-green-400 py-3 text-sm font-semibold text-white"
        >
          Buy
        </button>
        <button
          onClick={() => setOrderOpen(true)}
          className="flex-1 rounded-full bg-red-400 py-3 text-sm font-semibold text-white"
        >
          Sell
        </button>
      </div>

      {/* Order drawer — always mounted, translated off-screen when closed so
          in-progress order input survives being dismissed. */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/50 transition-opacity',
          orderOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setOrderOpen(false)}
        aria-hidden={!orderOpen}
      />
      <div
        role="dialog"
        aria-label="Place order"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-auto rounded-t-2xl border-t border-neutral-light-white-12 bg-neutral-dark-default transition-transform duration-300',
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
    </div>
  );
}
