/**
 * The real LaunchExecution.
 *
 * `uploadLogo` talks to admin-service. `quoteOptions`/`terms` read
 * AssetGenerator directly, the same way `hooks/useQuoteOptions.tsx` already
 * does for the read-only token profile page. `submit` calls
 * `AssetGenerator.launch(name, symbol, initialSupply, quote)` via
 * `@wagmi/core`'s standalone `writeContract` — standalone rather than the
 * `useWriteContract` hook because `LaunchExecution` is a plain object of
 * async functions, injected into `LaunchFlow` as a prop rather than called
 * from inside a component; `@wagmi/core`'s imperative API is the vendor-
 * neutral way to do a write from outside render (see `lib/wallet/index.ts`'s
 * docstring on what belongs behind that seam and what doesn't).
 *
 * `submit` is two transactions: an exact-amount `approve` of the dev buy's
 * quote to the generator, then `launch(name, symbol, supply, quote, devBuyQuote, lockMode)`
 * with the launch fee attached. The generator pulls the quote with
 * `transferFrom`, so the approval must land first; an existing allowance that
 * already covers the amount skips it.
 *
 * The upload posts to a SAME-ORIGIN path. `/token-logo` is rewritten to
 * admin-service in next.config.ts, which keeps the browser off a cross-origin
 * request (no CORS preflight on a multipart POST) and keeps the service's
 * hostname out of the client bundle.
 */

