"use client";

import { useState } from "react";
import { BalancesTable } from "../Tables/BalancesTable";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { OpenOrders } from "../Tables/OpenOrders";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import TradeHistory from "../Tables/TradeHistory";
import OrderHistory from "../Tables/OrderHistory";

type Tab =
  | "Balances"
  | "Positions"
  | "Open Orders"
  | "Trade History"
  | "Funding History"
  | "Order History";

export default function AccountOverview() {
  const [activeTab, setActiveTab] = useState<Tab>("Open Orders");

  const { open } = useWalletConnect();
  const { isConnected: isLoggedIn } = useWalletAccount();

  const tabs: Tab[] = [
    "Balances",
    // "Positions",
    "Open Orders",
    "Trade History",
    // "Funding History",
    "Order History",
  ];
  const { defaultTokenData, address } = useMarketPageContext();

  const renderEmptyState = () => {
    return (
      <div className="py-8 px-6">
        <span className="text-[color:var(--m-text-primary)]">No {activeTab} Yet</span>
      </div>
    );
  };

  const renderLoginButton = () => {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <button
          className="w-full max-w-[600px] cursor-pointer rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] py-4 text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
          onClick={() => {
            if (!isLoggedIn) {
              open();
              return;
            }
          }}
        >
          Connect wallet
        </button>
      </div>
    );
  };

  const renderTable = () => {
    if (!isLoggedIn) {
      return renderLoginButton();
    }
    switch (activeTab) {
      case "Balances":
        return <BalancesTable data={defaultTokenData.tokens} />;
      case "Positions":
        return renderEmptyState();
      case "Open Orders":
        return <OpenOrders />;
      case "Trade History":
        return <TradeHistory />;
      case "Funding History":
        return renderEmptyState();
      case "Order History":
        return <OrderHistory />;
    }
  };

  {
    /*
  <div className="grid grid-cols-6 border-b border-black-300 py-3">
  <div className="px-6 text-dark-grey-2">Coin</div>
  <div className="px-6 text-dark-grey-2">Total Balance</div>
  <div className="px-6 text-dark-grey-2">Available Balance</div>
  <div className="px-6 text-dark-grey-2">USDT Value</div>
  <div className="px-6 text-dark-grey-2">PNL (ROI%)</div>
  <div className="px-6 text-dark-grey-2">Contract</div>
</div>
*/
  }

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--m-background)] text-[12px] text-[color:var(--m-text-primary)]">
      {/* Navigation Tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-[color:var(--m-border)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`px-[10px] py-[10px] whitespace-nowrap ${
              activeTab === tab
                ? "text-[color:var(--m-text-primary)] border-b-2 border-[color:var(--m-primary)]"
                : "text-[color:var(--m-text-secondary)]"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {renderTable()}
    </div>
  );
}
