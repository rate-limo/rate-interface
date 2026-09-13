"use client";

import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import * as bridgeKit from "@circle-fin/bridge-kit";

/**
 * What the EXTERNAL wallet holds on chains it is not currently standing on —
 * both the asset and the gas needed to move it.
 *
 * ## Why this cannot come from the connected provider
 *
 * An injected wallet is on ONE chain at a time, so asking it for balances
 * elsewhere means `wallet_switchEthereumChain` per chain — two dozen prompts to
 * populate a list. That is not a slow version of the right thing, it is a
 * different and much worse screen.
 *
 * So the balances are read over each chain's PUBLIC RPC, which the SDK already
 * ships alongside the CCTP domain. Nothing is signed and nothing is prompted;
 * this is a read of a public ledger for an address the user just handed us.
 *
 * ## The gas balance is not a detail
 *
 * A bridge BURNS on the source chain, which is an approve and a transaction the
 * user signs and pays for in that chain's own gas asset. So 10 USDC on Arbitrum
 * Sepolia with no Sepolia ETH is not a deposit anyone can make — the row looks
 * identical to a usable one and fails at the wallet, after the network switch,
 * which is the most expensive place to discover it.
 *
 * Arc is the one chain where the two are the same pool: its gas asset IS USDC.
 * That costs nothing here, because Arc is the DESTINATION and destinations are
 * never in this list.
 *
 * ## Missing is not zero
 *
 * A testnet RPC refusing a request is routine, and a chain that answers nothing
 * must not render as "you have 0.00 here" — that is a statement about the user's
 * money which happens to be false, and it would hide the one chain they were
 * looking for. A failed read is ABSENT from the map, the same call the
 * portfolio's balances panel makes ("degrade, don't disappear"; see
 * apps/web/CLAUDE.md).
 *
 * That distinction also governs the gas check: `gas` absent means "we could not
 * ask", which must never read as "you cannot pay".
 */

interface SdkChain {
  chainId: number;
  usdcAddress: string;
  rpcEndpoints: string[];
  nativeCurrency: { symbol: string; decimals: number };
}

function sdkChains(): Map<number, SdkChain> {
  const out = new Map<number, SdkChain>();
  for (const value of Object.values(bridgeKit as Record<string, unknown>)) {
    const c = value as Partial<SdkChain> & { cctp?: unknown };
    if (
      c &&
      typeof c === "object" &&
      typeof c.chainId === "number" &&
      typeof c.usdcAddress === "string" &&
      Array.isArray(c.rpcEndpoints) &&
      c.rpcEndpoints.length > 0 &&
      c.nativeCurrency &&
      c.cctp
    ) {
      out.set(c.chainId, {
        chainId: c.chainId,
        usdcAddress: c.usdcAddress,
        rpcEndpoints: c.rpcEndpoints,
        nativeCurrency: c.nativeCurrency,
      });
    }
  }
  return out;
}

/** USDC is 6 decimals on every chain Circle issues it on. */
const USDC_DECIMALS = 6;

/** What one chain can contribute to a deposit. */
export interface SourceFunds {
  /** The asset, formatted. Absent when the read failed — never defaulted to 0. */
  token?: string;
  /** The chain's gas asset, formatted. Absent when the read failed. */
  gas?: string;
  /** What that gas is called here: ETH, AVAX, tCRO… */
  gasSymbol: string;
}

export interface ChainReader {
  token: (chain: SdkChain, address: string) => Promise<bigint>;
  gas: (chain: SdkChain, address: string) => Promise<bigint>;
}

const overRpc: ChainReader = {
  token: (chain, address) =>
    createPublicClient({ transport: http(chain.rpcEndpoints[0]) }).readContract({
      address: chain.usdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }),
  gas: (chain, address) =>
    createPublicClient({ transport: http(chain.rpcEndpoints[0]) }).getBalance({
      address: address as `0x${string}`,
    }),
};

/**
 * Funds for the given chains, keyed by chain id.
 *
 * Parallel, because these are two dozen independent public endpoints and doing
 * them in series would make the list arrive over the better part of a minute.
 * That is the opposite of `chainAudit.ts`'s sequential rule and deliberately so:
 * there the calls all hit ONE node, which is the scarce resource; here every
 * call hits a different operator's RPC, so there is nothing to be polite to.
 *
 * The two reads are settled independently — a chain whose gas read fails still
 * reports its token balance, and vice versa.
 */
export async function readSourceBalances(
  address: string,
  chainIds: readonly number[],
  read: ChainReader = overRpc,
): Promise<Map<number, SourceFunds>> {
  const chains = sdkChains();
  const out = new Map<number, SourceFunds>();

  await Promise.all(
    chainIds.map(async (chainId) => {
      const chain = chains.get(chainId);
      if (!chain) return;

      const [token, gas] = await Promise.all([
        read.token(chain, address).catch(() => null),
        read.gas(chain, address).catch(() => null),
      ]);

      out.set(chainId, {
        token: token === null ? undefined : formatUnits(token, USDC_DECIMALS),
        gas: gas === null ? undefined : formatUnits(gas, chain.nativeCurrency.decimals),
        gasSymbol: chain.nativeCurrency.symbol,
      });
    }),
  );

  return out;
}

/** A balance worth leading the list with. */
export function holdsSomething(formatted: string | undefined): boolean {
  if (formatted === undefined) return false;
  const n = Number(formatted);
  return Number.isFinite(n) && n > 0;
}

/**
 * Can this chain actually start a bridge?
 *
 * Only ever answers false on a KNOWN zero. "We could not read your gas balance"
 * and "you have none" are different facts, and refusing a route on the first
 * would block a deposit because someone's RPC was rate-limited.
 *
 * It is also only a floor: nothing here knows what the approve and burn will
 * cost, so a non-zero balance is not a promise the transaction fits. Saying
 * "you have none" is the only claim the data supports.
 */
export function canPayGas(funds: SourceFunds | undefined): boolean {
  if (funds?.gas === undefined) return true;
  const n = Number(funds.gas);
  return !Number.isFinite(n) || n > 0;
}

/**
 * Held chains first, then the rest alphabetically.
 *
 * The whole reason to read balances at all: on a list of two dozen networks, the
 * one the user can actually send from should not be somewhere in the middle.
 * Chains whose RPC did not answer sort with the empty ones rather than being
 * dropped — we do not know that they are empty.
 *
 * A chain holding the asset but no gas sorts BELOW one that can actually be
 * used, and above the empty ones: it is the most interesting kind of unusable,
 * because the fix is to send that chain some gas.
 */
export function bySourceBalance<T extends { chainId: number; providerChainKey: string }>(
  rows: readonly T[],
  balances: Map<number, SourceFunds>,
): T[] {
  const rank = (chainId: number): number => {
    const funds = balances.get(chainId);
    if (!holdsSomething(funds?.token)) return 2;
    return canPayGas(funds) ? 0 : 1;
  };

  return [...rows].sort((a, b) => {
    const ra = rank(a.chainId);
    const rb = rank(b.chainId);
    if (ra !== rb) return ra - rb;
    if (ra < 2) {
      const diff = Number(balances.get(b.chainId)?.token) - Number(balances.get(a.chainId)?.token);
      if (Number.isFinite(diff) && diff !== 0) return diff;
    }
    return a.providerChainKey.localeCompare(b.providerChainKey);
  });
}
