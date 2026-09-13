"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount } from "wagmi";
import defaultTokenList from "@iter/token-list";
import { matchingEngineAddress } from "@/lib/deployments";
import {
  chainIds,
  chainIdToNetworkName,
  defaultConnectedChain,
  networkNameToSlug,
  PonderWssLinks,
  slugToNetworkName,
  supportedChains,
} from "@/consts";
import { useTokens } from "@/hooks/useTokens";
import { useMultichainTokens } from "@/hooks/useMultichainTokens";
import { useMultichainPairs } from "@/hooks/useMultichainPairs";
import { usePairs } from "@/hooks/usePairs";
import {
  SpotPair,
  SpotToken,
  SpotTokenWithBalance,
  SpotFillSummaryEvent,
  collapseFillSummary,
  streamToEvent,
} from "@/types";
import { Chain } from "viem";
import { useRouter } from "next/navigation";
import { setSourceChainOnUrl, siblingChainUrls } from "@/lib/routing/chainParams";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useTokenlistBalances } from "@/hooks/useTokenlistBalances";
import { QueryStatus } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { useTrader } from "@/hooks/useTrader";
import type { BalanceSnapshot } from "@/lib/balances/report";

export interface TokenData {
  tokens: SpotToken[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
}

interface MarketContextType {
  displayNetworkName: string;
  setDisplayNetworkName: (networkName: string) => void;
  displayNetworkSlug: string;
  setDisplayNetworkSlug: (slug: string) => void;
  displayChainId: number | undefined;
  setDisplayChainId: (chainId: number) => void;
  connectedNetworkName: string;
  connectedNetworkSlug: string;
  connectedChainId: number | undefined;
  switchToConnectedNetwork: () => void;
  isConnectDisplayNetworkDifferent: boolean;
  router: any;
  address: `0x${string}` | undefined;
  isConnected: boolean;
  chain: Chain | undefined;
  tokenListWithBalance: SpotTokenWithBalance[];
  tokenListWithBalanceStatus: QueryStatus;
  tokenListWithBalanceError: Error | null;
  tokenListWithBalanceHoldings: SpotTokenWithBalance[];
  accountValueUSD: number | undefined;
  /** Which chain Explore is narrowed to, or null for every served chain. */
  chainFilter: string | null;
  setChainFilter: (chain: string | null) => void;
  defaultTokenData: TokenData;
  defaultTokenDataLoading: boolean;
  defaultTokenDataError: Error | null;
  newTokenData: TokenData;
  newTokenDataLoading: boolean;
  newTokenDataError: Error | null;
  topGainersTokenData: TokenData;
  topGainersTokenDataLoading: boolean;
  topGainersTokenDataError: Error | null;
  topVolumeTokenData: TokenData;
  topVolumeTokenDataLoading: boolean;
  topVolumeTokenDataError: Error | null;
  defaultSpotPairData: {
    pairs: SpotPair[];
    totalCount: number;
    totalPages: number;
    pageSize: number;
  };
  defaultSpotPairDataLoading: boolean;
  defaultSpotPairDataError: Error | null;
  spotPairWatchlist: string[];
  spotPairWatchlistLoading: boolean;
  spotPairWatchlistError: Error | null;
  tokenWatchlist: string[];
  tokenWatchlistLoading: boolean;
  tokenWatchlistError: Error | null;
  watchlistPairs: SpotPair[];
  watchlistTokens: SpotToken[];
  matchingEngine: `0x${string}` | undefined;
  traderData: BalanceSnapshot | undefined;
  traderDataLoading: boolean;
  traderDataError: Error | null;
  marketWebSocketStatus:
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected";
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketPageProvider = ({
  children,
  networkSlugInput,
}: {
  children: React.ReactNode;
  networkSlugInput?: string;
}) => {
  const { address, isConnected, chain } = useAccount();

  const supportedNetworks = supportedChains;

  const chainName =
    chain !== undefined &&
    supportedNetworks.includes((chain as { name: string }).name)
      ? (chain as { name: string }).name
      : defaultConnectedChain;

  const router = useRouter();
  const requestedNetworkName = networkSlugInput
    ? slugToNetworkName[networkSlugInput]
    : undefined;
  const initialNetworkName = requestedNetworkName && supportedNetworks.includes(requestedNetworkName)
    ? requestedNetworkName
    : chainName;
  const [displayNetworkName, setDisplayNetworkName] = useState(initialNetworkName);
  const [connectedNetworkName, setConnectedNetworkName] = useState(
    chainName
  );
  const [displayNetworkSlug, setDisplayNetworkSlug] = useState(
    networkNameToSlug[initialNetworkName]
  );
  const [connectedNetworkSlug, setConnectedNetworkSlug] = useState(
    networkNameToSlug[chainName]
  );
  const [displayChainId, setDisplayChainId] = useState(
    chainIds[initialNetworkName]
  );
  const [connectedChainId, setConnectedChainId] = useState(
    chainIds[chainName]
  );

  // Update network states when chain changes on connected network
  useEffect(() => {
    setConnectedNetworkName(chainName);
    setConnectedNetworkSlug(networkNameToSlug[chainName]);
    setConnectedChainId(chainIds[chainName]);
  }, [chain, supportedNetworks, networkSlugInput]);

  const isConnectDisplayNetworkDifferent = useMemo(() => {
    return connectedNetworkName !== displayNetworkName;
  }, [connectedNetworkName, displayNetworkName]);

  // prefetch the same page on the other chains (page-first URLs)
  useEffect(() => {
    const { pathname, search } = window.location;
    const supportedSlugs = supportedNetworks.map((name) => networkNameToSlug[name]);
    const otherSlugs = supportedSlugs.filter((slug) => {
      const params = new URLSearchParams(search);
      return slug !== (params.get("chain") ?? params.get("fromchain"));
    });
    siblingChainUrls(pathname, search, otherSlugs).forEach((url) => {
      router.prefetch(url);
    });
  }, [router, supportedNetworks]);

  const switchToConnectedNetwork = (chainId?: number) => {
    const { pathname, search } = window.location;
    const chainName = chainId ? chainIdToNetworkName[chainId] : defaultConnectedChain;
    const newSlug = networkNameToSlug[chainName];
    const newUrl = setSourceChainOnUrl(pathname, search, newSlug);

    // Trade reloads its server-rendered orderbook/pair, so do a real navigation.
    if (pathname.startsWith("/trade")) {
      if (displayNetworkName !== chainName) {
        window.history.pushState({}, "", newUrl);
        window.location.href = newUrl;
      }
      return;
    }

    setConnectedNetworkName(chainName);
    setConnectedNetworkSlug(newSlug);
    setConnectedChainId(chainIds[chainName]);
    setDisplayNetworkName(chainName);
    setDisplayNetworkSlug(newSlug);
    setDisplayChainId(chainIds[chainName]);
    window.history.pushState({}, "", newUrl);
  };

  /**
   * The shelves and the tape are CROSS-CHAIN by default.
   *
   * They used to read `displayNetworkName`, so Explore showed one chain's
   * "top gainers" under a heading that names no chain. `chainFilter` narrows
   * them back to one when the reader asks; null means every served chain.
   *
   * The filter restricts the FAN-OUT rather than trimming merged rows, because
   * discarding after the merge returns fewer rows than asked and a filtered
   * shelf would look nearly empty. See `useMultichainTokens`.
   *
   * Page 1 at these sizes is exactly what a client may merge safely: anything in
   * the global top N is in its own chain's top N, so N rows per chain contain
   * every candidate.
   */
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const filterChains = useMemo(
    () => (chainFilter ? [chainFilter] : undefined),
    [chainFilter],
  );

  const defaultTokens = useMultichainTokens(20, 1, "", "listed", filterChains);
  const newTokens = useMultichainTokens(4, 1, "new", "listed", filterChains);
  const gainerTokens = useMultichainTokens(4, 1, "top-gainer", "listed", filterChains);
  const volumeTokens = useMultichainTokens(4, 1, "top-volume", "listed", filterChains);

  // Adapted to the shape every consumer already reads. `totalCount` is the rows
  // actually held: a cross-chain total would have to sum per-chain counts the
  // gateways report independently, and no caller paginates these shelves.
  const asTokenData = (tokens: unknown[], pageSize: number) => ({
    tokens,
    totalCount: tokens.length,
    totalPages: 1,
    pageSize,
  });

  const defaultTokenData = asTokenData(defaultTokens.tokens, 20) as TokenData;
  const defaultTokenDataLoading = defaultTokens.isLoading;
  const defaultTokenDataError = null;
  const newTokenData = asTokenData(newTokens.tokens, 4) as TokenData;
  const newTokenDataLoading = newTokens.isLoading;
  const newTokenDataError = null;
  const topGainersTokenData = asTokenData(gainerTokens.tokens, 4) as TokenData;
  const topGainersTokenDataLoading = gainerTokens.isLoading;
  const topGainersTokenDataError = null;
  const topVolumeTokenData = asTokenData(volumeTokens.tokens, 4) as TokenData;
  const topVolumeTokenDataLoading = volumeTokens.isLoading;
  const topVolumeTokenDataError = null;

  // get token list with balance
  const {
    data: tokenListWithBalance,
    holdings: tokenListWithBalanceHoldings,
    accountValueUSD,
    status: tokenListWithBalanceStatus,
    error: tokenListWithBalanceError,
  } = useTokenlistBalances(
    displayNetworkName,
    address,
    defaultTokenList.groupTokens[
      displayNetworkName as keyof typeof defaultTokenList.groupTokens
    ]?.["iter_native"]?.[0] ?? undefined
  );

  // Markets are cross-chain too, and `totalCount` is SUMMED across the chains
  // that answered — which is what the Markets tile reports. Counting one chain
  // under a heading that names none is what made the tape read "1 chains".
  const { data: multichainPairs, isLoading: defaultSpotPairDataLoading } =
    useMultichainPairs(20, 1, "", filterChains);
  const defaultSpotPairData = multichainPairs;
  const defaultSpotPairDataError = null;

  // get watchlist data for spot pairs
  const {
    watchlist: spotPairWatchlist,
    isLoading: spotPairWatchlistLoading,
    error: spotPairWatchlistError,
  } = useWatchlist("spot", address);

  const watchlistPairs = useMemo(() => {
    return defaultSpotPairData?.pairs?.filter((pair: SpotPair) =>
      spotPairWatchlist.includes(pair.id)
    );
  }, [spotPairWatchlist, defaultSpotPairData]);

  // get watchlist data for tokens
  const {
    watchlist: tokenWatchlist,
    isLoading: tokenWatchlistLoading,
    error: tokenWatchlistError,
  } = useWatchlist("token", address);

  const watchlistTokens = useMemo(() => {
    return defaultTokenData?.tokens?.filter((token: SpotToken) =>
      tokenWatchlist.includes(token.id)
    );
  }, [tokenWatchlist, defaultTokenData]);

  /// get states for submitting approvals
  //
  // Resolved through `@iter/deployments`, not the token list. The token list's RISE
  // entry still names a pre-swap-support MatchingEngine (0x1D66DF6C...) whose swapRouter()
  // and poolFactory() revert, so reading it here would point every approval and order at
  // the wrong contract. See lib/deployments.ts.
  const matchingEngine = useMemo(
    () => matchingEngineAddress(connectedNetworkName),
    [connectedNetworkName],
  );

  // make websocket on provider level
  const socketRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [marketWebSocketStatus, setMarketWebSocketStatus] =
    useState<MarketContextType["marketWebSocketStatus"]>("disconnected");
  // Set on unmount (or before a dep-change reconnect) so a torn-down
  // provider never schedules a reconnect for a socket nobody is using.
  const disposedRef = useRef(false);
  // Function to handle WebSocket connection
  const connectWebSocket = useRef((address: `0x${string}` | undefined) => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      isConnectingRef.current ||
      address === undefined
    ) {
      return;
    }

    isConnectingRef.current = true;
    setMarketWebSocketStatus(
      reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
    );
    const socket = new WebSocket(PonderWssLinks[displayNetworkName]);
    socketRef.current = socket;

    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 5000; // 5 seconds

    const cleanup = () => {
      isConnectingRef.current = false;
      if (socketRef.current === socket) {
        socketRef.current = null;
        // Detach first: cleanup is also used by the error path, and closing a
        // socket with onclose attached would schedule a second reconnect.
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };

    socket.onopen = () => {
      console.log("Spot Recent Overall Trades WebSocket connected");
      isConnectingRef.current = false;
      setMarketWebSocketStatus("connected");
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // subscribe to recent overall trades
      socket.send(
        JSON.stringify({
          id: "1",
          method: "spot.trades.subscribe.pairs.all",
          params: null,
        })
      );
      // subscribe to rescent token price
      socket.send(
        JSON.stringify({
          id: "2",
          method: "spot.trades.subscribe.tokens.all",
          params: null,
        })
      );
    };

    socket.onclose = () => {
      console.log("Spot Recent Overall Trades WebSocket disconnected");
      if (socketRef.current !== socket) return;
      cleanup();

      // Don't schedule a reconnect once the provider has been torn down.
      if (disposedRef.current) {
        setMarketWebSocketStatus("disconnected");
        return;
      }

      // Only attempt to reconnect if we haven't exceeded max attempts
      if (
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS &&
        !reconnectTimerRef.current
      ) {
        reconnectAttemptsRef.current++;
        const attempt = reconnectAttemptsRef.current;
        console.log(
          `Attempting to reconnect (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`
        );
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (disposedRef.current) return;
          connectWebSocket(address);
        }, RECONNECT_DELAY);
        setMarketWebSocketStatus("reconnecting");
      } else {
        setMarketWebSocketStatus("disconnected");
        console.log(
          "Max reconnection attempts reached. Please refresh the page to try again."
        );
      }
    };

