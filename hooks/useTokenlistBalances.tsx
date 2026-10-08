"use client";
import { useEffect } from "react";
import { useConfig } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { multicall, getBalance } from "@wagmi/core";
import { erc20Abi, formatUnits } from "viem";
import { getTokens } from "@/queries/server/tokens";
import { chainIds } from "@/consts";
import { SpotTokenWithBalance, SpotToken } from "@/types/tables/tokens";
import { eventBus, SpotBalanceUpdateEvent } from "@/utils/events";
import { applyFrame } from "@/lib/realtime/applyFrame";
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
    /*
     * UNGATED. A balance is a fact about the wallet, not a curation decision.
     *
     * `/api/tokens/*` serves VERIFIED markets only, which is right for every
     * ranking on the venue and wrong here. This hook feeds every balance the
     * app shows, and it built that set from the gated list — so on a freshly
     * redeployed chain, where nothing has graduated and every row is
     * `verified: false`, the list answered zero, no `balanceOf` was ever issued,
     * and a wallet holding 30 USDC rendered 0 with nothing failing anywhere.
     *
     * Measured on Arc while chasing exactly that: the gated list returned 0
     * tokens at every page size, `?source=all` returned USDC and ITRA, and the
     * chain had the money the whole time. `getTokens` already carries this flag
     * for the deposit page, which hit the same wall for the same reason — see
     * its note. Balances are the second caller that is not a ranking.
     */
    const tokens = await getTokens(networkName, 1000, 1, "", "all");
    // not-a-frame: seeds the cache from this query's own fetch.
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
    /*
     * PINNED to the network being displayed, never to the connected one.
     *
     * Both reads used to take the ambient chain, which is whatever the wallet
     * happens to be standing on. This app shows one chain's page while the
     * wallet sits on another all the time — that is the whole point of the
     * chain switcher — and these token addresses mean nothing on a different
     * chain: `balanceOf` hits an address with no code, the call reverts, and
     * with `allowFailure: false` ONE revert rejects the entire multicall. The
     * catch upstream then renders every balance as zero, which is how a wallet
     * holding 30 USDC on Arc showed 0 while the explorer showed the money.
     *
     * `useBalances` in lib/portfolio already documents the rule this restores —
     * wagmi takes `chainId` per read, so a page never has to hope the wallet is
     * on the right network to display a balance.
     */
    const chainId = chainIds[networkName];
    if (!chainId) return [];
    /*
     * `allowFailure: true`, so one bad row costs its own balance and nothing
     * else. A token list is operator-supplied and outlives deployments: an
     * entry pointing at a self-destructed or never-deployed address is an
     * ordinary occurrence, and under the old setting it zeroed every OTHER
     * token's balance along with its own.
     */
    const results = await multicall(config, {
      contracts: totalTokenContractData,
      allowFailure: true,
      chainId,
    });
    const balances = results.map((r) =>
      r.status === "success" ? (r.result as bigint) : BigInt(0),
    );
    const nativeBalance = await getBalance(config, {
      address: address as `0x${string}`,
      chainId,
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
    // not-a-frame: seeds the cache from this query's own fetch.
    queryClient.setQueryData(tokenlistQueryKey, tokenlist);
    const tokenlistBalances: SpotTokenWithBalance[] = await fetchBalances(
      tokenlist.tokens
    );
    const accountValueUSD = tokenlistBalances.reduce(
      (acc, token) => acc + token.valueUSD,
      0
    );
    // not-a-frame: part of this query's own fetch.
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
      void applyFrame(queryClient, queryKey, (old: AccountTokenlistBalances) => {
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
          void applyFrame(queryClient, queryKey, (old: AccountTokenlistBalances) => {
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
          void applyFrame(queryClient, queryKey, (old: AccountTokenlistBalances) => {
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

    // A swap reports that it landed, not what it landed on — see the event's
    // declaration. `refetch` is referentially stable, so this listener does not
    // need to be re-subscribed when the component re-renders.
    const handleBalanceRefetch = () => {
      void refetch();
    };

    eventBus.on("spot-balance-update", handleBalanceUpdate);
    eventBus.on("spot-balance-refetch", handleBalanceRefetch);
    eventBus.on("spot-trade-update", handleTradeUpdate);

    return () => {
      eventBus.off("spot-balance-update", handleBalanceUpdate);
      eventBus.off("spot-balance-refetch", handleBalanceRefetch);
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