import { formatEther, formatUnits, parseEventLogs } from "viem";
import {
  getAccount,
  readContract,
  simulateContract,
  signMessage,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { AssetGeneratorABI, ERC20ABI } from "@iter/abis";
import { findChain, getAddress as getDeployedAddress, isTestQuoteToken } from "@iter/deployments";
import { tip20GasToken } from "@/lib/chains/gasToken";

/**
 * A chain id the wallet config actually knows about.
 *
 * The registry types `chainId` as a plain number, but the wagmi config is built
 * from a const tuple, so its actions accept only the literal union of ids in
 * `wagmiChains`. Checking here rather than casting turns "this chain is not in
 * the wallet config" into a named error at the call, instead of a failure deep
 * inside wagmi that reads as the transaction being rejected.
 */
type SupportedChainId = (typeof wagmiChains)[number]["id"];

function supportedChainId(id: number): SupportedChainId {
  const match = wagmiChains.find((c) => c.id === id);
  if (!match) {
    throw new Error(`Chain ${id} is not configured in the wallet — see lib/customChains.ts.`);
  }
  return match.id;
}
import { wagmiConfig } from "@/lib/providers";
import { wagmiChains } from "@/lib/customChains";
import { COIN_DECIMALS, shortHex } from "./mock";
import { LadderNotPlacedError } from "./ladderRecovery";
import { devBuyRefusal, devBuyView, parseRawAmount } from "./devBuy";
import { LAUNCH_SUPPLY_TEXT, LOCK_MODE_INDEX } from "./types";
import { awaitIndexed } from "./awaitIndexed";
import { getTokenByAddress } from "@/queries/server/tokens";
import type {
  LaunchDraft,
  LaunchExecution,
  LaunchReceipt,
  LaunchTerms,
  QuoteOption,
  UploadedLogo,
} from "./types";

/** Rewritten to `${ADMIN_SERVICE_URL}/token-logo` — see next.config.ts. */
const UPLOAD_PATH = "/token-logo";

/** Thrown for anything the user can act on: too large, wrong format, throttled. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

interface UploadResponse {
  sha256: string;
  logoURI: string;
}

export async function uploadLogo(file: File, signal?: AbortSignal): Promise<UploadedLogo> {
  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch(UPLOAD_PATH, { method: "POST", body, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new UploadError("Couldn't reach the image service. Check your connection and try again.");
  }

  if (!response.ok) {
    // The service answers with { error } for everything a caller can fix; fall
    // back to a status-shaped message when the body isn't what we expect (a
    // proxy error page, say).
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    if (detail?.error) throw new UploadError(detail.error);
    throw new UploadError(
      response.status === 429
        ? "Too many uploads. Try again in a minute."
        : "The image couldn't be stored. Try again.",
    );
  }

  const payload = (await response.json()) as Partial<UploadResponse>;
  // BOTH, because the digest is what the claim is authorized over. This used to
  // return `payload.logoURI` alone and drop `sha256` on the floor, so the caller
  // held an image it had no way to bind to the coin it was about to deploy.
  if (!payload.logoURI || !payload.sha256) {
    throw new UploadError("The image service returned an unexpected response.");
  }
  return { sha256: payload.sha256, logoURI: payload.logoURI };
}

/** Rewritten to admin-service's public claim routes — see next.config.ts. */
const CLAIM_NONCE_PATH = "/token-logo/nonce";
const CLAIM_PATH = "/token-logo/claim";

/**
 * Bind an uploaded image to a coin, proving the caller launched it.
 *
 * The three-step handshake is admin-service's, and none of the claims it checks
 * comes from this request body: the address is RECOVERED from the signature, the
 * creator is read from `broker.spotTokens` (written by the broker from the
 * `Launched` event), and the image must already exist in the logo store. So the
 * worst a hostile caller achieves is signing a message about a coin they do not
 * own and being refused.
 *
 * Returns a boolean instead of throwing. Every caller is post-deploy: the coin
 * exists, the launch fee is spent, and the transaction is on chain. Surfacing a
 * rejected signature as an exception there would unwind a screen reporting a
 * success that genuinely happened. The creator can rebind later — the bytes are
 * stored and addressed by digest, so nothing has to be re-uploaded.
 */
export async function claimLogo(
  tokenId: string,
  sha256: string,
  networkName: string | number,
): Promise<boolean> {
  try {
    const chain = findChain(networkName);
    if (!chain) return false;
    const chainId = supportedChainId(chain.chainId);
    const account = getAccount(wagmiConfig);
    if (!account.address) return false;
    // The signature is checked against the coin's `creator`, so it has to come
    // from the wallet that launched it — and a wallet parked on another chain
    // signs the same bytes but is a different session. Same switch `submit` does.
    if (account.chainId !== chainId) {
      await switchChain(wagmiConfig, { chainId });
    }

    // The server checks the signer against the INDEXED coin, which lands a few
    // seconds after the receipt. Asking before then was refused every time.
    await awaitIndexed(async () => {
      const token = (await getTokenByAddress(chain.name, tokenId)) as { creator?: string };
      return Boolean(token?.creator);
    });

    const nonceResponse = await fetch(CLAIM_NONCE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId, sha256 }),
    });
    if (!nonceResponse.ok) return false;
    const issued = (await nonceResponse.json()) as { nonce?: string; message?: string };
    if (!issued.nonce || !issued.message) return false;

    // The service's own message, signed verbatim. Rebuilding it here would let
    // the two drift, and the server rebuilds it from its stored record anyway —
    // a mismatch recovers a different address and reads as "not the creator".
    const signature = await signMessage(wagmiConfig, { message: issued.message });

    const claimResponse = await fetch(CLAIM_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce: issued.nonce, signature }),
    });
    return claimResponse.ok;
  } catch {
    // Includes the user simply declining the signature, which is a choice
    // rather than a fault: they keep the coin and can bind artwork later.
    return false;
  }
}

/**
 * The quote tokens AssetGenerator currently allows a coin to list against, for
 * `networkName`. Mirrors `useQuoteOptions.tsx` (read `enabledQuoteTokens()`,
 * then each one's `quoteOption(...)` plus its ERC-20 symbol) but returns the
 * shape `LaunchFlow` already renders rather than that hook's row type, and is
 * usable outside a component. Never throws: an unregistered chain or a failed
 * read degrades to an empty list, same contract `useQuoteOptions` documents.
 */
