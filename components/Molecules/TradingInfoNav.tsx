'use client';

import { cn } from '@/lib/utils';

export type TradingTab =
  | 'Deposits and Withdrawal'
  | 'Balances'
  | 'Positions'
  | 'Open Orders'
  | 'Trade History'
  | 'Funding History'
  | 'Order History';

type TradingInfoNavProps = {
  activeTab: TradingTab;
  onTabChange: (tab: TradingTab) => void;
  className?: string;
};

export function TradingInfoNav({
  activeTab,
  onTabChange,
  className,
}: TradingInfoNavProps) {
  const tabs: TradingTab[] = [
    'Deposits and Withdrawal',
    'Balances',
    'Positions',
    'Open Orders',
    'Trade History',
    'Funding History',
    'Order History',
  ];

  return (
    <div className={cn('flex w-full justify-between border-neutral-light-white-12 border-b', className)}>
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={cn(
            'px-6 py-2 text-xs',
            activeTab === tab
              ? 'border-primary-default border-b text-white'
              : 'text-neutral-dark-100 hover:text-white',
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
