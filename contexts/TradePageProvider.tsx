"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBalance } from "wagmi";
import {
  GroupedOrderbookResult,
  SpotBarEvent,
  SpotPair,
  SpotToken,
  SpotTradeEvent,
} from "@/types";
import { useOrderbook } from "@/hooks/useOrderbook";
import {
  addCommasInDecimalString,
  adjustDecimalLength,
  parseEther,
  parseUnits,
  priceEncodesToZero,
} from "@/utils/number";
import { exchangeAbi } from "@/components/abis/exchange";
import { wethAddress } from "@/lib/deployments";
import { isNative } from "@/utils/order";
import { useMarketPageContext } from "./MarketPageProvider";
import {
  ERC20BalanceAllowance,
  useERC20BalanceAllowance,
} from "@/hooks/useERC20BalanceAllowance";
import { erc20Abi, formatUnits } from "viem";
import Decimal from "decimal.js";
import { getDefaultScale } from "@/queries/client/orderbook";
import { useRecentTrades } from "@/hooks/useRecentTrades";
import { eventBus } from "@/utils/events";
import { usePair } from "@/hooks/usePair";
import { chainIdToNetworkName, PonderWssLinks } from "@/consts";
import { getDefaultPair } from "@/queries/server/pairs";

export interface TokenData {
  tokens: SpotToken[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
}

export interface ContractArgs {
  abi: any;
  address: `0x${string}` | undefined;
  functionName: string | undefined;
  chainId: number | undefined;
  args: any[];
  value?: bigint;
}

interface TradeContextType {
  pair: SpotPair;
  isConnected: boolean;
  nativeBalance: number;
  nativeBalanceStatus: string;
  trueBaseBalance: number;
  trueQuoteBalance: number;
  baseBalanceAllowance: ERC20BalanceAllowance;
  baseBalanceAllowanceStatus: string;
  refetchBaseBalanceAllowance: () => void;
  quoteBalanceAllowance: ERC20BalanceAllowance;
  quoteBalanceAllowanceStatus: string;
  refetchQuoteBalanceAllowance: () => void;
  isLimit: boolean;
  setIsLimit: (isLimit: boolean) => void;
  buySlippageLimit: number;
  setBuySlippageLimit: (buySlippageLimit: number) => void;
  sellSlippageLimit: number;
  setSellSlippageLimit: (sellSlippageLimit: number) => void;
  limitPrice: number;
  setLimitPrice: (limitPrice: number) => void;
  amount: string;
  setAmount: (amount: string) => void;
  quoteAmount: number;
  setQuoteAmount: (quoteAmount: number) => void;
  baseAmount: number;
  setBaseAmount: (baseAmount: number) => void;
  isBid: boolean;
  setIsBid: (isBid: boolean) => void;
  matchN: number;
  setMatchN: (matchN: number) => void;
  recipient: `0x${string}` | undefined;
  setRecipient: (recipient: `0x${string}` | undefined) => void;
  limitOrderContractArgs: ContractArgs;
  marketOrderContractArgs: ContractArgs;
  approvalContractArgs: ContractArgs;
  approvalNeeded: boolean;
  setApprovalNeeded: (approvalNeeded: boolean) => void;
  limitPriceEncodesToZero: boolean;
  orderAmountIsDust: boolean;
  limitOrderContractArgsForGasEstimation: ContractArgs;
  marketOrderContractArgsForGasEstimation: ContractArgs;
  approvalContractArgsForGasEstimation: ContractArgs;
  orderbook: GroupedOrderbookResult;
  orderbookComputed: GroupedOrderbookResult | null;
  step: string;
  setStep: (step: string) => void;
  recentTrades: SpotTradeEvent[];
}

const TradeContext = createContext<TradeContextType | null>(null);

export const TradePageProvider = ({
  baseInput,
  quoteInput,
  pairInput,
  orderbookInput,
  children,
}: {
  baseInput: SpotToken;
  quoteInput: SpotToken;
  pairInput: SpotPair;
  orderbookInput: GroupedOrderbookResult;
  children: React.ReactNode;
}) => {
  const {
    address,
    isConnected,
    displayNetworkName,
    connectedNetworkName,
    connectedChainId,
    matchingEngine,
  } = useMarketPageContext();

  // The address `createOrder` wraps native value into on this chain — same
  // registry, same resolution as `matchingEngine` above. Needed only by the
  // ETH-path branches of the two order useMemos below.
  const weth = useMemo(
    () => wethAddress(connectedNetworkName),
    [connectedNetworkName],
  );

  /// get base and quote
  const [base, setBase] = useState(baseInput);
  const [quote, setQuote] = useState(quoteInput);
  const [pair, setPair] = useState(pairInput);
  const [orderbook, setOrderbook] = useState(orderbookInput);

  // update pair data
  const { data: pairData } = usePair(displayNetworkName, pair);

  const [step, setStep] = useState<string>(
    getDefaultScale(pairData.price, pairData.scales)
  );

  // Orderbook generation
  const { data: orderbookComputed } = useOrderbook(
    displayNetworkName,
    pairData,
    base,
    quote,
    step,
    22,
    true,
    orderbookInput
  );

  const connectedChainIdRef = useRef<number | undefined>(undefined);

  const handleNetworkChange = async (newNetwork: string | number) => {
    const newNetworkChainId = Number(newNetwork);
    if (newNetworkChainId === connectedChainIdRef.current) {
      return;
    }
    const chainName = chainIdToNetworkName[newNetworkChainId];
    console.log(
      "primary-wallet-network-changed in trade provider",
      chainName,
      newNetworkChainId,
      displayNetworkName
    );
    const defaultPair = await getDefaultPair(chainName);
    if (!defaultPair) {
      // The chain the wallet moved to has no market to bind to. Keep the one
      // already on screen rather than clearing the terminal, and leave the ref
      // alone so a later resolve for this chain can still take effect.
      console.warn(`No default pair for ${chainName}; keeping current market`);
      return;
    }
    setBase(defaultPair.base);
    setQuote(defaultPair.quote);
    setPair(defaultPair);
    setStep(getDefaultScale(defaultPair.price, defaultPair.scales));

    connectedChainIdRef.current = newNetworkChainId;
  };

  // Keep a ref to the latest handler so the effect below can register once
  // (on mount) and deregister on unmount without going stale.
  const handleNetworkChangeRef = useRef(handleNetworkChange);
  handleNetworkChangeRef.current = handleNetworkChange;

  // connectedChainId (from MarketPageProvider) is already reactive to wagmi's
  // chain -- this replaces Dynamic's dynamicEvents listener with plain React
  // reactivity on the connected chain id.
  useEffect(() => {
    if (connectedChainId === undefined) return;
    handleNetworkChangeRef.current(connectedChainId);
  }, [connectedChainId]);

  /// get states for submitting orders
  // is this limit order?
  const [isLimit, setIsLimit] = useState(false);
  // slippage limit for market buy
  const [buySlippageLimit, setBuySlippageLimit] = useState(0.1);
  // slippage limit for market sell
  const [sellSlippageLimit, setSellSlippageLimit] = useState(0.1);
  // limit price for limit order
  const [limitPrice, setLimitPrice] = useState(
    pair ? pair.price : pairInput.price
  );
  // amount input displayed for limit/market order
  const [amount, setAmount] = useState<string>("");
  // quote amount for limit/market order
  const [quoteAmount, setQuoteAmount] = useState(0);
  // base amount for limit/market order
  const [baseAmount, setBaseAmount] = useState(0);
  // is this a bid?
  const [isBid, setIsBid] = useState(true);
  // matchN for limit order
  const [matchN, setMatchN] = useState(20);

  // address to receive order ownership and trade
  const [recipient, setRecipient] = useState(address);

  const {
    data: nativeBalance,
    status: nativeBalanceStatus,
    error: nativeBalanceError,
    queryKey: nativeBalanceQueryKey,
    refetch: refetchNativeBalance,
  } = useBalance({
    address,
  });

  const {
    data: baseBalanceAllowance,
    status: baseBalanceAllowanceStatus,
    error: baseBalanceAllowanceError,
    queryKey: baseBalanceAllowanceQueryKey,
    refetch: refetchBaseBalanceAllowance,
  } = useERC20BalanceAllowance(base, address as `0x${string}`, matchingEngine);

  // quote balance and allowance
  const {
    data: quoteBalanceAllowance,
    status: quoteBalanceAllowanceStatus,
    error: quoteBalanceAllowanceError,
    queryKey: quoteBalanceAllowanceQueryKey,
    refetch: refetchQuoteBalanceAllowance,
  } = useERC20BalanceAllowance(quote, address as `0x${string}`, matchingEngine);

  const trueBaseBalance = useMemo(() => {
    if (isNative(base)) {
      return Number(
        Decimal(
          formatUnits(
            nativeBalance?.value ?? BigInt(0),
            nativeBalance?.decimals ?? 18
          )
        ).toFixed(4)
      );
    }
    return Number(Decimal(baseBalanceAllowance?.balance ?? 0).toFixed(4));
  }, [nativeBalance, baseBalanceAllowance, base]);

  const trueQuoteBalance = useMemo(() => {
    if (isNative(quote)) {
      return Number(
        Decimal(formatUnits(nativeBalance?.value ?? BigInt(0), 18)).toFixed(4)
      );
    }
    return Number(Decimal(quoteBalanceAllowance?.balance ?? 0).toFixed(4));
  }, [nativeBalance, quoteBalanceAllowance, quote]);

  const isApprovalNeeded = () => {
    if (isBid) {
      if (isNative(quote)) {
        return false;
      }
      return quoteBalanceAllowance?.allowance < quoteAmount;
    } else {
      if (isNative(base)) {
        return false;
      }
      return baseBalanceAllowance?.allowance < baseAmount;
    }
  }

  const [approvalNeeded, setApprovalNeeded] = useState(isApprovalNeeded());

  /**
   * Price is always encoded on-chain with a fixed 8 decimals (see
   * `parseUnits(limitPrice.toString(), 8)` below) — this is a protocol-wide
   * convention (the broker decodes on-chain prices with the same fixed
   * `decimals=8`), not something the client should scale by token decimals.
   * But that fixed precision means a valid, nonzero price a user typed can
   * silently encode to raw value 0 for a low-nominal-price pair. Surface
   * that instead of letting a zero-price order go out quietly.
   */
  const limitPriceEncodesToZero = useMemo(() => {
    return isLimit && priceEncodesToZero(limitPrice, 8);
  }, [isLimit, limitPrice]);

  /**
   * The side of the order the user didn't type directly is derived from the
   * other (see TradingPanel's deriveBaseFromQuote/deriveQuoteFromBase). If
   * the user entered a nonzero amount but the derived counterpart amount is
   * 0, that's a dust order silently produced by rounding, not a deliberate
   * zero-size order.
   */
  const orderAmountIsDust = useMemo(() => {
    if (!Number(amount)) return false;
    return isBid ? baseAmount === 0 : quoteAmount === 0;
  }, [amount, isBid, baseAmount, quoteAmount]);

  useEffect(() => {
    if (isBid) {
      if (isNative(quote)) {
        setApprovalNeeded(false);
        return;
      }
      console.log(
        isNative(quote),
        quote.symbol,
        quoteBalanceAllowance?.allowance,
        quoteAmount,
        quoteBalanceAllowance?.allowance < quoteAmount,
        "quoteBalanceAllowance?.allowance"
      );
      setApprovalNeeded(quoteBalanceAllowance?.allowance < quoteAmount);
      return;
    } else {
      if (isNative(base)) {
        setApprovalNeeded(false);
        return;
      }
      console.log(
        isNative(base),
        base.symbol,
        baseBalanceAllowance?.allowance,
        baseAmount,
        baseBalanceAllowance?.allowance < baseAmount,
        "baseBalanceAllowance?.allowance"
      );
      setApprovalNeeded(baseBalanceAllowance?.allowance < baseAmount);
      return;
    }
  }, [
    baseBalanceAllowance,
    quoteBalanceAllowance,
    baseAmount,
    quoteAmount,
    quote,
    isBid,
    base,
    quote,
  ]);

  const approvalContractArgs = useMemo(() => {
    if (isBid) {
      return {
        abi: erc20Abi,
        address: quote.id as `0x${string}`,
        functionName: "approve",
        chainId: connectedChainId,
        args: [
          matchingEngine,
          parseUnits(
            "10000000000000000000000000000000000000",
            quote.decimals
          ).toString(),
        ],
      };
    } else {
      return {
        abi: erc20Abi,
        address: base.id as `0x${string}`,
        functionName: "approve",
        chainId: connectedChainId,
        args: [
          matchingEngine,
          parseUnits(
            "10000000000000000000000000000000000000",
            base.decimals
          ).toString(),
        ],
      };
    }
  }, [isBid, quote, base, matchingEngine]);

  const limitOrderContractArgs = useMemo(() => {
    if (isBid) {
      if (isNative(quote)) {
        // Buying `base` with native ETH: createOrder has no `limitBuyETH`
        // entry point anymore, so ETH is expressed as `quote: weth` plus a
        // matching `value` — the engine wraps it and refunds any leftover.
        const amount = parseUnits(quoteAmount.toString(), quote.decimals);
        return {
          abi: exchangeAbi,
          // Gated on `weth` too, not just `matchingEngine`: an undefined WETH
          // would otherwise encode `undefined` into the struct's `quote` slot.
          // `PlaceOrderButton` only checks `.address` before writing, so
          // withholding it here is what disables this path the same way an
          // unresolved `matchingEngine` already does.
          address: weth ? matchingEngine : undefined,
          functionName: "createOrder",
          chainId: connectedChainId,
          args: [{
            base: base.id,
            quote: weth,
            isBid: true,
            isLimit: true,
            orderId: 0,
            price: parseUnits(limitPrice.toString(), 8),
            amount,
            n: matchN,
            recipient: recipient ?? address,
            isMaker: true,
            slippageLimit: 0,
            deadline: 0,
          }],
          value: amount,
        };
      } else {
        return {
          abi: exchangeAbi,
          address: matchingEngine,
          functionName: "limitBuy",
          chainId: connectedChainId,
          args: [
              {
                base: base.id,
                quote: quote.id,
                price: parseUnits(limitPrice.toString(), 8),
                amount: parseUnits(quoteAmount.toString(), quote.decimals),
                isMaker: true,
                n: matchN,
                recipient: recipient ?? address,
              },
          ],
        };
      }
    } else {
      if (isNative(base)) {
        // Selling native ETH: `base: weth` plus a matching `value`, same
        // wrap-and-refund path as the buy side above.
        const amount = parseUnits(baseAmount.toString(), base.decimals);
        return {
          abi: exchangeAbi,
          // See the buy-side branch above for why this is gated on `weth`.
          address: weth ? matchingEngine : undefined,
          functionName: "createOrder",
          chainId: connectedChainId,
          args: [{
            base: weth,
            quote: quote.id,
            isBid: false,
            isLimit: true,
            orderId: 0,
            price: parseUnits(limitPrice.toString(), 8),
            amount,
            n: matchN,
            recipient: recipient ?? address,
            isMaker: true,
            slippageLimit: 0,
            deadline: 0,
          }],
          value: amount,
        };
      } else {
        return {
          abi: exchangeAbi,
          address: matchingEngine,
          functionName: "limitSell",
          chainId: connectedChainId,
          args: [
              {
                base: base.id,
                quote: quote.id,
                price: parseUnits(limitPrice.toString(), 8),
                amount: parseUnits(baseAmount.toString(), base.decimals),
                isMaker: true,
                n: matchN,
                recipient: recipient ?? address,
              },
          ],
        };
      }
    }
  }, [
    pair,
    isBid,
    base,
    quote,
    recipient,
    matchN,
    quoteAmount,
    baseAmount,
    limitPrice,
    weth,
  ]);

  const marketOrderContractArgs = useMemo(() => {
    if (isBid) {
      if (isNative(quote)) {
        // Buying `base` with native ETH, market order: same `quote: weth` +
        // matching `value` substitution as the limit-order branch above.
        const amount = parseEther(quoteAmount.toString());
        return {
          abi: exchangeAbi,
          // See limitOrderContractArgs above for why this is gated on `weth`.
          address: weth ? matchingEngine : undefined,
          functionName: "createOrder",
          chainId: connectedChainId,
          args: [{
            base: base.id,
            quote: weth,
            isBid: true,
            isLimit: false,
            orderId: 0,
            price: 0,
            amount,
            n: matchN,
            recipient: recipient ?? address,
            isMaker: true,
            slippageLimit: parseUnits(buySlippageLimit.toString(), 8),
            deadline: 0,
          }],
          value: amount,
        };
      } else {
        return {
          abi: exchangeAbi,
          address: matchingEngine,
          functionName: "marketBuy",
          chainId: connectedChainId,
          args: [
              {
                base: base.id,
                quote: quote.id,
                amount: parseUnits(quoteAmount.toString(), quote.decimals),
                isMaker: true,
                n: matchN,
                recipient: recipient ?? address,
                slippageLimit: parseUnits(buySlippageLimit.toString(), 8),
              },
          ],
        };
      }
    } else {
      if (isNative(base)) {
        // Selling native ETH, market order: `base: weth` + matching `value`.
        const amount = parseEther(baseAmount.toString());
        return {
          abi: exchangeAbi,
          // See limitOrderContractArgs above for why this is gated on `weth`.
          address: weth ? matchingEngine : undefined,
          functionName: "createOrder",
          chainId: connectedChainId,
          args: [{
            base: weth,
            quote: quote.id,
            isBid: false,
            isLimit: false,
            orderId: 0,
            price: 0,
            amount,
            n: matchN,
            recipient: recipient ?? address,
            isMaker: true,
            slippageLimit: parseUnits(sellSlippageLimit.toString(), 8),
            deadline: 0,
          }],
          value: amount,
        };
      } else {
        return {
          abi: exchangeAbi,
          address: matchingEngine,
          functionName: "marketSell",
          chainId: connectedChainId,
          args: [
              {
                base: base.id,
                quote: quote.id,
                amount: parseUnits(baseAmount.toString(), base.decimals),
                isMaker: true,
                n: matchN,
                recipient: recipient ?? address,
                slippageLimit: parseUnits(sellSlippageLimit.toString(), 8),
              },
          ],
        };
      }
    }
  }, [pair, isBid, base, quote, recipient, address, matchN, quoteAmount, baseAmount, weth]);

  // Create refs to persist contract args for gas estimation
  const limitOrderContractArgsForGasEstimation = useRef(limitOrderContractArgs);
  const marketOrderContractArgsForGasEstimation = useRef(
    marketOrderContractArgs
  );
  const approvalContractArgsForGasEstimation = useRef(approvalContractArgs);

  // recent trades
  const { data: recentTrades, status: recentTradesStatus } = useRecentTrades(
    displayNetworkName,
    base,
    quote
  );

  // update title based on pair price update
  useEffect(() => {
    const onBar = (data: SpotBarEvent) => {
      const [ticker] = data.id.split("-");
      if (ticker === pair.symbol) {
        document.title = `${adjustDecimalLength(data.price, 4)} | ${
          pair.base.symbol
        }/${pair.quote.symbol} | Iter ${displayNetworkName}`;
      }
    };
    eventBus.on("spot-bar-update", onBar);
    return () => {
      eventBus.off("spot-bar-update", onBar);
    };
  }, [pair.symbol, pair.base.symbol, pair.quote.symbol, displayNetworkName]);

  return (
    <>
      <TradeContext.Provider
        value={{
          pair: pairData,
          isConnected,
          isLimit,
          setIsLimit,
          buySlippageLimit,
          nativeBalance: Number(nativeBalance?.formatted ?? 0),
          nativeBalanceStatus,
          trueBaseBalance,
          trueQuoteBalance,
          baseBalanceAllowance,
          baseBalanceAllowanceStatus,
          refetchBaseBalanceAllowance: () => refetchBaseBalanceAllowance?.(),
          quoteBalanceAllowance: quoteBalanceAllowance,
          quoteBalanceAllowanceStatus,
          refetchQuoteBalanceAllowance: () => refetchQuoteBalanceAllowance?.(),
          setBuySlippageLimit,
          sellSlippageLimit,
          setSellSlippageLimit,
          limitPrice,
          setLimitPrice,
          quoteAmount,
          amount,
          setAmount,
          setQuoteAmount,
          baseAmount,
          setBaseAmount,
          isBid,
          setIsBid,
          matchN,
          setMatchN,
          recipient,
          setRecipient,
          limitOrderContractArgs,
          marketOrderContractArgs,
          approvalContractArgs,
          limitOrderContractArgsForGasEstimation:
            limitOrderContractArgsForGasEstimation.current,
          marketOrderContractArgsForGasEstimation:
            marketOrderContractArgsForGasEstimation.current,
          approvalContractArgsForGasEstimation:
            approvalContractArgsForGasEstimation.current,
          approvalNeeded,
          setApprovalNeeded,
          limitPriceEncodesToZero,
          orderAmountIsDust,
          orderbook,
          orderbookComputed,
          step,
          setStep,
          recentTrades,
        }}
      >
        {children}
      </TradeContext.Provider>
    </>
  );
};

export const useTradePageContext = () => {
  const context = useContext(TradeContext);
  if (!context) {
    throw new Error(
      "useTradePageContext must be used within a TradePageProvider"
    );
  }
  return context;
};