/**
 * Whether `networkName` runs the ladder launch (2026-10-02). The registry gains
 * `ladderBuyer` in the same sync that records the ladder AssetGenerator, so its
 * presence is what separates a migrated chain from one still on the previous
 * generator — whose `launch` takes four arguments and would revert the six this
 * flow sends. Chains are migrated one at a time; until then /create is closed
 * there rather than broken.
 */
export function ladderLaunchReady(networkName: string | number): boolean {
  const chain = findChain(networkName);
  return Boolean(chain?.contracts.assetGenerator && chain.contracts.ladderBuyer);
}

export async function quoteOptions(networkName: string | number): Promise<QuoteOption[]> {
  const chain = findChain(networkName);
  const generator = chain?.contracts.assetGenerator?.address;
  if (!chain || !generator || !ladderLaunchReady(networkName)) return [];
  const config = wagmiConfig;
  const chainId = supportedChainId(chain.chainId);

  try {
    const enabled = (await readContract(config, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "enabledQuoteTokens",
    })) as readonly `0x${string}`[];
    // Test-only quotes (verify:backend's mock) are never offered to creators.
    const offered = enabled.filter((quote) => !isTestQuoteToken(chain.chainId, quote));
    if (offered.length === 0) return [];

    const rows = await Promise.all(
      offered.map(async (quote): Promise<QuoteOption | null> => {
        const [option, symbolResult, decimalsResult] = await Promise.all([
          readContract(config, {
            chainId,
            address: generator,
            abi: AssetGeneratorABI,
            functionName: "quoteOption",
            args: [quote],
          }).catch(() => null),
          readContract(config, { chainId, address: quote, abi: ERC20ABI, functionName: "symbol" }).catch(
            () => null,
          ),
          readContract(config, { chainId, address: quote, abi: ERC20ABI, functionName: "decimals" }).catch(
            () => null,
          ),
        ]);
        // A quote whose option read failed is DROPPED, not defaulted — every
        // field on this row renders as fact, same reasoning as useQuoteOptions.
        if (!option || !option.enabled) return null;

        // Decimals are NOT cosmetic here: every amount on the row is raw quote
        // units, and the dev buy is entered in them. A quote that will not say
        // is dropped rather than guessed at 18.
        if (decimalsResult === null) return null;

        return {
          symbol: symbolResult ? String(symbolResult) : shortHex(quote),
          address: quote,
          decimals: Number(decimalsResult),
          startingMarketCap: option.startingMarketCap,
          minDevBuy: option.minDevBuy,
          graduationMarketCap: option.graduationMarketCap,
          startingTakerFee: Number(option.startingTakerFee),
        };
      }),
    );
    return rows.filter((row): row is QuoteOption => row !== null);
  } catch {
    return [];
  }
}

/**
 * Whether the chain's generator takes its launch fee in the launch's QUOTE token
 * rather than as native value. True exactly where there is no gas coin to pay it
 * with: Tempo runs TempoAssetGenerator (contracts/src/tempo), whose `launchFee` is
 * in quote-token units and is pulled with `transferFrom` -- so the app approves it
 * alongside the dev buy and attaches no value (Tempo refuses value transfers).
 */
export function launchFeeInQuote(chainId: number): boolean {
  return tip20GasToken(chainId) !== null;
}

