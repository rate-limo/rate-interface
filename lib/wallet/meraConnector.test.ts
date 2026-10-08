// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { ERR, WalletFrameError, type StatusResult, type WalletRpc } from "./frame/protocol";
import type { WalletFrame } from "./frame/client";

/**
 * The connector against a fake frame.
 *
 * What is pinned is the division of labour: the connector never derives an
 * address, never keeps a key, and never signs. Every one of those is a call
 * to the frame, and the PRF bytes it forwards are zeroed the moment the frame
 * has answered. The ceremony itself is mocked — a real one needs an
 * authenticator, which is the limit `webauthnClient.test.ts` records.
 */

const ADDRESS = "0x7a3F000000000000000000000000000000009C21" as Address;

const ceremony = vi.hoisted(() => ({
  hasCredential: false,
  unlock: vi.fn<() => Promise<Uint8Array | null>>(),
  create: vi.fn<() => Promise<Uint8Array>>(),
}));

vi.mock("./mera", () => ({
  hasMeraCredential: () => ceremony.hasCredential,
  unlockPasskeyKey: ceremony.unlock,
  createPasskeyKey: ceremony.create,
}));

vi.mock("./frame/origins", () => ({
  isIsolated: () => false,
  walletOrigin: () => "http://localhost",
  appOrigin: () => "http://localhost",
  FRAME_PATH: "/wallet-frame",
  CONFIRM_PATH: "/wallet-frame/confirm",
}));

function fakeFrame(initial: { session: Address | null }): WalletFrame & {
  calls: string[];
  unlockedWith: Uint8Array[];
  session: Address | null;
} {
  const frame = {
    calls: [] as string[],
    unlockedWith: [] as Uint8Array[],
    session: initial.session,
    async status(): Promise<StatusResult> {
      frame.calls.push("status");
      return { address: frame.session, expiresAt: frame.session ? Date.now() + 1000 : null };
    },
    async resume(): Promise<Address> {
      frame.calls.push("resume");
      if (!frame.session) throw new WalletFrameError({ code: ERR.LOCKED, message: "locked" });
      return frame.session;
    },
    async unlock(prfOutput: Uint8Array): Promise<Address> {
      frame.calls.push("unlock");
      // A COPY, as structured clone would make: the caller's zeroing must not
      // reach the frame's bytes, and the frame's must not reach the caller's.
      frame.unlockedWith.push(new Uint8Array(prfOutput));
      frame.session = ADDRESS;
      return ADDRESS;
    },
    async request(_chainId: number, rpc: WalletRpc): Promise<Hex> {
      frame.calls.push(`request:${rpc.method}`);
      return "0xhash";
    },
    async disconnect(): Promise<void> {
      frame.calls.push("disconnect");
      frame.session = null;
    },
  };
  return frame;
}

async function make(frame: WalletFrame) {
  const { meraConnector } = await import("./meraConnector");
  const emitter = { emit: vi.fn() };
  const factory = meraConnector({ userName: () => "Rate wallet", frame });
  return factory({ chains: [], emitter } as never);
}

beforeEach(() => {
  ceremony.hasCredential = false;
  ceremony.unlock.mockReset();
  ceremony.create.mockReset();
});

describe("reconnect", () => {
  it("resumes through the frame and never runs a ceremony", async () => {
    const frame = fakeFrame({ session: ADDRESS });
    const connector = await make(frame);
    const result = await connector.connect({ isReconnecting: true });
    expect(result.accounts).toEqual([ADDRESS]);
    expect(frame.calls).toEqual(["resume"]);
    expect(ceremony.unlock).not.toHaveBeenCalled();
    expect(ceremony.create).not.toHaveBeenCalled();
  });

  it("throws, without prompting, when there is nothing to resume", async () => {
    const frame = fakeFrame({ session: null });
    const connector = await make(frame);
    await expect(connector.connect({ isReconnecting: true })).rejects.toThrow(/expired/);
    expect(ceremony.unlock).not.toHaveBeenCalled();
    expect(await connector.getAccounts()).toEqual([]);
  });
});

describe("connect from a click", () => {
  it("resumes a live session without a ceremony", async () => {
    const frame = fakeFrame({ session: ADDRESS });
    const connector = await make(frame);
    await connector.connect();
    expect(frame.calls).toEqual(["resume"]);
    expect(ceremony.unlock).not.toHaveBeenCalled();
  });

  it("unlocks with the stored passkey, hands the PRF bytes to the frame, and zeroes them", async () => {
    ceremony.hasCredential = true;
    const prf = new Uint8Array(32).fill(7);
    ceremony.unlock.mockResolvedValue(prf);

    const frame = fakeFrame({ session: null });
    const connector = await make(frame);
    const result = await connector.connect();

    expect(result.accounts).toEqual([ADDRESS]);
    expect(frame.calls).toEqual(["resume", "unlock"]);
    expect(frame.unlockedWith[0]).toEqual(new Uint8Array(32).fill(7));
    // The connector's own copy is gone the moment the frame has answered.
    expect(Array.from(prf)).toEqual(new Array(32).fill(0));
    expect(ceremony.create).not.toHaveBeenCalled();
  });

  it("creates a passkey when none is stored", async () => {
    ceremony.create.mockResolvedValue(new Uint8Array(32).fill(1));
    const frame = fakeFrame({ session: null });
    const connector = await make(frame);
    await connector.connect();
    expect(ceremony.create).toHaveBeenCalledOnce();
    expect(frame.calls).toEqual(["resume", "unlock"]);
  });

  it("fails loudly when the stored passkey no longer resolves, rather than minting a second account", async () => {
    ceremony.hasCredential = true;
    ceremony.unlock.mockResolvedValue(null);
    const frame = fakeFrame({ session: null });
    const connector = await make(frame);
    await expect(connector.connect()).rejects.toThrow(/no longer available/);
    expect(ceremony.create).not.toHaveBeenCalled();
    expect(frame.calls).toEqual(["resume"]);
  });

  it("surfaces a frame failure that is not LOCKED", async () => {
    const frame = fakeFrame({ session: null });
    frame.resume = async () => {
      throw new Error("The wallet frame at http://localhost did not answer.");
    };
    const connector = await make(frame);
    await expect(connector.connect()).rejects.toThrow(/did not answer/);
    expect(ceremony.create).not.toHaveBeenCalled();
  });
});

