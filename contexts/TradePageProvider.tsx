"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount, useBalance } from "wagmi";
import { MERA_CONNECTOR_ID } from "@/lib/wallet/meraConnector";
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
import { contractAddress, wethAddress } from "@/lib/deployments";
import { LadderBuyerABI } from "@iter/abis";
import { isNative } from "@/utils/order";
import { useLadderBook } from "@/hooks/useLadderBook";
import { ladderSellFloor, quoteLadderBuy, type LadderBuyQuote } from "@/lib/launch/ladderBuy";
import { useMarketPageContext } from "./MarketPageProvider";
import { recordRecentMarket } from "@/lib/markets/recentMarkets";
import { networkNameToSlug } from "@/consts";
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
import { chainIdToNetworkName, chainIds, PonderWssLinks } from "@/consts";
import { getDefaultPair } from "@/queries/server/pairs";
import { slippagePctToEngine } from "@/lib/orders/slippage";

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
  /**
   * Set when this market is a launch coin still selling its ladder and the
   * ticket is on Market + Buy: what the buy is expected to deliver. The market
   * order is then sent as a fill-or-refund limit order (see lib/launch/ladderBuy).
   */
  ladderBuyQuote: LadderBuyQuote | null;
  /** True for a pre-graduation launch market, either side. */
  ladderMarket: boolean;
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
  const { connector: activeConnector } = useAccount();

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

  // Every market opened on Pro joins the picker's Recent tab — including one
  // reached by a pair link or a pasted address, which the picker no longer
  // lists by browsing. Keyed by the pair's address on this network.
  useEffect(() => {
    if (pairData?.id) recordRecentMarket(networkNameToSlug[displayNetworkName], pairData.id);
  }, [pairData?.id, displayNetworkName]);

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

  /*
   * Seeded with the chain the PAGE is showing, not undefined.
   *
   * `connectedChainId` is a real chain id on the first render even with no
   * wallet connected (MarketPageProvider initialises it from the displayed
   * chain). With this ref starting empty, the effect below read that first
   * value as a network CHANGE and replaced the market with the chain's default
   * pair — so any /trade/pro link to a non-default market showed it for about
   * two seconds, then the chart and order book snapped to the default while the
   * title kept the market the link named. Measured on production: base=TWALL
   * showed TWALL at 1–2 s and TITER from 3 s on. Only a wallet moving to a
   * different chain than the one on screen should swap the market.
   */
  const connectedChainIdRef = useRef<number | undefined>(chainIds[displayNetworkName]);

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
    // With no wallet, `connectedChainId` is the app's DEFAULT chain, not a wallet
    // that moved. Treating it as one swapped every disconnected visitor of a
    // non-default-chain market to that default chain's first pair: a RISE
    // LQJOG55/tUSD link rendered TITER/USDC under a header still naming LQJOG55
    // (found by the ladder-launch e2e, 2026-10-02).
    if (!isConnected) return;
    // The passkey wallet FOLLOWS the page (MarketPageProvider switches it to the
    // displayed chain), so its chain changes are the page's doing, not a wallet
    // moving away. Swapping the market on them replaced every RISE market with
    // RISE's first pair the moment a resumed passkey settled (ladder-launch e2e).
    if (activeConnector?.id === MERA_CONNECTOR_ID) return;
    handleNetworkChangeRef.current(connectedChainId);
  }, [connectedChainId, isConnected, activeConnector?.id]);

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

  /*
   * FOLLOW THE PAIR THE PAGE WAS GIVEN.
   *
   * Picking a market in Pro is a <Link> to this same route with new search
   * params. The App Router re-renders the server page with the new pair but
   * REUSES this provider, and `useState(pairInput)` only reads its argument on
   * the first render — so the header said TWALL/USDC while the chart, the order
   * book and the order form stayed on TITER/USDC, and an order placed there went
   * to the market the reader had just left. Measured: the switch made no chart
   * and no order-book request at all.
   *
   * Remounting (a `key` on the provider) would also fix it, but would rebuild
   * the TradingView widget on every switch; TradingViewChart keeps one widget and
   * calls `setSymbol` precisely to avoid that. So the market state is re-adopted
   * here, the per-market order form is cleared — a limit price typed for one
   * market is meaningless on another — and the reader's preferences (limit vs
   * market, side, slippage) are kept.
   */
  const adoptedPairId = useRef(pairInput.id);
  useEffect(() => {
    if (pairInput.id === adoptedPairId.current) return;
    adoptedPairId.current = pairInput.id;
    setBase(baseInput);
    setQuote(quoteInput);
    setPair(pairInput);
    setOrderbook(orderbookInput);
    setStep(getDefaultScale(pairInput.price, pairInput.scales));
    setLimitPrice(pairInput.price);
    setAmount("");
    setQuoteAmount(0);
    setBaseAmount(0);
  }, [pairInput, baseInput, quoteInput, orderbookInput]);

  const {
    data: nativeBalance,
    status: nativeBalanceStatus,
    error: nativeBalanceError,
    queryKey: nativeBalanceQueryKey,
    refetch: refetchNativeBalance,
  } = useBalance({
    address,
  });

  // A launch coin selling its ladder cannot be traded with a market order — the
  // 1% slippage cap stops it at the current step — and one limit order reaches
  // only one step. So the ticket's ordinary market Buy and Sell go through
  // `LadderBuyer` (up to five fill-or-refund orders in one transaction), and the
  // allowance they need is to IT, exact amount. The Limit tab still goes to the
  // engine. See lib/launch/ladderBuy.
  const ladder = useLadderBook(displayNetworkName, base?.id, quote?.id);
  const ladderBuyer = contractAddress(displayNetworkName, "ladderBuyer");
  const ladderRoute = Boolean(ladder.active && !isLimit && ladderBuyer && !isNative(quote) && !isNative(base));
  const orderSpender = ladderRoute ? ladderBuyer : matchingEngine;
  const ladderBuyQuote = useMemo(() => {
    if (!ladderRoute || !isBid) return null;
    let quoteIn: bigint;
    try {
      quoteIn = parseUnits(quoteAmount.toString(), quote.decimals);
    } catch {
      return null;
    }
    return quoteLadderBuy(ladder.steps, quoteIn, quote.decimals, buySlippageLimit, ladder.takerFeeNum);
  }, [ladderRoute, ladder, isBid, quote, quoteAmount, buySlippageLimit]);

  const {
    data: baseBalanceAllowance,
    status: baseBalanceAllowanceStatus,
    error: baseBalanceAllowanceError,
    queryKey: baseBalanceAllowanceQueryKey,
    refetch: refetchBaseBalanceAllowance,
  } = useERC20BalanceAllowance(base, address as `0x${string}`, orderSpender);

  // quote balance and allowance
  const {
    data: quoteBalanceAllowance,
    status: quoteBalanceAllowanceStatus,
    error: quoteBalanceAllowanceError,
    queryKey: quoteBalanceAllowanceQueryKey,
    refetch: refetchQuoteBalanceAllowance,
  } = useERC20BalanceAllowance(quote, address as `0x${string}`, orderSpender);

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
          orderSpender,
          ladderRoute
            ? parseUnits(quoteAmount.toString(), quote.decimals).toString()
            : parseUnits(
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
          orderSpender,
          ladderRoute
            ? parseUnits(baseAmount.toString(), base.decimals).toString()
            : parseUnits(
                "10000000000000000000000000000000000000",
                base.decimals
              ).toString(),
        ],
      };
    }
    // connectedChainId: the passkey wallet resumes on Arc and then follows the
    // page, so args memoised before that carried Arc's id and every RISE
    // approval refused with "chain mismatch" (found by the ladder-launch e2e).
  }, [isBid, quote, base, orderSpender, ladderRoute, quoteAmount, baseAmount, connectedChainId]);

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
    connectedChainId,
  ]);

  const marketOrderContractArgs = useMemo(() => {
    if (ladderRoute && ladderBuyer) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const lastPrice = BigInt(Math.max(1, Math.round(Number(pair.price ?? 0) * 1e8)));
      if (isBid) {
        // No step left to walk fills nothing on the ladder; bound the order at
        // the last price rather than send it unpriced.
        const maxPrice = ladderBuyQuote && ladderBuyQuote.limitPrice > BigInt(0)
          ? ladderBuyQuote.limitPrice
          : (lastPrice * BigInt(Math.round((100 + buySlippageLimit) * 100))) / BigInt(10_000);
        return {
          abi: LadderBuyerABI,
          address: ladderBuyer,
          functionName: "buy",
          chainId: connectedChainId,
          args: [
            base.id,
            quote.id,
            parseUnits(quoteAmount.toString(), quote.decimals),
            maxPrice,
            ladderBuyQuote?.minBaseOut ?? BigInt(0),
            recipient ?? address,
            deadline,
          ],
        };
      }
      const minPrice = ladderSellFloor(lastPrice, sellSlippageLimit);
      const baseIn = parseUnits(baseAmount.toString(), base.decimals);
      // What the floor guarantees, in quote units, net of the taker fee.
      const atFloor = base.decimals >= quote.decimals
        ? (baseIn * minPrice) / BigInt(100_000_000) / BigInt(10) ** BigInt(base.decimals - quote.decimals)
        : ((baseIn * minPrice) / BigInt(100_000_000)) * BigInt(10) ** BigInt(quote.decimals - base.decimals);
      const minQuoteOut = atFloor - (atFloor * BigInt(ladder.takerFeeNum)) / BigInt(100_000_000);
      return {
        abi: LadderBuyerABI,
        address: ladderBuyer,
        functionName: "sell",
        chainId: connectedChainId,
        args: [base.id, quote.id, baseIn, minPrice, minQuoteOut, recipient ?? address, deadline],
      };
    }
    // Market orders are TAKERS (`isMaker: false`) on every branch below. With
    // `isMaker: true` the engine rests whatever the book does not fill as a limit
    // order at the band edge (OrderPlacementLib.detMake) — so a "market buy" that
    // met a thin book quietly became a resting bid. As a taker the remainder goes
    // to the pair's pool and whatever the pool does not take is refunded in the
    // same transaction; PlaceOrderButton reads the receipt and says which happened.
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
            isMaker: false,
            slippageLimit: slippagePctToEngine(buySlippageLimit),
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
                isMaker: false,
                n: matchN,
                recipient: recipient ?? address,
                slippageLimit: slippagePctToEngine(buySlippageLimit),
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
            isMaker: false,
            slippageLimit: slippagePctToEngine(sellSlippageLimit),
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
                isMaker: false,
                n: matchN,
                recipient: recipient ?? address,
                slippageLimit: slippagePctToEngine(sellSlippageLimit),
              },
          ],
        };
      }
    }
  }, [pair, isBid, base, quote, recipient, address, matchN, quoteAmount, baseAmount, weth, ladderRoute, ladderBuyer, ladder.takerFeeNum, ladderBuyQuote, buySlippageLimit, sellSlippageLimit, connectedChainId]);

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
          ladderBuyQuote,
          ladderMarket: ladderRoute,
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