/** Launch fee (and how a launch is paid and signed) read from the generator on `networkName`. Never throws. */
export async function terms(networkName: string | number): Promise<LaunchTerms> {
  const chain = findChain(networkName);
  const generator = chain?.contracts.assetGenerator?.address;
  if (!chain || !generator) return { launchFeeEth: 0, launchFeeSymbol: "" };
  const chainId = supportedChainId(chain.chainId);
  const feeInQuote = launchFeeInQuote(chain.chainId);
  const nativeSymbol = chain.nativeCurrency.symbol;
  const ladderDeferred = (await readContract(wagmiConfig, {
    chainId,
    address: generator,
    abi: AssetGeneratorABI,
    functionName: "ladderDeferred",
  }).catch(() => false)) as boolean;
  try {
    const fee = (await readContract(wagmiConfig, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "launchFee",
    })) as bigint;
    if (!feeInQuote) {
      return { launchFeeEth: Number(formatEther(fee)), launchFeeSymbol: nativeSymbol, feeInQuote, ladderDeferred };
    }
    // In the quote's own units. Tempo's generator enables one quote (PathUSD); with
    // several, the raw fee is the same number in each, so the first names it.
    const [quote] = (await readContract(wagmiConfig, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "enabledQuoteTokens",
    })) as readonly `0x${string}`[];
    if (!quote) return { launchFeeEth: 0, launchFeeSymbol: "", feeInQuote, ladderDeferred };
    const [symbol, decimals] = (await Promise.all([
      readContract(wagmiConfig, { chainId, address: quote, abi: ERC20ABI, functionName: "symbol" }),
      readContract(wagmiConfig, { chainId, address: quote, abi: ERC20ABI, functionName: "decimals" }),
    ])) as [string, number];
    return {
      launchFeeEth: Number(formatUnits(fee, Number(decimals))),
      launchFeeSymbol: String(symbol),
      feeInQuote,
      ladderDeferred,
    };
  } catch {
    return { launchFeeEth: 0, launchFeeSymbol: feeInQuote ? "" : nativeSymbol, feeInQuote, ladderDeferred };
  }
}

/**
 * Deploys the coin, lists it, takes the dev buy and places the five-step ladder:
 * an exact `approve` of the quote, then
 * `AssetGenerator.launch(name, symbol, initialSupply, quote, devBuyQuote, lockMode)`.
 */
