"use client";
import { useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { SpotToken } from "@/types/tables";
import { eventBus, SpotBalanceUpdateEvent, SpotAllowanceUpdateEvent } from "@/utils/events";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "@/utils/number";
import { useEffect, useMemo, useState } from "react";
import { SpotTradeEvent } from "@/types";

export interface ERC20BalanceAllowance {
  balance: number;
  allowance: number;
}

export const useERC20BalanceAllowance = (
  token: SpotToken,
  owner: `0x${string}` | undefined,
  spender: `0x${string}` | undefined
) => {
  if (token === undefined) {
    return {
      data: {
        balance: 0,
        allowance: 0,
      },
      status: "none",
      error: "address is undefined",
    };
  }
  const { data, status, error, queryKey, refetch } = useReadContracts({
    contracts: [
      {
        // @ts-ignore
        address: token.id,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner as `0x${string}`],
      },
      {
        // @ts-ignore
        address: token.id,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner as `0x${string}`, spender as `0x${string}`],
      },
    ],
  });

  const [balanceAllowance, setBalanceAllowance] =
    useState<ERC20BalanceAllowance>({ balance: 0, allowance: 0 });

  useEffect(() => {
    if (data && data.length > 0) {
      setBalanceAllowance({
        balance: Number.parseFloat(
          formatUnits(data[0]?.result ?? BigInt(0), token.decimals)
        ),
        allowance: Number.parseFloat(
          formatUnits(data[1]?.result ?? BigInt(0), token.decimals)
        ),
      });
    } else {
      setBalanceAllowance({ balance: 0, allowance: 0 });
    }
  }, [data]);

  useEffect(() => {
    const handleBalanceUpdate = (data: SpotBalanceUpdateEvent) => {
      if (data.token.id === token.id) {
        setBalanceAllowance((prev) => ({
          ...prev,
          balance: data.balance,
        }));
      }
    };

    const handleTradeUpdate = (data: SpotTradeEvent) => {
      if (data.account === owner) {
        if (data.isBid) {
          if (data.quote === token.id) {
            setBalanceAllowance((prev) => ({
              ...prev,
              balance: prev.balance - data.quoteAmount,
            }));
          } else if (data.base === token.id) {
            setBalanceAllowance((prev) => ({
              ...prev,
              balance: prev.balance + data.baseAmount,
            }));
          }
        } else {
          if (data.base === token.id) {
            setBalanceAllowance((prev) => ({
              ...prev,
              balance: prev.balance - data.baseAmount,
            }));
          } else if (data.quote === token.id) {
            setBalanceAllowance((prev) => ({
              ...prev,
              balance: prev.balance + data.quoteAmount,
            }));
          }
        }
      }
    };

    const handleAllowanceUpdate = (data: SpotAllowanceUpdateEvent) => {
      if (data.token.id === token.id) {
        setBalanceAllowance((prev) => ({
          ...prev,
          allowance: data.allowance,
        }));
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
    eventBus.on("spot-allowance-update", handleAllowanceUpdate);

    return () => {
      eventBus.off("spot-balance-update", handleBalanceUpdate);
      eventBus.off("spot-balance-refetch", handleBalanceRefetch);
      eventBus.off("spot-trade-update", handleTradeUpdate);
      eventBus.off("spot-allowance-update", handleAllowanceUpdate);
    };
  }, [token?.id, owner]);

  return {
    // @ts-ignore
    data: balanceAllowance,
    status,
    error,
    queryKey,
    refetch,
  };
};
