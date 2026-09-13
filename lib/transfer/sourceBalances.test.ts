import { describe, expect, it } from "vitest";
import {
  bySourceBalance,
  canPayGas,
  holdsSomething,
  readSourceBalances,
  type ChainReader,
} from "./sourceBalances";

const ARC = 5042002;
const BASE = 84532;
const ARBITRUM = 421614;
const ADDRESS = "0x7a3f000000000000000000000000000000009c21";

/** Reads that succeed unless the callback returns an Error. */
function reader(
  token: (chainId: number) => bigint | Error,
  gas: (chainId: number) => bigint | Error = () => BigInt(1000000000000000),
): ChainReader {
  const settle = (v: bigint | Error) =>
    v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
  return {
    token: (chain) => settle(token(chain.chainId)),
    gas: (chain) => settle(gas(chain.chainId)),
  };
}

describe("readSourceBalances", () => {
  it("formats the asset at 6 decimals and gas at the chain's own", async () => {
    // Mixing those up is a 10^12 error. USDC is 6 everywhere; native is 18.
    const funds = await readSourceBalances(
      ADDRESS,
      [BASE],
      reader(
        () => BigInt(250000000),
        () => BigInt("2000000000000000000"),
      ),
    );
    expect(funds.get(BASE)?.token).toBe("250");
    expect(funds.get(BASE)?.gas).toBe("2");
  });

  it("names the gas asset, which differs per chain", async () => {
    const funds = await readSourceBalances(ADDRESS, [BASE, 43113], reader(() => BigInt(0)));
    expect(funds.get(BASE)?.gasSymbol).toBe("ETH");
    expect(funds.get(43113)?.gasSymbol).toBe("AVAX");
  });

  it("settles the two reads independently", async () => {
    /*
     * A chain whose gas read fails still reports its asset balance. Folding them
     * into one failure would hide a balance we successfully read.
     */
    const funds = await readSourceBalances(
      ADDRESS,
      [BASE],
      reader(
        () => BigInt(1000000),
        () => new Error("429"),
      ),
    );
    expect(funds.get(BASE)?.token).toBe("1");
    expect(funds.get(BASE)?.gas).toBeUndefined();
  });

  it("leaves a failed asset read undefined — missing is not zero", async () => {
    const funds = await readSourceBalances(ADDRESS, [BASE], reader(() => new Error("429")));
    expect(funds.get(BASE)?.token).toBeUndefined();
  });

  it("keeps a real zero, which is a different claim from a failed read", async () => {
    const funds = await readSourceBalances(ADDRESS, [BASE], reader(() => BigInt(0)));
    expect(funds.get(BASE)?.token).toBe("0");
  });

  it("ignores a chain the SDK does not know rather than throwing", async () => {
    const funds = await readSourceBalances(ADDRESS, [11155931], reader(() => BigInt(5)));
    expect(funds.size).toBe(0);
  });
});

describe("canPayGas", () => {
  it("is false only on a KNOWN zero", () => {
    // A bridge burns on the source chain, so no gas there means no deposit —
    // and the row would otherwise fail at the wallet, after the network switch.
    expect(canPayGas({ gas: "0", gasSymbol: "ETH" })).toBe(false);
  });

  it("is true for any gas at all", () => {
    expect(canPayGas({ gas: "0.0001", gasSymbol: "ETH" })).toBe(true);
  });

  it("is true when the gas read FAILED, never false", () => {
    /*
     * "We could not ask" and "you have none" are different facts. Refusing a
     * route on the first would block a deposit because someone's RPC was
     * rate-limited — a worse error than letting the wallet decline.
     */
    expect(canPayGas({ token: "10", gasSymbol: "ETH" })).toBe(true);
    expect(canPayGas(undefined)).toBe(true);
  });
});

describe("holdsSomething", () => {
  it("is false for an unread chain and for a real zero", () => {
    expect(holdsSomething(undefined)).toBe(false);
    expect(holdsSomething("0")).toBe(false);
  });

  it("is true for any positive amount, including dust", () => {
    expect(holdsSomething("0.000001")).toBe(true);
  });
});

describe("bySourceBalance", () => {
  const rows = [
    { chainId: ARBITRUM, providerChainKey: "Arbitrum_Sepolia" },
    { chainId: BASE, providerChainKey: "Base_Sepolia" },
    { chainId: ARC, providerChainKey: "Arc_Testnet" },
  ];

  it("puts chains the wallet can actually send from first", () => {
    const balances = new Map([[BASE, { token: "250", gas: "1", gasSymbol: "ETH" }]]);
    expect(bySourceBalance(rows, balances)[0]!.chainId).toBe(BASE);
  });

  it("ranks a fundable chain above one holding the asset but no gas", () => {
    // Both have USDC; only one can move it.
    const balances = new Map([
      [ARBITRUM, { token: "500", gas: "0", gasSymbol: "ETH" }],
      [BASE, { token: "10", gas: "1", gasSymbol: "ETH" }],
    ]);
    expect(
      bySourceBalance(rows, balances)
        .map((r) => r.chainId)
        .slice(0, 2),
    ).toEqual([BASE, ARBITRUM]);
  });

  it("still ranks the gasless chain above the empty ones", () => {
    // It is the most interesting kind of unusable: the fix is to send it gas.
    const balances = new Map([[ARBITRUM, { token: "500", gas: "0", gasSymbol: "ETH" }]]);
    expect(bySourceBalance(rows, balances)[0]!.chainId).toBe(ARBITRUM);
  });

  it("orders several usable chains by size", () => {
    const balances = new Map([
      [BASE, { token: "10", gas: "1", gasSymbol: "ETH" }],
      [ARBITRUM, { token: "500", gas: "1", gasSymbol: "ETH" }],
    ]);
    expect(
      bySourceBalance(rows, balances)
        .map((r) => r.chainId)
        .slice(0, 2),
    ).toEqual([ARBITRUM, BASE]);
  });

  it("sorts the rest by name, so the long tail is scannable", () => {
    expect(bySourceBalance(rows, new Map()).map((r) => r.providerChainKey)).toEqual([
      "Arbitrum_Sepolia",
      "Arc_Testnet",
      "Base_Sepolia",
    ]);
  });

  it("never drops a chain whose balance is unknown", () => {
    const balances = new Map([[BASE, { token: "1", gas: "1", gasSymbol: "ETH" }]]);
    expect(bySourceBalance(rows, balances)).toHaveLength(3);
  });
});
