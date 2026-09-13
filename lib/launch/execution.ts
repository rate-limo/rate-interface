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
 * `launch()`, not `launchAsset()`: the generator also exposes
 * `launchAsset(name, symbol, initialSupply, quote, settings)`, which accepts
 * the volatility/fee/liquidity-lock choices the later steps collect. This
 * seam's own type docstring (`LaunchExecution.submit`) already named `launch`
 * as the target signature, and the simpler call sidesteps a real risk with
 * `launchAsset`: its settings must satisfy `AssetLaunchLib.validateLaunchSettings`
 * exactly (preset labels are checked against their exact bps/fee values, and
 * `makerFee` has no field anywhere in the draft to source a value from — the
 * UI never collects one). A wrong guess there reverts a real transaction. The
 * practical effect is the same one `LaunchFlow`'s own top-of-file comment
 * already documents for liquidity ("It places no orders and opens no
 * position, so the step described something that never happened."): the
 * volatility, fee and liquidity steps still gate the wizard, but nothing
 * they collect reaches the chain yet. Wiring `launchAsset` is follow-up work,
 * not something to guess at here.
 *
 * The upload posts to a SAME-ORIGIN path. `/token-logo` is rewritten to
 * admin-service in next.config.ts, which keeps the browser off a cross-origin
 * request (no CORS preflight on a multipart POST) and keeps the service's
 * hostname out of the client bundle.
 */

import { formatEther, formatUnits, parseEventLogs, parseUnits, zeroAddress } from "viem";
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
import { findChain, getAddress as getDeployedAddress } from "@iter/deployments";

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
import { COIN_DECIMALS, parseAmount, shortHex } from "./mock";
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
export async function quoteOptions(networkName: string | number): Promise<QuoteOption[]> {
  const chain = findChain(networkName);
  const generator = chain?.contracts.assetGenerator?.address;
  if (!chain || !generator) return [];
  const config = wagmiConfig;
  const chainId = supportedChainId(chain.chainId);

  try {
    const enabled = (await readContract(config, {
      chainId,
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "enabledQuoteTokens",
    })) as readonly `0x${string}`[];
    if (enabled.length === 0) return [];

    const rows = await Promise.all(
      enabled.map(async (quote): Promise<QuoteOption | null> => {
        const [option, symbolResult] = await Promise.all([
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
        ]);
        // A quote whose option read failed is DROPPED, not defaulted — every
        // field on this row renders as fact, same reasoning as useQuoteOptions.
        if (!option || !option.enabled) return null;

        let listingPaymentSymbol: string | null = null;
        if (option.listingPayment !== zeroAddress) {
          const paymentSymbol = await readContract(config, {
            chainId,
            address: option.listingPayment,
            abi: ERC20ABI,
            functionName: "symbol",
          }).catch(() => null);
          listingPaymentSymbol = paymentSymbol ? String(paymentSymbol) : shortHex(option.listingPayment);
        }

        return {
          symbol: symbolResult ? String(symbolResult) : shortHex(quote),
          address: quote,
          listingPrice: Number(option.listingPrice) / 1e8,
          listingPaymentSymbol,
          // Backend-administered — see LaunchExecution's docstring. This seam
          // only reads the chain, so a real value has to come from the
          // gateway; 0 here means "not sourced yet", not "no target".
          graduationTargetQuote: 0,
          startingTakerFee: Number(option.startingTakerFee),
        };
      }),
    );
    return rows.filter((row): row is QuoteOption => row !== null);
  } catch {
    return [];
  }
}

/** Launch fee read from the generator on `networkName`. Never throws. */
export async function terms(networkName: string | number): Promise<LaunchTerms> {
  const chain = findChain(networkName);
  const generator = chain?.contracts.assetGenerator?.address;
  if (!chain || !generator) return { launchFeeEth: 0 };
  try {
    const fee = (await readContract(wagmiConfig, {
      chainId: supportedChainId(chain.chainId),
      address: generator,
      abi: AssetGeneratorABI,
      functionName: "launchFee",
    })) as bigint;
    return { launchFeeEth: Number(formatEther(fee)) };
  } catch {
    return { launchFeeEth: 0 };
  }
}

/**
 * Deploys the coin and lists it, one transaction:
 * `AssetGenerator.launch(name, symbol, initialSupply, quote)`.
 */
export async function submit(draft: LaunchDraft, networkName: string | number): Promise<LaunchReceipt> {
  const chain = findChain(networkName);
  if (!chain?.contracts.assetGenerator) {
    throw new Error(`Launching isn't available on ${String(networkName)} — no generator is deployed there.`);
  }
  const config = wagmiConfig;
  const chainId = supportedChainId(chain.chainId);
  const generator = getDeployedAddress(chain.chainId, "assetGenerator");

  const account = getAccount(config);
  if (!account.address) throw new Error("Connect a wallet before launching.");

  // The wallet is routinely on a DIFFERENT chain than the page it is launching
  // from: AppKit asks it to switch to the wallet vendor's configured default chain as part of every
  // connection handshake, so someone who opened /create?chain=arc-testnet can
  // easily be connected to RISE by the time they reach this click. Every call
  // below pins `chainId` explicitly, and wagmi answers a mismatch by throwing
  // ChainMismatchError out of `simulateContract` — before the wallet is ever
  // asked for anything. The user sees a dead button and no prompt, which is
  // indistinguishable from the app being broken. Switch first instead.
  if (account.chainId !== chainId) {
    await switchChain(config, { chainId });
  }

  const name = draft.token.name.trim();
  const symbol = draft.token.symbol.trim().toUpperCase();
  const initialSupply = parseUnits(String(parseAmount(draft.token.totalSupply)), COIN_DECIMALS);
  const quote = draft.market.quote as `0x${string}`;

  // Read fresh rather than trust an earlier `terms()` snapshot: an admin
  // changing the fee between review and this click must not turn into an
  // `InsufficientFee` revert against a stale number.
  const fee = (await readContract(config, {
    chainId,
    address: generator,
    abi: AssetGeneratorABI,
    functionName: "launchFee",
  })) as bigint;

  // Simulated first: a real transaction here spends real funds, and an
  // `eth_call` catches an argument or encoding mistake as a normal rejected
  // Promise instead of a broadcast that only fails after paying gas for it.
  const { request } = await simulateContract(config, {
    chainId,
    address: generator,
    abi: AssetGeneratorABI,
    functionName: "launch",
    args: [name, symbol, initialSupply, quote],
    value: fee,
    account: account.address,
  });
  const hash = await writeContract(config, request);
  const receipt = await waitForTransactionReceipt(config, { chainId, hash });

  const [launched] = parseEventLogs({
    abi: AssetGeneratorABI,
    eventName: "Launched",
    logs: receipt.logs,
  });
  if (!launched) {
    throw new Error("The launch transaction confirmed, but no Launched event was found in its receipt.");
  }
  const { coin, pair } = launched.args as {
    coin: `0x${string}`;
    creator: `0x${string}`;
    pair: `0x${string}`;
    quote: `0x${string}`;
    totalSupply: bigint;
  };

  // The supply mints to the generator, not the creator (see AssetGenerator's
  // docstring on `launch`) — read back what actually landed in the wallet
  // rather than estimate the listing cost client-side.
  const receivedSupplyRaw = (await readContract(config, {
    chainId,
    address: coin,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [account.address],
  }).catch(() => BigInt(0))) as bigint;

  return {
    coinAddress: coin,
    pairAddress: pair,
    txHash: hash,
    receivedSupply: Number(formatUnits(receivedSupplyRaw, COIN_DECIMALS)),
    // LaunchConfirm overwrites both when a logo was picked — it is the step that
    // holds the upload and runs the claim, because binding needs the coin's
    // address, which does not exist until this function returns.
    logoURI: null,
    logoBound: null,
  };
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