export async function submit(draft: LaunchDraft, networkName: string | number): Promise<LaunchReceipt> {
  const chain = findChain(networkName);
  if (!chain?.contracts.assetGenerator) {
    throw new Error(`Launching isn't available on ${String(networkName)} — no generator is deployed there.`);
  }
  if (!ladderLaunchReady(networkName)) {
    throw new Error(`Launching on ${chain.name} returns shortly. Try another network for now.`);
  }
  const config = wagmiConfig;
  const chainId = supportedChainId(chain.chainId);
  const generator = getDeployedAddress(chain.chainId, "assetGenerator");

  const account = getAccount(config);
  if (!account.address) throw new Error("Connect a wallet before launching.");

  // The wallet is routinely on a DIFFERENT chain than the page it is launching
  // from, and wagmi answers a mismatch by throwing ChainMismatchError out of
  // `simulateContract` before the wallet is asked anything — a dead button.
  // Switch first instead.
  if (account.chainId !== chainId) {
    await switchChain(config, { chainId });
  }

  const name = draft.token.name.trim();
  const symbol = draft.token.symbol.trim().toUpperCase();
  // Fixed, never from the draft: /create launches are always 1B (LAUNCH_SUPPLY).
  const initialSupply = parseRawAmount(LAUNCH_SUPPLY_TEXT, COIN_DECIMALS);
  const quote = draft.market.quote as `0x${string}`;

  // Read fresh, all of it: an admin retuning the fee or the quote option between
  // review and this click must not become a revert against a stale number.
  const [fee, option, decimals] = (await Promise.all([
    readContract(config, { chainId, address: generator, abi: AssetGeneratorABI, functionName: "launchFee" }),
    readContract(config, { chainId, address: generator, abi: AssetGeneratorABI, functionName: "quoteOption", args: [quote] }),
    readContract(config, { chainId, address: quote, abi: ERC20ABI, functionName: "decimals" }),
  ])) as [bigint, { startingMarketCap: bigint; minDevBuy: bigint; graduationMarketCap: bigint }, number];
  if (!draft.market.lockMode) throw new Error("Choose what happens to the pool after graduation.");

  // The same parse and the same three checks the form ran, against the values
  // just read — so what the creator was shown is what the transaction sends.
  const view = devBuyView(
    {
      decimals: Number(decimals),
      startingMarketCap: option.startingMarketCap,
      minDevBuy: option.minDevBuy,
      graduationMarketCap: option.graduationMarketCap,
    },
    LAUNCH_SUPPLY_TEXT,
    draft.market.devBuy,
  );
  const check = view.check;
  if (!check.ok) throw new Error(devBuyRefusal(check.reason));
  const devBuyQuote = view.raw.quoteIn;
  // Where the generator takes the fee in the quote (Tempo), the approval covers both
  // and nothing rides as value; elsewhere the fee is native value, as before.
  const feeInQuote = launchFeeInQuote(chain.chainId);
  const quoteNeeded = feeInQuote ? devBuyQuote + fee : devBuyQuote;
  const value = feeInQuote ? BigInt(0) : fee;

  // Exact amount, never unlimited, and skipped when an allowance already covers
  // it. The generator is in the registry, so the passkey wallet signs this
  // approve silently (session tier: spender is one of the venue's contracts).
  const allowance = (await readContract(config, {
    chainId,
    address: quote,
    abi: ERC20ABI,
    functionName: "allowance",
    args: [account.address, generator],
  })) as bigint;
  if (allowance < quoteNeeded) {
    const { request: approve } = await simulateContract(config, {
      chainId,
      address: quote,
      abi: ERC20ABI,
      functionName: "approve",
      args: [generator, quoteNeeded],
      account: account.address,
    });
    const approveHash = await writeContract(config, approve);
    const approved = await waitForTransactionReceipt(config, { chainId, hash: approveHash });
    if (approved.status !== "success") {
      throw new Error(feeInQuote ? "The approval for the dev buy and launch fee reverted." : "The approval for the dev buy reverted.");
    }
    // The receipt is not enough. RISE's RPC is a pool of eventually consistent
    // nodes, so the very next read can land on one that has not seen the approval
    // and the launch simulation reverts inside `transferFrom` — with an error the
    // generator's ABI cannot name, which the user sees as a blank "reverted".
    // Found by the ladder-launch e2e; the seed scripts already wait the same way
    // (e2e/seed/market.ts waitForAllowance).
    await waitForAllowance(config, chainId, quote, account.address, generator, quoteNeeded);
  }

  // Simulated first: a real transaction here spends real funds, and an
  // `eth_call` catches an argument or encoding mistake as a normal rejected
  // Promise instead of a broadcast that only fails after paying gas for it.
  //
  // Retried, briefly. RISE's public RPC is a pool whose nodes lag each other by a
  // few seconds, so a simulation right after the approval can land on a node that
  // has not seen it even after `waitForAllowance` saw it on another. Measured by
  // the ladder-launch e2e: the same call reverted in the app and succeeded from
  // cast seconds later. A real revert (wrong amount, disabled quote) still
  // surfaces, after the last attempt.
  const lockMode = LOCK_MODE_INDEX[draft.market.lockMode];
  const simulate = () =>
    simulateContract(config, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "launch",
      args: [name, symbol, initialSupply, quote, devBuyQuote, lockMode],
      value,
      account: account.address,
    });
  let simulated: Awaited<ReturnType<typeof simulate>> | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 6 && !simulated; attempt += 1) {
    try {
      simulated = await simulate();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  if (!simulated) throw lastError;
  // The send can hit the same lagging node: viem fills the transaction with
  // `eth_fillTransaction` (nonce, gas — which re-executes the call) before the
  // wallet signs, and a node that has not seen the approval reverts it. Retried
  // ONLY for those pre-signing calls: nothing has been signed or broadcast, so a
  // retry cannot send the launch twice. Anything else is thrown at once.
  let hash: `0x${string}` | undefined;
  for (let attempt = 0; attempt < 6 && !hash; attempt += 1) {
    try {
      hash = await writeContract(config, simulated.request);
    } catch (error) {
      const preSign = /eth_fillTransaction|eth_estimateGas/.test(String((error as Error)?.message ?? error));
      if (!preSign || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  if (!hash) throw new Error("The launch could not be sent.");
  const receipt = await waitForTransactionReceipt(config, { chainId, hash });

  const [launched] = parseEventLogs({ abi: AssetGeneratorABI, eventName: "Launched", logs: receipt.logs });
  if (!launched) {
    throw new Error("The launch transaction confirmed, but no Launched event was found in its receipt.");
  }
  const { coin, pair } = launched.args as { coin: `0x${string}`; pair: `0x${string}` };

  // A two-transaction launch (Tempo): the generator listed the pair, ran the dev buy
  // and closed the bands, but the five-step ladder is its own call, because the whole
  // launch does not fit the chain's per-transaction gas cap. Until it is placed the
  // coin has nothing for sale, so it is part of launching, not an optional extra.
  // Anyone may place it, so a creator who leaves here can still finish it later.
  const deferred = (await readContract(config, {
    chainId,
    address: generator,
    abi: AssetGeneratorABI,
    functionName: "ladderDeferred",
  }).catch(() => false)) as boolean;
  // What the creator actually received is the dev buy, and the event says so
  // exactly -- no balance read racing the RPC's view of the new block. Read BEFORE
  // the deferred ladder, so a ladder that fails still has a complete receipt to
  // hand the recovery screen: the launch itself succeeded and its numbers are known.
  const [bought] = parseEventLogs({ abi: AssetGeneratorABI, eventName: "DevBuy", logs: receipt.logs });
  const bought_ = bought?.args as { quoteIn: bigint; coinsOut: bigint } | undefined;
  const launchResult = {
    coinAddress: coin,
    pairAddress: pair,
    txHash: hash,
    receivedSupply: Number(formatUnits(bought_?.coinsOut ?? check.coins, COIN_DECIMALS)),
    devBuyQuote: Number(formatUnits(bought_?.quoteIn ?? devBuyQuote, Number(decimals))),
    // LaunchConfirm overwrites both when a logo was picked -- it is the step that
    // holds the upload and runs the claim, because binding needs the coin's
    // address, which does not exist until this function returns.
    logoURI: null,
    logoBound: null,
  };

  if (deferred) {
    const ladderHash = await writeContract(config, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "placeLadder",
      args: [coin],
      account: account.address,
    });
    const placed = await waitForTransactionReceipt(config, { chainId, hash: ladderHash });
    if (placed.status !== "success") {
      // Not retried from here: retrying the flow would launch a SECOND coin. The ladder
      // is still placeable by anyone with placeLadder(coin), so this is a TYPED error
      // carrying the coin address -- LaunchConfirm offers to finish it rather than
      // printing a sentence about contacting support. See lib/launch/ladderRecovery.
      throw new LadderNotPlacedError(coin, pair, networkName, launchResult);
    }
  }

  return launchResult;
}

/**
 * The execution the flow uses by default. LaunchFlow still takes an injectable
 * `execution` prop, so tests and a fully-mocked run remain one argument away.
 */
export const launchExecution: LaunchExecution = {
  uploadLogo,
  claimLogo,
  quoteOptions,
  terms,
  submit,
};

/**
 * Wait until `spender`'s allowance is visible on the read path the next call will
 * use. Bounded: past ~15 s it returns and lets the launch's own simulation report
 * whatever is really wrong.
 */
async function waitForAllowance(
  config: typeof wagmiConfig,
  chainId: ReturnType<typeof supportedChainId>,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  min: bigint,
): Promise<void> {
  for (let i = 0; i < 15; i += 1) {
    const seen = (await readContract(config, {
      chainId,
      address: token,
      abi: ERC20ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
    if (seen >= min) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