describe("the provider", () => {
  it("answers identity locally and sends signing methods to the frame", async () => {
    const frame = fakeFrame({ session: ADDRESS });
    const connector = await make(frame);
    await connector.connect({ isReconnecting: true, chainId: 11155931 });
    const provider = await connector.getProvider();

    expect(await provider.request({ method: "eth_accounts" })).toEqual([ADDRESS]);
    expect(await provider.request({ method: "eth_chainId" })).toBe("0xaa39db");
    expect(await provider.request({ method: "personal_sign", params: ["0x68", ADDRESS] } as never)).toBe("0xhash");
    expect(await provider.request({ method: "eth_sendTransaction", params: [{}] } as never)).toBe("0xhash");
    expect(await provider.request({ method: "mera_sendBatch", params: [{}] } as never)).toBe("0xhash");
    expect(frame.calls.filter((c) => c.startsWith("request:"))).toEqual([
      "request:personal_sign",
      "request:eth_sendTransaction",
      "request:mera_sendBatch",
    ]);
  });

  it("hands out a provider while locked, and the provider is what refuses", async () => {
    // It used to be `getProvider()` that threw. See "wagmi's reconnect" below for
    // why that one line cost the whole resume-on-reload feature.
    const connector = await make(fakeFrame({ session: null }));
    const provider = await connector.getProvider();
    await expect(provider.request({ method: "eth_accounts" })).rejects.toThrow(/locked/i);
  });
});

describe("wagmi's reconnect, the real action", () => {
  /*
   * Every other test here calls `connector.connect({ isReconnecting: true })`
   * directly. wagmi does not: its `reconnect` asks each connector for
   * `getProvider()` FIRST and `continue`s past one that rejects — before
   * `isAuthorized()`, before `connect()`. `getProvider` threw "locked" whenever
   * no address was loaded, which on a fresh page is always, so a reload never
   * reached `frame.resume()` at all: the session sat in storage, wagmi cleared
   * the connection, and the app said "Connect wallet". The feature's own tests
   * were green throughout because none of them went through this door.
   * Found by e2e/specs/add-liquidity.spec.ts, 2026-09-20.
   */
  it("resumes a stored session on a page load", async () => {
    const { createConfig, createStorage, http, reconnect } = await import("@wagmi/core");
    const { defineChain } = await import("viem");
    const { meraConnector } = await import("./meraConnector");
    const chain = defineChain({
      id: 5042002,
      name: "Arc Testnet",
      nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: ["http://localhost:0"] } },
    });
    const frame = fakeFrame({ session: ADDRESS });
    const memory = new Map<string, string>();
    const config = createConfig({
      chains: [chain],
      connectors: [meraConnector({ userName: () => "Rate wallet", frame })],
      transports: { [chain.id]: http() },
      storage: createStorage({
        storage: {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => void memory.set(key, value),
          removeItem: (key) => void memory.delete(key),
        },
      }),
    });

    const connections = await reconnect(config);

    expect(frame.calls).toContain("resume");
    expect(connections.map((c) => c.accounts[0])).toEqual([ADDRESS]);
    expect(config.state.status).toBe("connected");
  });

  it("stays disconnected, without a ceremony, when there is no session", async () => {
    const { createConfig, http, reconnect } = await import("@wagmi/core");
    const { defineChain } = await import("viem");
    const { meraConnector } = await import("./meraConnector");
    const chain = defineChain({
      id: 5042002,
      name: "Arc Testnet",
      nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: ["http://localhost:0"] } },
    });
    const frame = fakeFrame({ session: null });
    const config = createConfig({
      chains: [chain],
      connectors: [meraConnector({ userName: () => "Rate wallet", frame })],
      transports: { [chain.id]: http() },
      storage: null,
    });

    expect(await reconnect(config)).toEqual([]);
    // The rule this file exists to protect: a page load never prompts.
    expect(ceremony.unlock).not.toHaveBeenCalled();
    expect(ceremony.create).not.toHaveBeenCalled();
    expect(frame.calls).not.toContain("unlock");
  });
});

describe("isAuthorized", () => {
  it("is the frame's status", async () => {
    expect(await (await make(fakeFrame({ session: ADDRESS }))).isAuthorized()).toBe(true);
    expect(await (await make(fakeFrame({ session: null }))).isAuthorized()).toBe(false);
  });

  it("is false when the frame cannot be reached", async () => {
    const frame = fakeFrame({ session: ADDRESS });
    frame.status = async () => {
      throw new Error("did not answer");
    };
    expect(await (await make(frame)).isAuthorized()).toBe(false);
  });
});

describe("disconnect", () => {
  it("drops the address and tells the frame", async () => {
    const frame = fakeFrame({ session: ADDRESS });
    const connector = await make(frame);
    await connector.connect({ isReconnecting: true });
    await connector.disconnect();
    expect(await connector.getAccounts()).toEqual([]);
    expect(frame.calls).toContain("disconnect");
    expect(frame.session).toBeNull();
  });
});
