"use client";

import { erc20Abi } from "viem";
import { getBalance, readContract, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { useReadContract, useReadContracts } from "wagmi";
import {
  TEMPO_FEE_MANAGER,
  accountFeeToken,
  chargedFeeToken,
  feeManagerAbi,
  feeTokenOption,
  feeTokenOptions,
  tip20GasToken,
  type GasToken,
} from "@/lib/chains/gasToken";
import type { wagmiConfig } from "@/lib/providers";

type Config = typeof wagmiConfig;
type ChainId = Config["chains"][number]["id"];

/**
 * The TIP-20 the connected account pays gas in, on a chain with no gas coin (Tempo).
 * Null elsewhere. Reads the account's FeeManager choice so a wallet that picked
 * another stablecoin is checked against THAT balance, not PathUSD's.
 */
export function useFeeToken(chainId: number | undefined, address: `0x${string}` | undefined): GasToken | null {
  const tip20 = Boolean(tip20GasToken(chainId));
  const chosen = useReadContract({
    address: TEMPO_FEE_MANAGER,
    abi: feeManagerAbi,
    functionName: "userTokens",
    args: address ? [address] : undefined,
    chainId: chainId as ChainId | undefined,
    query: { enabled: tip20 && Boolean(address) },
  });
  const picked = chosen.data as string | undefined;
  const custom = tip20 && picked !== undefined && accountFeeToken(chainId, picked) !== tip20GasToken(chainId);
  const symbol = useReadContract({
    address: picked as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: chainId as ChainId | undefined,
    query: { enabled: custom },
  });
  return accountFeeToken(chainId, picked, { symbol: symbol.data as string | undefined });
}

/** `useFeeToken` outside React. Falls back to the chain default if the read fails. */
export async function readFeeToken(
  config: Config,
  chainId: number,
  address: `0x${string}`,
): Promise<GasToken | null> {
  if (!tip20GasToken(chainId)) return null;
  const chosen = await readContract(config, {
    address: TEMPO_FEE_MANAGER,
    abi: feeManagerAbi,
    functionName: "userTokens",
    args: [address],
    chainId: chainId as ChainId,
  }).catch(() => undefined);
  return accountFeeToken(chainId, chosen as string | undefined);
}

/**
 * What this account can pay gas with, in the gas asset's own units: the native
 * balance on an ordinary chain, the fee token's balance on Tempo -- whose native
 * balance is a fixed placeholder (~4.2e75) that always looks funded.
 */
export async function readGasBalance(config: Config, chainId: number, address: `0x${string}`): Promise<bigint> {
  const feeToken = await readFeeToken(config, chainId, address);
  if (!feeToken) {
    const balance = await getBalance(config, { address, chainId: chainId as ChainId });
    return balance.value;
  }
  return (await readContract(config, {
    address: feeToken.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
    chainId: chainId as ChainId,
  })) as bigint;
}

export interface FeeTokenBalance {
  token: GasToken;
  /** Undefined until read, or when the read failed -- never a guessed zero. */
  balance: bigint | undefined;
}

export interface FeeTokenChoice {
  /** The token gas is charged in for an ordinary call (choice, else PathUSD). */
  current: GasToken;
  /** True when the account picked it in the FeeManager rather than defaulting. */
  chosen: boolean;
  /** The account's raw FeeManager answer (zero address = no choice). */
  chosenAddress: string | undefined;
  options: FeeTokenBalance[];
  /** The current token's balance, as read. */
  currentBalance: bigint | undefined;
  /**
   * A listed stablecoin that HAS a balance while the current one is confirmed empty:
   * what the gas gate offers instead of sending the user off to deposit.
   */
  alternative: FeeTokenBalance | null;
}

/**
 * Every stablecoin this account could pay Tempo gas in, with balances, and which one
 * it pays in now. Null on a chain with a native gas coin. Tempo rejects a transaction
 * whose fee token cannot cover it -- it does not fall back to another token -- so an
 * empty PathUSD with a funded AlphaUSD is a real dead end unless the choice moves.
 */
export function useFeeTokenChoice(chainId: number | undefined, address: `0x${string}` | undefined): FeeTokenChoice | null {
  const options = feeTokenOptions(chainId);
  const tip20 = options.length > 0;
  const chosen = useReadContract({
    address: TEMPO_FEE_MANAGER,
    abi: feeManagerAbi,
    functionName: "userTokens",
    args: address ? [address] : undefined,
    chainId: chainId as ChainId | undefined,
    query: { enabled: tip20 && Boolean(address) },
  });
  const balances = useReadContracts({
    contracts: options.map((t) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"],
      chainId: chainId as ChainId | undefined,
    })),
    query: { enabled: tip20 && Boolean(address) },
  });
  if (!tip20) return null;
  const chosenAddress = chosen.data as string | undefined;
  const current = chargedFeeToken(chainId, chosenAddress) ?? options[0];
  const rows: FeeTokenBalance[] = options.map((token, i) => {
    const r = balances.data?.[i];
    return { token, balance: r && r.status === "success" ? (r.result as bigint) : undefined };
  });
  const currentRow = rows.find((r) => r.token.address.toLowerCase() === current.address.toLowerCase());
  const currentBalance = currentRow?.balance;
  const alternative =
    currentBalance === BigInt(0)
      ? (rows.find((r) => r.balance !== undefined && r.balance > BigInt(0)) ?? null)
      : null;
  return {
    current,
    chosen: Boolean(chosenAddress && chosenAddress !== "0x0000000000000000000000000000000000000000"),
    chosenAddress,
    options: rows,
    currentBalance,
    alternative,
  };
}

/**
 * Make `token` this account's gas token (Tempo FeeManager `setUserToken`). The call
 * is itself paid in `token`, so it works from an account whose old token is empty.
 * Signed silently by the wallet frame for a listed token (frame/policy.ts).
 */
export async function setFeeToken(config: Config, chainId: number, token: `0x${string}`): Promise<void> {
  if (!feeTokenOption(chainId, token)) throw new Error("That token cannot pay gas on this network.");
  const hash = await writeContract(config, {
    address: TEMPO_FEE_MANAGER,
    abi: feeManagerAbi,
    functionName: "setUserToken",
    args: [token],
    chainId: chainId as ChainId,
  });
  const receipt = await waitForTransactionReceipt(config, { hash, chainId: chainId as ChainId });
  if (receipt.status !== "success") throw new Error("Changing the gas token reverted.");
}
