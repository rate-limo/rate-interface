'use client';

import { Label } from '@/components/Atoms/Label';
import PortfolioDashboard from '@/components/Organisms/PortfolioDashboard';
import { TradingDetails } from '@/components/Organisms/TradingDetails';
import { TradingInfoSection } from '@/components/Organisms/TradingInfoSection';
import {
  linearAreaChartData,
  sampleTransactions,
  tableTokens,
  sampleOpenOrders,
  sampleTradeHistory,
} from '@/data/samples';
import { useState } from 'react';

export default function DesktopPortfolioPage() {
  const [tokens, setTokens] = useState(tableTokens);

  const onViewDetails = (id: string) => {
    console.log('View details for item:', id);
  };

  const onToggleFavorite = (id: string) => {
    setTokens(
      tokens.map(token =>
        token.id === id ? { ...token, isFavorite: !token.isFavorite } : token,
      ),
    );
    console.log(`Toggle favorite for token ${id}`);
  };

  const onCancelOrder = (id: string) => {
    console.log(`Cancel order ${id}`);
  };

  return (
    <div className="flex w-full flex-col gap-12 px-6 pt-24 pb-6">
      <Label className="font-satoshi text-neutral-light-default text-5xl font-extralight">
        Your Portfolio
      </Label>

      <PortfolioDashboard />

      <TradingDetails chartData={linearAreaChartData} />

      <TradingInfoSection
        transactions={sampleTransactions}
        tokens={tokens}
        openOrders={sampleOpenOrders}
        tradeHistory={sampleTradeHistory}
        onViewDetails={onViewDetails}
        onToggleFavorite={onToggleFavorite}
        onCancelOrder={onCancelOrder}
      />
    </div>
  );
}
