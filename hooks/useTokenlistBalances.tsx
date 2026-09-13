"use client";
import { useEffect } from "react";
import { useConfig } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { multicall, getBalance } from "@wagmi/core";
import { erc20Abi, formatUnits } from "viem";
import { getTokens } from "@/queries/server/tokens";
import { SpotTokenWithBalance, SpotToken } from "@/types/tables/tokens";
import { eventBus, SpotBalanceUpdateEvent } from "@/utils/events";
import { SpotTradeEvent } from "@/types";

interface AccountTokenlistBalances {
  tokenlistBalances: SpotTokenWithBalance[];
  accountValueUSD: number;
}

export const useTokenlistBalances = (
  networkName: string,
  address: string | undefined,
  nativeToken: any
) => {
  const queryClient = useQueryClient();
  const config = useConfig();
  const tokenlistQueryKey = ["tokens", "", networkName];
  const queryKey = [`tokenlistBalances-${networkName}-${address}`];

  const fetchTokenList = async () => {
    const cached = queryClient.getQueryData(tokenlistQueryKey);
    if (cached) {
      return cached;
    }
    const tokens = await getTokens(networkName, 1000, 1, "");
    queryClient.setQueryData(tokenlistQueryKey, tokens);
    return tokens;
  };

  const queryTokenlist = async () => {
    try {
      return await fetchTokenList();
    } catch (error) {
      console.error("token fetching error", error);
    }
  };

  const fetchBalances = async (tokens: SpotToken[]) => {
    if (tokens === undefined) {
      return [];
    }
    const totalTokenContractData = tokens
      .filter((token) => token.id !== undefined)
      .map((token) => {
        return {
          address: token.id as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        };
      });
    const balances = await multicall(config, {
      contracts: totalTokenContractData,
      allowFailure: false,
    });
    const nativeBalance = await getBalance(config, {
      address: address as `0x${string}`,
    });
    const totalTokenContractDataBalance = tokens.map((token, index) => {
      // `nativeToken?` — a chain may legitimately have NO iter_native entry. On Arc the
      // native gas asset IS the USDC ERC-20 at 0x3600…, one pool of funds behind two
      // interfaces, so there is no separate row to substitute onto: naming USDC here
      // would format an 18-decimal native value with its 6 decimals (off by 10^12), and
      // naming the wrapped-native token would render the same balance twice. An empty
      // iter_native leaves every row on its ERC-20 balanceOf, which is the correct view.
      const balance = (
        nativeToken?.address && token.id === nativeToken.address
          ? nativeBalance.value
          : balances[index]
      ) as bigint;
      const balanceNumber =
        Number(formatUnits(balance, token.decimals)) < 0.0000001
          ? 0
          : Number(formatUnits(balance, token.decimals));
      const valueUSD = balanceNumber * token.priceUSD;
      return {
        ...token,
        balance: balanceNumber,
        valueUSD,
      };
    });

    return totalTokenContractDataBalance;
  };

  const fetchTokenlistBalances = async () => {
    const tokenlist = await queryTokenlist();
    queryClient.setQueryData(tokenlistQueryKey, tokenlist);
    const tokenlistBalances: SpotTokenWithBalance[] = await fetchBalances(
      tokenlist.tokens
    );
    const accountValueUSD = tokenlistBalances.reduce(
      (acc, token) => acc + token.valueUSD,
      0
    );
    queryClient.setQueryData(queryKey, (old: SpotTokenWithBalance[]) => {
      return {
        tokenlistBalances,
        accountValueUSD,
      };
    });
    // The day-bucket snapshot used to be written here, on every refresh.
    // `reportUsdBalance` now requires a signature (the figure is rendered on
    // public profiles, so it has to be attributable to the wallet claiming it),
    // and a wallet prompt cannot hang off a background balance read — this
    // query runs on an interval and on every trade event. Recording is now an
    // explicit, once-a-day action a surface takes deliberately; see
    // `lib/balances/report.ts`.
    return { tokenlistBalances, accountValueUSD } as AccountTokenlistBalances;
  };

  const { data, status, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchTokenlistBalances(),
    enabled: !!address && !!networkName,
    staleTime: 30000, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
    retryDelay: 1000,
  });

  useEffect(() => {
    const handleBalanceUpdate = (data: SpotBalanceUpdateEvent) => {
      queryClient.setQueryData(queryKey, (old: AccountTokenlistBalances) => {
        const newData = old.tokenlistBalances.map((token) => {
          if (token.id === data.token.id) {
            const newValueUSD = data.balance * token.priceUSD;
            return { ...token, balance: data.balance, valueUSD: newValueUSD };
          }
          return token;
        });
        const accountValueUSD = newData.reduce(
          (acc, token) => acc + token.valueUSD,
          0
        );
        return { tokenlistBalances: newData, accountValueUSD };
      });
    };

    const handleTradeUpdate = (data: SpotTradeEvent) => {
      if (data.account === address) {
        if (data.isBid) {
          queryClient.setQueryData(queryKey, (old: AccountTokenlistBalances) => {
            const newData = old.tokenlistBalances.map((token) => {
              if (token.id === data.quote) {
                const newBalance = token.balance - data.quoteAmount;
                const newValueUSD = newBalance * token.priceUSD;
                return { ...token, balance: newBalance, valueUSD: newValueUSD };
              } else if (token.id === data.base) {
                const newBalance = token.balance + data.baseAmount;
                const newValueUSD = newBalance * token.priceUSD;
                return { ...token, balance: newBalance, valueUSD: newValueUSD };
              }
              return token;
            });
            const accountValueUSD = newData.reduce(
              (acc, token) => acc + token.valueUSD,
              0
            );
            return { tokenlistBalances: newData, accountValueUSD };
          });
        } else {
          queryClient.setQueryData(queryKey, (old: AccountTokenlistBalances) => {
            const newData = old.tokenlistBalances.map((token) => {
              if (token.id === data.base) {
                const newBalance = token.balance - data.baseAmount;
                const newValueUSD = newBalance * token.priceUSD;
                return { ...token, balance: newBalance, valueUSD: newValueUSD };
              } else if (token.id === data.quote) {
                const newBalance = token.balance + data.quoteAmount;
                const newValueUSD = newBalance * token.priceUSD;
                return { ...token, balance: newBalance, valueUSD: newValueUSD };
              }
              return token;
            });
            const accountValueUSD = newData.reduce(
              (acc, token) => acc + token.valueUSD,
              0
            );
            return { tokenlistBalances: newData, accountValueUSD };
          });
        }
      }
    };

    eventBus.on("spot-balance-update", handleBalanceUpdate);
    eventBus.on("spot-trade-update", handleTradeUpdate);

    return () => {
      eventBus.off("spot-balance-update", handleBalanceUpdate);
      eventBus.off("spot-trade-update", handleTradeUpdate);
    };
  }, [address, JSON.stringify(queryKey)]);

  if (status === "pending" || status === "error") {
    const previousData = queryClient.getQueryData(queryKey);
    return {
      data: (previousData || []) as SpotTokenWithBalance[],
      holdings: (previousData as SpotTokenWithBalance[])?.filter(
        (token: SpotTokenWithBalance) => Number(token.balance) > 0
      ),
      status,
      error,
      queryKey,
    };
  }

  return {
    data: (data?.tokenlistBalances || []) as SpotTokenWithBalance[],
    holdings: data?.tokenlistBalances?.filter(
      (token) => Number(token.balance) > 0
    ),
    accountValueUSD: data?.accountValueUSD,
    status,
    error,
    queryKey,
    refetch,
  };
};
