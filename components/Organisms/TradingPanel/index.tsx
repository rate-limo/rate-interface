"use client";

import { useMemo, useRef, useState } from "react";
import {
  ContractArgs,
  useTradePageContext,
} from "@/contexts/TradePageProvider";
import Decimal from "decimal.js";
import PlaceOrderButton from "../PlaceOrderButton";
import { useEstimateFeesPerGas, useEstimateGas } from "wagmi";
import {
  deriveBaseFromQuote,
  deriveQuoteFromBase,
  safeRoundDecimals,
} from "@/utils/orderAmounts";
import { isValidNonNegativeNumberInput } from "@/utils/numberInput";

export default function TradingPanel() {
  const {
    pair,
    isConnected,
    quoteAmount,
    setQuoteAmount,
    baseAmount,
    setBaseAmount,
    isBid,
    setIsBid,
    isLimit,
    setIsLimit,
    limitPrice,
    setLimitPrice,
    limitOrderContractArgs,
    marketOrderContractArgs,
    approvalContractArgs,
    buySlippageLimit,
    sellSlippageLimit,
    nativeBalance,
    trueBaseBalance,
    trueQuoteBalance,
    approvalNeeded,
    limitOrderContractArgsForGasEstimation,
    marketOrderContractArgsForGasEstimation,
    approvalContractArgsForGasEstimation,
    amount,
    setAmount,
  } = useTradePageContext();

  /*
  const { data: limitOrderGas, error: limitOrderGasError } = useEstimateGas(
    limitOrderContractArgsForGasEstimation
  );
  const { data: marketOrderGas, error: marketOrderGasError } = useEstimateGas(
    marketOrderContractArgsForGasEstimation
  );
  const { data: approvalGas, error: approvalGasError } = useEstimateGas(
    approvalContractArgsForGasEstimation
  );
  const { data: feesPerGas } = useEstimateFeesPerGas();

  const getGasFee = (approvalNeeded: boolean, isLimit: boolean) => {
    if (approvalNeeded) {
      return approvalGas;
    }
    if (isLimit) {
      return limitOrderGas;
    } else {
      return marketOrderGas;
    }
  };

  const ETHFee = useMemo(() => {
    const gas = getGasFee(approvalNeeded, isLimit);
    return new Decimal((gas ?? 0).toString())
      .mul((feesPerGas?.maxFeePerGas ?? 0).toString())
      .div(1e18)
      .toFixed(8);
  }, [
    approvalNeeded,
    approvalGas,
    limitOrderGas,
    marketOrderGas,
    feesPerGas,
    isLimit,
  ]);
  */

  // Order mode state
  const [orderMode, setOrderMode] = useState<"Market" | "Limit" | "Stop-limit">(
    "Limit"
  );
  const [stopPrice, setStopPrice] = useState("");

  // Buy/Sell state
  const [side, setSide] = useState<"Buy" | "Sell">("Sell");

  // Input states
  const [price, setPrice] = useState("");
  const [sliderValue, setSliderValue] = useState(0);

  // Dropdown states
  const [currency, setCurrency] = useState<"USD" | "BTC">("USD");
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [timeInForce, setTimeInForce] = useState("GTC");

  const baseRoundDecimals = safeRoundDecimals(pair.base.decimals);
  const quoteRoundDecimals = safeRoundDecimals(pair.quote.decimals);

  const getComputingPrice = () => {
    let price;
    if (isLimit) {
      price = limitPrice === 0 || limitPrice === null ? pair.price : limitPrice;
    } else {
      price = pair.price;
    }
    return price;
  };

  const getInputSizeValue = useMemo(() => {
    if (isBid) {
      if (isNaN(quoteAmount)) {
        return "";
      }
      if (quoteAmount === 0) {
        return "0";
      }
      // if quoteAmount is starts with 0 and has decimal point, only leave the first 0
      if (
        quoteAmount.toString().startsWith("0.") &&
        quoteAmount.toString().length > 2
      ) {
        return "0." + quoteAmount.toString().split(".")[1];
      }
      // remove forward zeros
      return quoteAmount.toString().replace(/^0+/, "");
    } else {
      if (isNaN(baseAmount)) {
        return "";
      }
      if (baseAmount === 0) {
        return "0";
      }
      // if baseAmount is starts with 0 and has decimal point, only leave the first 0
      if (
        baseAmount.toString().startsWith("0.") &&
        baseAmount.toString().length > 2
      ) {
        return "0." + baseAmount.toString().split(".")[1];
      }
      // remove forward zeros
      return baseAmount.toString().replace(/^0+/, "");
    }
  }, [baseAmount, quoteAmount, isBid]);

  return (
    <div className="flex min-h-full w-full flex-col bg-[color:var(--m-surface)] p-3 text-[12px] text-[color:var(--m-text-primary)]">
      {/* Order Mode Tabs */}
      <div className="mb-3 grid h-9 grid-cols-3 border-b border-[color:var(--m-border)]">
        <button
          data-testid="order-mode-market"
          className={`px-3 py-2 text-[11px] font-medium ${
            orderMode === "Market"
              ? "text-[color:var(--m-text-primary)] border-b-2 border-[color:var(--m-primary)]"
              : "text-[color:var(--m-text-secondary)]"
          }`}
          onClick={() => {
            setOrderMode("Market");
            setIsLimit(false);
          }}
        >
          Market
        </button>
        <button
          data-testid="order-mode-limit"
          className={`px-3 py-2 text-[11px] font-medium ${
            orderMode === "Limit"
              ? "text-[color:var(--m-text-primary)] border-b-2 border-[color:var(--m-primary)]"
              : "text-[color:var(--m-text-secondary)]"
          }`}
          onClick={() => {
            setOrderMode("Limit");
            setIsLimit(true);
          }}
        >
          Limit
        </button>
        <button
          data-testid="order-mode-stop-limit"
          className={`px-3 py-2 text-[11px] font-medium ${
            orderMode === "Stop-limit"
              ? "text-[color:var(--m-text-primary)] border-b-2 border-[color:var(--m-primary)]"
              : "text-[color:var(--m-text-secondary)]"
          }`}
          onClick={() => {
            setOrderMode("Stop-limit");
            setIsLimit(true);
          }}
        >
          Stop-limit
        </button>
      </div>

      {/* Divider */}
      <div className="hidden"></div>

      {/* Buy/Sell Toggle */}
      <div className="mb-4 flex rounded-[4px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[3px]">
        <button
          className={`flex-1 rounded-[3px] py-2.5 font-medium ${
            isBid ? "bg-green-400 text-white" : "bg-transparent"
          }`}
          onClick={() => {
            setIsBid(true);
            setSliderValue(0);
            setQuoteAmount(0);
            setBaseAmount(0);
            setAmount("");
          }}
        >
          Buy
        </button>
        <button
          className={`flex-1 rounded-[3px] py-2.5 font-medium ${
            !isBid ? "bg-red-400 text-white" : "bg-transparent"
          }`}
          onClick={() => {
            setIsBid(false);
            setSliderValue(0);
            setQuoteAmount(0);
            setBaseAmount(0);
            setAmount("");
          }}
        >
          Sell
        </button>
      </div>

      {/* Account Info */}
      <div className="flex justify-between mb-2">
        <span className="text-[color:var(--m-text-secondary)] underline">Available to Trade</span>
        <span>
          {isBid ? trueQuoteBalance : trueBaseBalance}{" "}
          {isBid ? pair.quote.symbol : pair.base.symbol}
        </span>
      </div>

      {/* Stop trigger. Submission stays disabled below until the deployed
          network config exposes StopOrderEngine; never send this through the
          regular limit-order path and silently place the wrong order type. */}
      {orderMode === "Stop-limit" && (
        <div className="money mb-3 flex h-12 rounded-[4px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
          <input
            min={0}
            inputMode="decimal"
            placeholder="Stop price"
            className="min-w-0 flex-1 bg-transparent px-3 py-3 font-normal outline-none"
            value={stopPrice}
            onKeyDown={(e) => {
              if (e.key === "-" || e.key === "e") e.preventDefault();
            }}
            onChange={(e) => {
              if (!isValidNonNegativeNumberInput(e.target.value)) return;
              setStopPrice(e.target.value);
            }}
          />
          <div className="flex items-center px-5 text-[color:var(--m-text-secondary)]">
            {pair.quote.symbol}
          </div>
        </div>
      )}

      {/* Price Input */}
      {isLimit && (
        <div className="money mb-3 flex h-12 rounded-[4px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
          <input
            min={0}
            onKeyDown={(e) => {
              if (e.key === '-' || e.key === 'e') {
                e.preventDefault();
              }
            }}
            type="number"
            placeholder={orderMode === "Stop-limit" ? "Limit price" : "Price"}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 font-normal outline-none"
            value={limitPrice}
            onChange={(e) => {
              // onKeyDown blocks typing '-'/'e', but paste bypasses keydown
              // entirely -- reject here so a negative/garbage paste can't
              // reach limitPrice (and later fail ABI-encoding as a uint256).
              if (!isValidNonNegativeNumberInput(e.target.value)) return;
              setPrice(e.target.value);
              setLimitPrice(Number(e.target.value));
              if (isBid) {
                if (e.target.value === "" || Number(e.target.value) === 0) {
                  setBaseAmount(0);
                  return;
                }
                setBaseAmount(deriveBaseFromQuote(quoteAmount, Number(e.target.value), baseRoundDecimals));
              } else {
                setQuoteAmount(deriveQuoteFromBase(baseAmount, Number(e.target.value), quoteRoundDecimals));
              }
            }}
          />
          <div
            className="flex cursor-pointer items-center px-5 text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
            onClick={() => {
              setPrice(pair.price.toString());
              setLimitPrice(pair.price);
              if (isBid) {
                setBaseAmount(deriveBaseFromQuote(quoteAmount, pair.price, baseRoundDecimals));
              } else {
                setQuoteAmount(deriveQuoteFromBase(baseAmount, pair.price, quoteRoundDecimals));
              }
            }}
          >
            Mid
          </div>
        </div>
      )}

      {/* Size Input */}
      <div className="money mb-3 flex h-12 rounded-[4px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
        <input
          min={0}
          type="number"
          placeholder="Size"
          className="min-w-0 flex-1 bg-transparent px-3 py-3 font-normal outline-none"
          value={amount}
          onKeyDown={(e) => {
            if (e.key === '-' || e.key === 'e') {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            // Reject negative/garbage paste outright (onKeyDown only blocks
            // typed '-'/'e', not paste) instead of silently leaving the
            // displayed amount unchanged while still deriving quote/base
            // amounts from the rejected negative value underneath it.
            if (!isValidNonNegativeNumberInput(e.target.value)) return;
            setAmount(e.target.value);
            const amount = Number(e.target.value);
            const price = getComputingPrice();
            if (amount === 0) {
              setQuoteAmount(0);
              setBaseAmount(0);
              return;
            }
            if (isBid) {
              setQuoteAmount(amount);
              setBaseAmount(deriveBaseFromQuote(amount, price, baseRoundDecimals));
            } else {
              setBaseAmount(amount);
              setQuoteAmount(deriveQuoteFromBase(amount, price, quoteRoundDecimals));
            }
          }}
        />
        <div className="relative">
          <button className="flex items-center h-full px-5">
            {isBid ? pair.quote.symbol : pair.base.symbol}
          </button>
        </div>
      </div>

      {/* Slider */}
      <div className="mb-6">
        <input
          type="range"
          min="0"
          max="100"
          value={sliderValue}
          onChange={(e) => {
            setSliderValue(Number.parseInt(e.target.value));
            if (isBid) {
              if (trueQuoteBalance === 0) {
                setQuoteAmount(0);
                setSliderValue(0);
                return;
              }
              const newQuoteAmount = Number(
                new Decimal(trueQuoteBalance)
                  .mul(Number.parseInt(e.target.value) / 100)
                  .toFixed(quoteRoundDecimals)
              );
              setQuoteAmount(newQuoteAmount);
              const price = getComputingPrice();
              setBaseAmount(deriveBaseFromQuote(newQuoteAmount, price, baseRoundDecimals));
              if (
                Number(newQuoteAmount) >= 0 ||
                newQuoteAmount.toString() === ""
              ) {
                setAmount(newQuoteAmount.toString());
              }
            } else {
              if (trueBaseBalance === 0) {
                setBaseAmount(0);
                setSliderValue(0);
                return;
              }
              const newBaseAmount = Number(
                new Decimal(trueBaseBalance)
                  .mul(Number.parseInt(e.target.value) / 100)
                  .toFixed(baseRoundDecimals)
              );
              setBaseAmount(newBaseAmount);
              const price = getComputingPrice();
              setQuoteAmount(deriveQuoteFromBase(newBaseAmount, price, quoteRoundDecimals));
              if (
                Number(newBaseAmount) >= 0 ||
                newBaseAmount.toString() === ""
              ) {
                setAmount(newBaseAmount.toString());
              }
            }
          }}
          className="h-1 w-full appearance-none rounded-full bg-[color:var(--m-surface-2)] outline-none"
          style={{
            background: `linear-gradient(to right, var(--m-primary) 0%, var(--m-primary) ${sliderValue}%, var(--m-surface-2) ${sliderValue}%, var(--m-surface-2) 100%)`,
            WebkitAppearance: "none",
          }}
        />
        <style jsx global>{`
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--m-primary);
            cursor: pointer;
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--m-primary);
            cursor: pointer;
            border: none;
          }
        `}</style>
      </div>

      {/* Place Order Button */}
      {orderMode === "Stop-limit" ? (
        <button
          type="button"
          disabled
          title="Stop-limit orders require a StopOrderEngine address in the active network configuration."
          className="mb-4 w-full cursor-not-allowed rounded-[4px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] py-3.5 font-medium text-[color:var(--m-text-secondary)]"
        >
          Stop-limit unavailable on this network
        </button>
      ) : (
        <PlaceOrderButton isConnectedInput={isConnected} />
      )}

      {/* Order Info */}
      <div className="flex justify-between mb-2">
        <span className="text-[color:var(--m-text-secondary)] underline">
          {isBid
            ? `${quoteAmount} ${pair.quote.symbol} → ${baseAmount} ${pair.base.symbol}`
            : `${baseAmount} ${pair.base.symbol} → ${quoteAmount} ${pair.quote.symbol}`}
        </span>
        <span>
          $≈{" "}
          {isBid
            ? new Decimal(baseAmount).mul(pair.base.priceUSD).toFixed(4)
            : new Decimal(quoteAmount).mul(pair.quote.priceUSD).toFixed(4)}
        </span>
      </div>
      <div className="flex justify-between mb-2">
        <span className="text-[color:var(--m-text-secondary)]">Gas Fee</span>
        <span>0.000003 ETH</span>
      </div>
      <div className="flex justify-between mb-2">
        <span className="text-[color:var(--m-text-secondary)]">Slippage Limit</span>
        <span>{isBid ? buySlippageLimit : sellSlippageLimit}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[color:var(--m-text-secondary)]">Fees</span>
        <span>0.1% / 0.1%</span>
      </div>
    </div>
  );
}
