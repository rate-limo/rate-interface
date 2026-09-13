import { useWalletConnect } from "@/lib/wallet";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";

export default function AccountActions() {
  const { accountValueUSD } = useMarketPageContext();
  // AppKit has no funding-options/onramp equivalent to Dynamic's -- opening
  // the account view is the closest stand-in for deposit/withdraw until a
  // dedicated flow is built.
  const { fund } = useWalletConnect();

  return (
    <div className="w-full max-w-xl mx-auto bg-black-400 text-white p-6 rounded-3xl text-[12px]">
      {/* Action Buttons */}
      <div className="flex flex-col gap-4 mb-10">

        <button
          onClick={() => fund()}
          className="w-full py-3 rounded-full border border-purple-400 text-purple-400  font-medium hover:bg-purple-400/10 transition-colors"
        >
          Deposit
        </button>

        <button
          onClick={() => fund()}
          className="w-full py-3 rounded-full border border-purple-400 text-purple-400  font-medium hover:bg-purple-400/10 transition-colors"
        >
          Withdraw
        </button>
      </div>

      {/* Account Equity */}
      <div className="mb-8">
        <h2 className="font-medium mb-4">Account Equity</h2>
        <div className="flex justify-between items-center mb-2">
          <span className="text-dark-grey-1">Spot</span>
          <span>${(accountValueUSD ?? 0).toFixed(2)}</span>
        </div>
        {/*
        <div className="flex justify-between items-center">
          <span className="text-dark-grey-1">Perps</span>
          <span>$0.00</span>
        </div>
        */}
      </div>

      {/* Perps Overview */}
      {/*
      <div>
        <h2 className=" font-medium mb-4">Perps Overview</h2>
        <div className="flex justify-between items-center mb-2">
          <span className="text-dark-grey-1 underline">Balance</span>
          <span>$0.00</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-dark-grey-1">Unrealized PNL</span>
          <span>$0.00</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-dark-grey-1">Cross Margin Ratio</span>
          <span className="text-purple-400">0.00%</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-dark-grey-1 underline">Maintenance Margin</span>
          <span>$0.00</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-dark-grey-1 underline">
            Cross Account Leverage
          </span>
          <span>0.00X</span>
        </div>
      </div>
      */}
    </div>
  );
}
