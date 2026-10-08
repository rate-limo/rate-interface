'use client';

import { chartTicker } from "@/lib/chart/ticker";
import dynamic from 'next/dynamic';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { useTradePageContext } from '@/contexts/TradePageProvider';
import PairPriceTracker from '@/components/Organisms/TradeChart/PairPriceTracker';
import OrderBook from '@/components/Organisms/Orderbook';
import Trades from '@/components/Organisms/Orderbook/Trades';
import TradingPanel from '@/components/Organisms/TradingPanel';
import SpotAccountPanel from '@/components/Organisms/SpotAccountPanel';

const TradingViewChart = dynamic(
  () => import('@/components/Organisms/TradingView/TradingViewChart'),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-[color:var(--m-surface-2)]" />,
  },
);

export function TradeDesktopPage() {
  const { displayNetworkName } = useMarketPageContext();
  const { pair } = useTradePageContext();

  return (
    <div className="h-[calc(100vh-64px)] min-h-[760px] w-full overflow-hidden bg-[color:var(--m-background)] text-[color:var(--m-text-primary)]">
      <div className="flex h-[72px] items-center border-b border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4">
        <PairPriceTracker />
      </div>
      <div className="grid h-[calc(100%-72px)] grid-cols-[minmax(0,1fr)_300px_330px] grid-rows-[minmax(470px,1fr)_250px]">
        <section className="min-w-0 border-b border-r border-[color:var(--m-border)] bg-[color:var(--m-background)]">
          <TerminalHeading title="Price chart" />
          <div className="h-[calc(100%-39px)] w-full">
            <TradingViewChart networkName={displayNetworkName} symbol={chartTicker(pair)} interval="2" />
          </div>
        </section>

        <section className="min-w-0 border-b border-r border-[color:var(--m-border)] bg-[color:var(--m-background)]">
          <OrderBook />
        </section>

        <aside className="row-span-2 min-w-0 bg-[color:var(--m-surface)]">
          <div className="h-[68%] min-h-[510px] overflow-y-auto border-b border-[color:var(--m-border)]">
            <TradingPanel />
          </div>
          <div className="h-[32%] min-h-[210px] overflow-hidden">
            <TerminalHeading title="Recent trades" />
            <div className="h-[calc(100%-39px)]"><Trades /></div>
          </div>
        </aside>

        <section className="col-span-2 min-w-0 overflow-auto border-r border-[color:var(--m-border)] bg-[color:var(--m-background)]">
          <SpotAccountPanel />
        </section>
      </div>
    </div>
  );
}

function TerminalHeading({ title }: { title: string }) {
  return (
    <div className="flex h-10 items-center border-b border-[color:var(--m-border)] px-3">
      <h2 className="text-[12px] font-medium text-[color:var(--m-text-primary)]">{title}</h2>
    </div>
  );
}