    socket.onerror = (err) => {
      console.error("Spot Recent Overall Trades WebSocket error", err);
      // Let onclose perform the single reconnect decision. Do not close here:
      // closing from onerror while onclose is still attached can enqueue two
      // timers and create connection churn.
    };

    socket.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Ignore malformed upstream frames without interrupting the live tape.
        return;
      }

      // Handle server ping
      if (data.method === "ping") {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ method: "pong" }));
        }
        return;
      }

      if (data.result === null) {
        console.log(`Spot recent overall trades for Iter is subscribed`);
        return;
      }

      /*
       * Unwrap `WsBatch` before decoding. The gateway's coalescer is the ONLY
       * publish path (ws/coalescer.ts), so every topic arrives as
       * `{ t, ps, s, d }` — and `streamToEvent` reads the event id at
       * `stream[0]`, which is `undefined` on that object. This handler passed
       * the wrapper straight in, so it decoded null and dropped every overall-
       * trades frame on the floor. Exactly the bug OrderPageProvider had on the
       * account socket; this is the same fix.
       *
       * Both shapes are accepted, so a gateway older than the coalescer that
       * still sends a bare tuple keeps working and no coordinated deploy is
       * needed.
       */
      const frames: unknown[] = Array.isArray(data)
        ? [data]
        : Array.isArray(data?.d)
          ? data.d
          : [];

      for (const frame of frames) {
        const parsedEvent = streamToEvent(frame as never);
        switch (parsedEvent?.eventId) {
          case "spotTrade":
            eventBus.emit("spot-recent-overall-trades-update", parsedEvent);
            break;
          // One transaction's fills as a single frame, emitted as ONE trade.
          // /api/trades/all groups on the same key, so expanding here would make
          // the live tape disagree with the page it was loaded onto: one row for
          // a sweep on load, twenty appended when the next one lands.
          //
          // Cast because the discriminant does not narrow here: another member
          // of streamToEvent's return union types its own eventId as a plain
          // string, so TS keeps it in the union past the case label.
          case "spotFillSummary":
            eventBus.emit(
              "spot-recent-overall-trades-update",
              collapseFillSummary(parsedEvent as SpotFillSummaryEvent),
            );
            break;
          default:
            break;
        }
      }
    };
  }).current;

  // Only connect if we don't have a connection && address is defined from market page provider
  useEffect(() => {
    disposedRef.current = false;
    if (!socketRef.current && address) {
      connectWebSocket(address);
    }

    // Tear down on unmount (and before this effect reconnects for a new
    // address) so the socket, its handlers, and any pending reconnect
    // timer never outlive this provider instance.
    return () => {
      disposedRef.current = true;
      setMarketWebSocketStatus("disconnected");
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socketRef.current = null;
      }
    };
  }, [address]);

  const connectedChainIdRef = useRef<number | undefined>(undefined);

  const handleNetworkChange = (newNetwork: string | number) => {
    const newNetworkChainId = Number(newNetwork);
    if (newNetworkChainId === connectedChainIdRef.current) {
      return;
    }
    console.log(
      "primary-wallet-network-changed in market provider",
      newNetworkChainId
    );
    switchToConnectedNetwork(newNetworkChainId);
    connectedChainIdRef.current = newNetworkChainId;
  };

  // Keep a ref to the latest handler so the effect below can register once
  // (on mount) and deregister on unmount without going stale.
  const handleNetworkChangeRef = useRef(handleNetworkChange);
  handleNetworkChangeRef.current = handleNetworkChange;

  // wagmi's `chain` (from useAccount above) is already reactive to wallet
  // network switches -- this replaces Dynamic's dynamicEvents listener with
  // plain React reactivity on the connected chain id.
  useEffect(() => {
    if (chain?.id === undefined) return;
    handleNetworkChangeRef.current(chain.id);
  }, [chain?.id]);

  // get trader data
  const {
    data: traderData,
    isLoading: traderDataLoading,
    error: traderDataError,
  } = useTrader(address ?? "");

  return (
    <>
      <MarketContext.Provider
        value={{
          displayNetworkName,
          setDisplayNetworkName,
          displayNetworkSlug,
          setDisplayNetworkSlug,
          displayChainId,
          setDisplayChainId,
          connectedNetworkName,
          connectedNetworkSlug,
          connectedChainId,
          switchToConnectedNetwork,
          isConnectDisplayNetworkDifferent,
          router,
          address,
          isConnected,
          chain: chain as Chain,
          tokenListWithBalance,
          tokenListWithBalanceStatus,
          tokenListWithBalanceError,
          tokenListWithBalanceHoldings,
          accountValueUSD,
          chainFilter,
          setChainFilter,
          defaultTokenData,
          defaultTokenDataLoading,
          defaultTokenDataError,
          newTokenData,
          newTokenDataLoading,
          newTokenDataError,
          topGainersTokenData,
          topGainersTokenDataLoading,
          topGainersTokenDataError,
          topVolumeTokenData,
          topVolumeTokenDataLoading,
          topVolumeTokenDataError,
          defaultSpotPairData,
          defaultSpotPairDataLoading,
          defaultSpotPairDataError,
          spotPairWatchlist,
          spotPairWatchlistLoading,
          spotPairWatchlistError,
          tokenWatchlist,
          tokenWatchlistLoading,
          tokenWatchlistError,
          watchlistPairs,
          watchlistTokens,
          matchingEngine,
          traderData,
          traderDataLoading,
          traderDataError,
          marketWebSocketStatus,
        }}
      >
        {children}
      </MarketContext.Provider>
    </>
  );
};

export const useMarketPageContext = () => {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error(
      "useMarketPageContext must be used within a MarketPageProvider"
    );
  }
  return context;
};

/**
 * The same context, for components that legitimately render OUTSIDE a
 * MarketPageProvider and can do something sensible without one.
 *
 * There is exactly one such case today: `LoginRouter`. It is mounted in
 * AppShell, which DOES render inside a provider — so this is defensive rather
 * than necessary, and deliberately so. Its only job is a redirect, and the
 * throwing hook below would take down the entire app shell rather than skip one
 * navigation. It needs a chain slug to build the /welcome URL, and
 * `buildPageUrl` already falls back to DEFAULT_CHAIN_SLUG when it is undefined.
 *
 * Reach for this ONLY when null is genuinely handled. The throwing hook above
 * stays the default on purpose: a market surface that silently renders with no
 * chain is a much worse failure than a loud one.
 */
export const useOptionalMarketPageContext = () => useContext(MarketContext);
