"use client";

import { useState } from "react";
import { Holdings } from "./Holdings";
import { OpenOrders } from "../Tables/OpenOrders";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import TradeHistory from "../Tables/TradeHistory";
import OrderHistory from "../Tables/OrderHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/animated-tabs";

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

  const renderEmptyState = (tab: Tab) => {
    return (
      <div className="py-8 px-6">
        <span className="text-[color:var(--m-text-primary)]">No {tab} Yet</span>
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

  // Each panel renders ITS OWN tab: the outgoing panel is still on screen while
  // it slides out, and must not show the incoming tab's table.
  const renderTable = (tab: Tab) => {
    if (!isLoggedIn) {
      return renderLoginButton();
    }
    switch (tab) {
      case "Balances":
        // Holdings first: the token list is long and mostly zero for any one wallet.
        return <Holdings />;
      case "Positions":
        return renderEmptyState(tab);
      case "Open Orders":
        return <OpenOrders />;
      case "Trade History":
        return <TradeHistory />;
      case "Funding History":
        return renderEmptyState(tab);
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
    // The panels fill the panel's height, so they slide but do not morph it.
    <Tabs
      value={activeTab}
      onValueChange={(next) => setActiveTab(next as Tab)}
      morphHeight={false}
      className="h-full w-full bg-[color:var(--m-background)] text-[12px] text-[color:var(--m-text-primary)]"
    >
      <TabsList aria-label="Account" className="border-b border-[color:var(--m-border)]">
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab} className="px-[10px] py-[10px]">
            {tab}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab} value={tab} className="flex min-h-0 flex-1 flex-col">
          {renderTable(tab)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
