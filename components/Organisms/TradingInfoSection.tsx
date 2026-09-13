'use client';

import { useState } from 'react';
import {
  TradingInfoNav,
  type TradingTab,
} from '@/components/Molecules/TradingInfoNav';
import { TradingInfoTable } from '@/components/Organisms/TradingInfoTable';
import { BalancesTable } from '@/components/Organisms/BalancesTable';
import { OpenOrdersTable } from '@/components/Organisms/OpenOrdersTable';
import { TradeHistoryTable } from '@/components/Organisms/TradeHistoryTable';
import {
  type Transaction,
  type OpenOrder,
  type TradeHistoryItem,
} from '@/data/samples';
import { cn } from '@/lib/utils';
import { ThemedScrollArea } from '@/components/ui/scroll-area';

type TradingInfoSectionProps = {
  transactions: Transaction[];
  tokens?: any[]; // Using any to match tableTokens format
  openOrders?: OpenOrder[];
  tradeHistory?: TradeHistoryItem[];
  initialTab?: TradingTab;
  className?: string;
  onViewDetails: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onCancelOrder?: (id: string) => void;
};

export function TradingInfoSection({
  transactions,
  tokens = [],
  openOrders = [],
  tradeHistory = [],
  initialTab = 'Deposits and Withdrawal',
  className,
  onViewDetails,
  onToggleFavorite,
  onCancelOrder,
}: TradingInfoSectionProps) {
  const [activeTab, setActiveTab] = useState<TradingTab>(initialTab);

  const handleTabChange = (tab: TradingTab) => {
    setActiveTab(tab);
  };

  // Render appropriate content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Balances':
        return (
          <BalancesTable tokens={tokens} onToggleFavorite={onToggleFavorite} />
        );
      case 'Open Orders':
        return (
          <OpenOrdersTable
            orders={openOrders}
            onViewDetails={onViewDetails}
            onCancelOrder={onCancelOrder}
          />
        );
      case 'Trade History':
        return (
          <TradeHistoryTable
            trades={tradeHistory}
            onViewDetails={onViewDetails}
          />
        );
      case 'Deposits and Withdrawal':
      default:
        return (
          <TradingInfoTable
            transactions={transactions}
            onViewDetails={onViewDetails}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        'border-neutral-dark-600 flex w-full flex-col gap-6 rounded-[16px] border px-2 pt-2',
        className,
      )}
    >
      <TradingInfoNav activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="h-[411px]">
        <ThemedScrollArea className="h-full">
          {renderTabContent()}
        </ThemedScrollArea>
      </div>
    </div>
  );
}
