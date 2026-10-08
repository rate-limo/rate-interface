"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeAmountInput } from "@/utils/numberInput";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import QRCode from "qrcode";
import { depositUri } from "@/lib/wallet/gasDeposit";
import { wagmiChains } from "@/lib/customChains";
import { gasFaucetFor } from "@/lib/errors/insufficientGas";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { useDepositAssets, type DepositCandidate } from "@/hooks/useDepositAssets";
import { CrossChainSources } from "./CrossChainSources";
import {
  defaultDepositAssets,
  settlementAddresses,
  needsAddress,
  searchDepositAssets,
  type AssetTrust,
} from "@/lib/wallet/depositAssets";
import {
  connectWallet,
  discoverWallets,
  preflightFunding,
  sendFunding,
  type FundingPreflight,
  hasInjectedProvider,
  injectedProvider,
  isUserRejection,
  FUNDING_STEP_LABEL,
  type DiscoveredWallet,
} from "@/lib/wallet/externalFunding";
import {
  maxDepositable,
  paysItsOwnGas,
  transferGasLimit,
} from "@/lib/wallet/depositMax";
import { requestWalletConnect } from "@/lib/wallet/connectGate";
import { useWalletPrompt } from "@/hooks/useWalletPrompt";
import { useTransferConfirmation } from "@/hooks/useTransferConfirmation";
import { gasSymbol } from "@/lib/chains/gasToken";

/**
 * Where to send gas, as a QR code and as text.
 *
 * ## Two ways in, because there are two kinds of user
 *
 * Someone on a desktop with a browser wallet copies the address and pastes it. Someone
 * whose funds live in a phone wallet cannot paste anything into it from here — they scan.
 * "Copy address" alone served only the first, which is why the toast's action opens this
 * instead of writing to the clipboard: the sheet does both, and the copy button is still
 * one tap away.
 *
 * ## The chain warning is the most important thing on the screen
 *
 * A passkey address exists on every EVM chain, so a send on the wrong one is accepted by
 * the network and simply gone — the key that could move it lives in a mera session, and
 * the app only serves the chains in `wagmiChains`. The QR carries the chain (EIP-681, see
 * `depositUri`), but a wallet that ignores the URI will default to whatever it is on, so
 * the sheet says it in words as well.
 *
 * Rendered by `/deposit`. This was a dialog until 2026-09-08; deposit and
 * withdraw are destinations -- an asset, a network, an address, a QR and a
 * transfer list -- and a dialog over the page you were reading is the wrong
 * shape for that. Nothing mounts it globally any more, so it costs nothing on
 * every other page.
 */
/**
 * A wallet's own mark, from the EIP-6963 announcement.
 *
 * The icon was in `DiscoveredWallet` from the day discovery was written and
 * nothing rendered it — the picker showed names only. It costs nothing to use:
 * wallets announce it as a `data:` URI, so there is no network request, no
 * third-party host and nothing to go stale. That last point is why this is not
 * the hotlinked-icon mistake `getChainIconUrl` was deleted for; the bytes arrive
 * with the announcement.
 *
 * People recognise the fox before they read "MetaMask", and two wallets rendered
 * as text chips look like two settings rather than two accounts.
 *
 * Falls back to the first letter. An extension MAY announce an empty icon, and a
 * broken image in a row about which account signs is worse than a plain initial.
 */
/** Three rows, matching the network list, so neither can push the address away. */
const WALLETS_PER_PAGE = 3;

function WalletMark({ wallet }: { wallet: DiscoveredWallet }) {
  const [broken, setBroken] = useState(false);
  const usable = wallet.icon && wallet.icon.startsWith("data:") && !broken;

  if (usable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a data URI from the wallet itself
      <img
        src={wallet.icon}
        alt=""
        onError={() => setBroken(true)}
        className="shrink-0 rounded-lg border border-[color:var(--m-border)] object-cover"
        // Pinned on both axes: preflight's `img { max-width: 100% }` collapses
        // the width inside a narrow flex row and the mark renders squashed.
        style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, maxWidth: 28 }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface-3,var(--m-surface-2))] font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]"
      style={{ width: 28, height: 28, minWidth: 28, minHeight: 28 }}
    >
      {wallet.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function DepositPanel({
  open,
  onDone,
  onChainChange,
  onAssetChange,
  initialAsset,
}: {
  /** What to deposit. `null` renders nothing — the dialog uses that to stay closed. */
  open: boolean;
  /** Called when the flow finishes. The dialog closes; the page navigates away. */
  onDone: () => void;
  /**
   * The chain this panel has settled on, reported upward.
   *
   * The QR belongs beside the claim form, in the page's other column — they are
   * the two halves of receiving from somewhere else — and that column cannot
   * know the network, because the network is chosen HERE by choosing an asset.
   * Lifting the answer is cheaper than lifting the whole selection.
   */
  onChainChange?: (chainId: number | null) => void;
  /** The asset now on screen, so the transfer list below can narrow to it. */
  onAssetChange?: (symbol: string | undefined) => void;
  /**
   * Preselect this symbol, from `/deposit?asset=`.
   *
   * What the portfolio's per-asset Deposit button carries. It PRESELECTS and
   * nothing more: the asset list stays rendered and stays changeable, which is
   * the difference from the `?chainId=` this page removed — that one made the
   * screen consider itself settled and hid the list entirely.
   */
  initialAsset?: string;
}) {
  const { address } = useAccount();
  // The operator's uploaded chain mark. Rendering the chain AS a token is the
  // established shape for a standalone network logo here — the ChainSwitcher and the
  // token profile's network chip both do it, and `ChainBadge` cannot be reused because
  // it is absolutely positioned to ride a token icon's corner.
  const { data: chainBrands } = useChainBrand();

  /**
   * WHICH CHAIN, chosen here when the caller did not say.
   *
   * `GasDepositRequest.chainId` is optional and often absent: the account menu
   * opens this sheet with no chain at all, because at that point nobody has
   * named one. The sheet used to render its whole network block conditionally
   * and simply omit it — a deposit screen with no network on a venue serving
   * several, which is the one thing this sheet exists to state.
   *
   * The list is the OPERATOR'S, not the build's: `useVisibleChains` filters the
   * compiled list by admin-service's display flags, so a chain hidden during an
   * incident or a testnet reset is not offered as somewhere to send money.
   */
  const visibleChains = useVisibleChains();
  const [pickedChain, setPickedChain] = useState<number | null>(null);
  const [amount, setAmount] = useState("0.05");
  const prompt = useWalletPrompt();
  /**
   * Every injected wallet, so a user with two extensions can pick.
   *
   * Discovered when the sheet OPENS — which on `/deposit` is page load, since
   * the page opens the request itself. EIP-6963 is a burst of events every
   * installed wallet answers immediately, so this costs nothing and, crucially,
   * ASKS nothing: discovery is a broadcast, not a request, and no extension
   * sees a caller. Everything that does talk to a wallet is deferred — see the
   * probe effect below for what that is and what it cost when it was not.
   */
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [picked, setPicked] = useState<DiscoveredWallet | null>(null);
  /** True once EIP-6963 discovery has actually run in this browser. */
  const [probed, setProbed] = useState(false);
  /** True while a cross-chain deposit is being confirmed — see CrossChainSources. */
  const [bridging, setBridging] = useState(false);
  /** Filter and page for the wallet list — five extensions is a common desktop. */
  const [walletQuery, setWalletQuery] = useState("");
  const [walletPage, setWalletPage] = useState(0);

  /**
   * ASSET FIRST, but only when the caller did not already name a chain.
   *
   * The gas paths — an insufficient-gas toast, the onboarding card's "Add USDC" —
   * open this with a chainId because they mean one specific thing: get the gas
   * asset, here. Asking those users to choose an asset would be a step whose
   * answer was already known.
   *
   * The account menu names nothing, and that is the case this list is for: a
   * person who wants to move money in and has not yet decided what.
   */
  const { assets, isLoading: assetsLoading } = useDepositAssets();

  /**
   * The addresses the DEPLOYMENT itself vouches for, lowercased.
   *
   * Every served chain's settlement asset — `weth` in the registry, which on
   * Arc is USDC at 0x3600…0000 and is the same funds as the gas token. These
   * are offered without waiting for `verified`, which means "graduated" and is
   * false for everything on a chain that has just been deployed.
   *
   * From `@iter/deployments`, never from the indexer or a symbol match: the
   * point is an identity nobody can mint into.
   */
  const settlement = useMemo(() => settlementAddresses(), []);
  const [assetSearch, setAssetSearch] = useState("");
  const [chosenAsset, setChosenAsset] = useState<DepositCandidate | null>(null);

  /*
   * Honour `?asset=` once, and only while nothing is chosen.
   *
   * Guarded on `chosenAsset === null` so it cannot fight the user: picking a
   * different asset must stick, and re-running this on every render of a page
   * whose URL still says USDC would drag them back. A symbol the venue does not
   * serve matches nothing and leaves the list open, so a stale link degrades to
   * the normal screen rather than to an error.
   *
   * Case-insensitive because the symbol arrives from a URL somebody may have
   * typed or lowercased on the way.
   */
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || chosenAsset || !initialAsset || assets.length === 0) return;
    const wanted = initialAsset.trim().toLowerCase();
    const match = assets.find((a) => a.token.symbol?.toLowerCase() === wanted);
    if (!match) return;
    preselected.current = true;
    setChosenAsset(match);
  }, [assets, chosenAsset, initialAsset]);


  const offered = wagmiChains.filter((c) => visibleChains.includes(c.name));
  // An asset carries its chain, so choosing one answers both questions at once —
  // which is why picking an asset does not then ask for a network.
  const activeChainId =
    chosenAsset?.chainId ?? pickedChain ?? (offered.length === 1 ? offered[0]!.id : null);
  const chain = wagmiChains.find((c) => c.id === activeChainId);
  // Reported in an effect, not during render: a parent setState mid-render is a
  // React error, and the QR beside the claim form is the only consumer.
  // The chosen asset names the screen. This read `chain.nativeCurrency` alone,
  // so picking HOOPS left the title saying "Deposit USDC" over a body about
  // HOOPS — the amount field, the button and the balance error all followed it.
  const symbol = chosenAsset?.token.symbol ?? chain?.nativeCurrency.symbol ?? "the network's gas asset";

  // Null on every production chain and on a testnet whose faucet we do not know,
  // which is the common case rather than a gap.
  const faucet = gasFaucetFor(chain?.id);

  /**
   * Has the user actually SETTLED on what to deposit?
   *
   * Not the same question as "is a chain known". `activeChainId` also resolves
   * when exactly one chain is visible, so on such a deployment every
   * chain-gated block rendered from the first frame — the amount field, the
   * wallet list, the send button and the faucet all appeared UNDER the asset
   * list, before anything had been chosen, asking the user to send an amount of
   * an asset they had not picked.
   *
   * A caller that named the chain (the gas top-up) counts: it knows what it
   * wants and there is no list to choose from.
   */
  const settled = chosenAsset !== null;

  /*
   * The wallet list, filtered and paged. Same shape as the network list, for the
   * same reason: a browser with five extensions is ordinary, and an unbounded
   * column of them pushes the amount field and the address off the screen.
   *
   * The page index is CLAMPED rather than reset in an effect — a filter that
   * shortens the list can strand it past the end, and `slice` would then render
   * nothing while the pager still claimed a page.
   */
  const matchedWallets = walletQuery.trim()
    ? wallets.filter((w) => w.name.toLowerCase().includes(walletQuery.trim().toLowerCase()))
    : wallets;
  const walletPages = Math.max(1, Math.ceil(matchedWallets.length / WALLETS_PER_PAGE));
  const walletPageIndex = Math.min(walletPage, walletPages - 1);
  const shownWallets = matchedWallets.slice(
    walletPageIndex * WALLETS_PER_PAGE,
    walletPageIndex * WALLETS_PER_PAGE + WALLETS_PER_PAGE,
  );

  // Reported only once the user has SETTLED on an asset. `activeChainId` also
  // resolves when a single chain is visible, and a page that showed the claim
  // form beside the asset list was reading that inference as a decision.
  useEffect(() => {
    onChainChange?.(settled ? (activeChainId ?? null) : null);
  }, [settled, activeChainId, onChainChange]);

  // Same gate as the chain: reported only once an asset is actually SETTLED,
  // so the list is not narrowed by an inference the user never made.
  useEffect(() => {
    // NOT `symbol`: that falls back to the sentence "the network's gas asset"
    // for display, and passing a sentence as a filter matches no row and
    // empties the list. Only a real ticker narrows it; anything else widens.
    const ticker = chosenAsset?.token.symbol ?? chain?.nativeCurrency.symbol;
    onAssetChange?.(settled ? ticker : undefined);
  }, [settled, chosenAsset, chain, onAssetChange]);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * The account the CHOSEN browser wallet has already authorised, or null.
   *
   * Connecting and sending are two decisions, and folding them into one button
   * hid the first: clicking "Deposit from a browser wallet" ran a connect, and
   * for a wallet that had already authorised the site that resolved with no
   * dialog at all — so the button appeared to do nothing while quietly moving
   * on. Asking `eth_accounts`, which never prompts, is what lets the label say
   * which of the two it means before it is pressed.
   */
  const [externalAccount, setExternalAccount] = useState<`0x${string}` | null>(null);
  const [connecting, setConnecting] = useState(false);
  /**
   * What the wallet says BEFORE the click: which account, which chain, how much
   * it holds. Read while the user is still typing an amount, because the click
   * has to reach `sendTransaction` with no await in front of it — see
   * `preflightFunding` for why a browser wallet stops opening its popup
   * otherwise.
   */
  const [preflight, setPreflight] = useState<FundingPreflight | null>(null);
  // Watches a submitted deposit to its receipt, and reports it only once that
  // receipt exists — see the hook for why broadcast is too early for both.
  const confirmation = useTransferConfirmation();

  /**
   * Is the thing being deposited the chain's own GAS asset?
   *
   * Two blocks below need this and both got it wrong in the same way, by
   * testing `chosenAsset?.native !== false` — which is also true for a NULL
   * asset, so "nothing chosen" read as "native".
   *
   * A faucet dispenses the chain's own asset, so offering "Get test USDC"
   * while HOOPS is selected answers a question nobody asked. The send route no
   * longer needs it: `sendFunding` takes an optional token and calls
   * `transfer()` on the contract.
   *
   * A caller that named the chain without an asset is a gas top-up, which is
   * native by definition.
   */
  const nativeChoice = chosenAsset?.native ?? false;

  /*
   * The QR carries the chain (EIP-681), so it cannot be drawn before one is
   * chosen — a scannable code naming no network is the failure `depositUri`
   * exists to prevent, and `settled` is the difference between a chain the user
   * picked and one that merely resolved because only one is visible.
   */
  const uri = settled && address && activeChainId !== null ? depositUri(address, activeChainId) : null;
  useEffect(() => {
    if (!uri) {
      setQr(null);
      return;
    }
    let live = true;
    QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      // Pure black on white, deliberately NOT the theme tokens: a scanner needs
      // maximum contrast, and a dark-theme QR in muted greys looks right and
      // does not scan. The white plate in the markup frames it.
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((data) => {
        if (live) setQr(data);
      })
      .catch(() => {
        // The address is still on screen as text, so this degrades to
        // copy-and-paste rather than to nothing.
        if (live) setQr(null);
      });
    return () => {
      live = false;
    };
  }, [uri]);

  /**
   * NOTHING here may speak to a wallet before the user asks it to.
   *
   * ## What this replaced, and why the softer version was not enough
   *
   * The panel used to probe EVERY discovered wallet the moment it opened —
   * which on `/deposit` is page load, since the page opens the request itself:
   * `eth_chainId` at each announced provider, then `eth_accounts` at each one
   * that answered. Both are silent in MetaMask and Rabby, the wallets it was
   * written against, and that is why `probeWallets` called `eth_chainId` "a
   * silent read that any EVM provider answers". It is not silent everywhere. A
   * wallet that treats the first request from an unknown origin as a request to
   * CONNECT opens its approval popup — so merely visiting the deposit page
   * raised a dialog from an extension the user had not picked and might never
   * use, and in dev raised it twice, because Strict Mode remounts and the
   * effect keyed on a fresh request object.
   *
   * The obvious fix — probe only the wallet the user selected — does not hold
   * here. A lone installed wallet is auto-selected, and `/deposit?chainId=…`
   * (the gas top-up link) arrives already settled on an asset, so both gates
   * are satisfied on the first frame and the prompt comes back.
   *
   * So the rule is the strict one: the FIRST request to any wallet is the
   * Connect click. Discovery stays, because EIP-6963 announcement is a
   * broadcast that asks nothing of anybody.
   *
   * ## What that costs, deliberately
   *
   * The button can no longer say "Deposit" before a connect, so a returning
   * user whose wallet already authorises this site clicks Connect, sees no
   * dialog, and watches the button become "Deposit 0.05 USDC". That is one
   * extra click — and it is NOT the dead-button bug recorded above, which was
   * one button doing connect-and-send where a silent connect left nothing on
   * screen to show it had happened. Here the connect visibly advances the step.
   *
   * We also stop filtering out wallets that cannot carry an EVM transfer, and
   * stop floating an already-connected one to the front of the list. Both were
   * bought with a request per installed wallet, which is the thing that must
   * not happen.
   */
  useEffect(() => {
    // Switching wallets clears the connection: each extension authorises this
    // site separately, so MetaMask being connected says nothing about Rabby.
    setExternalAccount(null);
  }, [picked]);

  /**
   * Does the connected wallet hold enough?
   *
   * Known before the click, because the preflight already read the balance —
   * so a shortfall is said on the button instead of costing a signature to
   * discover. Parsed in the ASSET's decimals: Arc's native view is 18 while its
   * USDC contract is 6, and comparing across the two is a 10^12 error.
   */
  const short = useMemo(() => {
    if (!preflight || !chain || !(Number(amount) > 0)) return false;
    try {
      const decimals = chosenAsset ? chosenAsset.token.decimals : chain.nativeCurrency.decimals;
      return preflight.held < parseUnits(amount, decimals);
    } catch {
      // An amount that will not parse is not a shortfall; the field guards it.
      return false;
    }
  }, [preflight, chain, amount, chosenAsset]);

  /**
   * What the connected wallet holds, and the most of it that can actually be
   * sent.
   *
   * The panel already read the balance for `short` above and showed the user
   * none of it — so the amount field was a blank box with no indication of what
   * was available, and the only way to discover a shortfall was to type past it.
   *
   * Max is not simply the balance. On Arc the gas asset IS USDC, so depositing
   * USDC pays for itself: a Max of the whole balance produces an amount the
   * wallet then refuses. `maxDepositable` holds back a deliberately generous
   * gas reserve, scaling between the 18-decimal gas view and the 6-decimal
   * ERC-20 one — see that module for why the scaling is written out rather than
   * assumed.
   */
  const spendable = useMemo(() => {
    if (!preflight || !chain) return null;
    const decimals = chosenAsset ? chosenAsset.token.decimals : chain.nativeCurrency.decimals;
    const max = maxDepositable({
      held: preflight.held,
      // Symbol against the REGISTRY, never a hardcoded list: Arc's gas asset is
      // USDC and no such list contains it.
      paysGas: paysItsOwnGas(symbol, chain.nativeCurrency.symbol),
      gasPrice: preflight.gasPrice,
      gasLimit: transferGasLimit(Boolean(chosenAsset && !chosenAsset.native)),
      nativeDecimals: chain.nativeCurrency.decimals,
      assetDecimals: decimals,
    });
    return {
      held: formatUnits(preflight.held, decimals),
      max: formatUnits(max, decimals),
      /** True when gas was held back, so the UI can say why Max < balance. */
      reserved: max < preflight.held,
    };
  }, [preflight, chain, chosenAsset, symbol]);

  const fundingToken = useMemo(
    () =>
      chosenAsset && !chosenAsset.native
        ? {
            address: chosenAsset.token.id as `0x${string}`,
            decimals: chosenAsset.token.decimals,
            symbol: chosenAsset.token.symbol,
          }
        : undefined,
    [chosenAsset],
  );

  // Re-read whenever anything it depends on moves. Cheap: three silent RPC
  // calls the wallet answers without a dialog, and they are the three that must
  // NOT sit between the click and the signature.
  useEffect(() => {
    if (!chain || !externalAccount) {
      setPreflight(null);
      return;
    }
    let live = true;
    void preflightFunding({
      chainId: chain.id,
      amount,
      wallet: picked ?? undefined,
      token: fundingToken,
    }).then((result) => {
      if (live) setPreflight(result);
    });
    return () => {
      live = false;
    };
  }, [chain, externalAccount, picked, amount, fundingToken]);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // An insecure context or a permissions policy. The address is visible
      // either way; claiming a copy that did not happen is the only wrong
      // answer here.
      toast.info("Copy is unavailable here", { description: "Select the address above instead." });
    }
  };

  useEffect(() => {
    if (!open) return;
    // A fresh sheet does not inherit the previous deposit's chain. Sending to the
    // wrong network is unrecoverable, so nothing about that choice is sticky.
    setPickedChain(null);
    setChosenAsset(null);
    setAssetSearch("");
    prompt.end();
    void discoverWallets().then((found) => {
      /*
       * The list is what ANNOUNCED itself: unfiltered, unsorted, unasked.
       *
       * It used to be probed first — `eth_chainId` to drop wallets that cannot
       * carry an EVM transfer, `eth_accounts` to float an already-connected one
       * to the front. Both are requests, and a request here reaches every
       * extension the user owns before they have expressed any intent at all;
       * the probe effect above records what that cost.
       *
       * What this gives up is real and is the accepted trade. A wallet speaking
       * another protocol now appears in the list and is reported as unusable
       * only once it is chosen — which is at least an answer in context, rather
       * than a silent omission bought with a dialog from every wallet
       * installed. And the ordering no longer favours a connected wallet.
       */
      setWallets(found);
      // Set only after discovery resolves, which is what makes the "no wallet
      // found" row below safe to render: `hasInjectedProvider()` reads
      // `window.ethereum`, so branching on it during the first render would say
      // one thing on the server and another in a browser that has MetaMask.
      // Same hydration rule as the consent banner and the OG Pass countdown.
      setProbed(true);
      // Auto-select only when there is no choice to make. With two wallets the
      // user picks, because picking for them is how a deposit gets signed from
      // an account they did not mean to use.
      setPicked(found.length === 1 ? found[0]! : null);
    });
  }, [open]);


  if (!open) return null;

  return (
    <>
      {/* The panel owns its heading, so the page and the dialog say the same
          thing and the title tracks the chain the user picks rather than only
          the one the caller named. The dialog contributes a visually hidden
          DialogTitle for the a11y contract Radix requires. */}
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-[color:var(--m-text-primary)]">
          Deposit {symbol}
        </h1>
        <p className="text-sm text-[color:var(--m-text-secondary)]">
          {chosenAsset
            ? `Add ${chosenAsset.token.symbol} to this wallet on ${chosenAsset.chainName}.`
            : "Choose what to add to this wallet. The asset decides the network."}
        </p>
      </div>

        {/* THE ASSET LIST — the account-menu case, where nothing has been named.
            
            Curated by `defaultDepositAssets`: what this wallet holds, then only
            what is verified or graduated. That is a SAFETY filter rather than a
            relevance one — anyone can launch a token here, including one whose
            symbol is already taken, so an uncurated list is a way to send money
            to the wrong `USDC`. The tail is reachable by searching, and a search
            result always shows its address because a symbol is not an identity. */}
        {!chosenAsset && (
          <div className="flex flex-col gap-2">
            <input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search any token, or paste an address"
              aria-label="Search assets"
              className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] focus:border-[color:var(--m-primary)]"
            />

            {assetsLoading && (
              <p className="py-4 text-center text-[12px] text-[color:var(--m-text-secondary)]">
                Loading assets…
              </p>
            )}

            <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
              {(() => {
                const searching = assetSearch.trim().length > 0;
                const rows = searching
                  ? searchDepositAssets(assets.map((a) => a.token), assetSearch)
                  : defaultDepositAssets(assets.map((a) => a.token), settlement);
                // Back to the candidate, which is what carries the chain.
                const byId = new Map(assets.map((a) => [a.token.id, a]));
                if (rows.length === 0 && !assetsLoading) {
                  return (
                    <p className="py-4 text-center text-[12px] text-[color:var(--m-text-secondary)]">
                      {searching
                        ? "No token matches that."
                        : assets.length > 0
                          ? // Curated is empty but the venue is not. On a chain
                            // where nothing has graduated yet this was the whole
                            // screen, and "No assets available yet" is false —
                            // every one of them is a search away, which is what
                            // the curation intends and what this now says.
                            "Nothing is listed yet. Search by name, or paste an address."
                          : "No assets available yet."}
                    </p>
                  );
                }
                return rows.map(({ token, trust }) => {
                  const candidate = byId.get(token.id);
                  if (!candidate) return null;
                  return (
                    <button
                      key={`${candidate.chainId}:${token.id}`}
                      type="button"
                      onClick={() => setChosenAsset(candidate)}
                      className="flex items-center gap-2.5 rounded-xl border border-transparent bg-[color:var(--m-surface-2)] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--m-primary)]"
                    >
                      {/* `chainName` rather than `badge={false}`: this list is
                          CROSS-CHAIN, so the network is part of what a row is,
                          and ChainBadge rides the token exactly as it does on
                          every other market row in the app. The name below stays
                          for the same reason a chip has a label. */}
                      <TokenImageIcon
                        symbol={token.symbol}
                        color="#666666"
                        logoURI={token.logoURI ?? undefined}
                        size="md"
                        chainName={candidate.chainName}
                        className="h-6 w-6"
                      />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
                            {token.symbol}
                          </span>
                          <TrustBadge trust={trust} />
                        </span>
                        <span className="truncate font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                          {/* An unverified row must be identifiable by ADDRESS —
                              it is the only thing that distinguishes two tokens
                              sharing a symbol. A curated row never needs one. */}
                          {needsAddress(trust)
                            ? `${token.id.slice(0, 6)}…${token.id.slice(-4)} · ${candidate.chainName}`
                            : candidate.chainName}
                        </span>
                      </span>
                      {Number(token.balance ?? 0) > 0 && (
                        <span className="ml-auto shrink-0 font-dm-mono text-[11px] tabular-nums text-[color:var(--m-text-primary)]">
                          {Number(token.balance).toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* CHOOSE THE CHAIN when nobody has. A deposit needs a network before it
            needs anything else — the amount, the address and the QR are all
            meaningless until one is picked, and a send on the wrong chain is
            accepted by the network and gone. So this comes first and everything
            below is gated on it. */}
        {/* Only when the asset list could not be built — a gateway down, or a
            wallet with nothing and no listed tokens to offer. Otherwise choosing
            an asset has already answered this, since every asset carries its
            chain. */}
        {!chain && !assetsLoading && assets.length === 0 && offered.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-dm-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--m-text-secondary-2)]">
              Which chain?
            </span>
            <div className="flex flex-col gap-1.5">
              {offered.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPickedChain(option.id)}
                  className="flex items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--m-primary)]"
                >
                  <TokenImageIcon
                    symbol={option.name}
                    color="#666666"
                    logoURI={chainIconFrom(chainBrands, option.name)}
                    size="md"
                    badge={false}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-[color:var(--m-text-primary)]">
                      {option.name}
                    </span>
                    <span className="font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
                      Fees in {gasSymbol(option.id, option.nativeCurrency.symbol)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* WHAT WAS CHOSEN, stated ONCE.
            
            There is no separate network card: on a cross-chain deposit the
            asset IS the network — every candidate carries its chain — so two
            blocks invited them to disagree, and the card claimed a network
            before an asset had been picked at all.

            The gate is `chosenAsset`, NOT `chain`. `activeChainId` also
            resolves when exactly one chain is visible, and on such a deployment
            `chain` is truthy from the first render — so a `chain` gate printed
            a network card underneath the asset list, next to rows already
            carrying that same network on every one of them. An INFERRED chain
            is not a choice, and only a choice is worth confirming.

            It used to have a second shape, for a caller that named a chain with
            no asset chosen. That caller is gone with `?chainId=`, and so is the
            shape: every path to this screen now goes through choosing an asset.

            The chain ID travels with the name: funds sent on the wrong chain are
            gone, wallets label the same network differently ("Arc", "Arc
            Testnet", "ARC-T"), and the number is what a user compares against
            their wallet's own network screen. */}
        {chosenAsset && chain && (
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5">
            <TokenImageIcon
              symbol={chosenAsset.token.symbol}
              color="#666666"
              logoURI={chosenAsset.token.logoURI ?? undefined}
              size="md"
              chainName={chosenAsset.chainName}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-[color:var(--m-text-primary)]">
                {`${chosenAsset.token.symbol} on ${chain.name}`}
              </span>
              <span className="font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
                {`Chain ID ${chain.id}`}
              </span>
            </div>
            {chosenAsset && (
              <button
                type="button"
                onClick={() => {
                  setChosenAsset(null);
                  setAssetSearch("");
                }}
                className="ml-auto shrink-0 rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 text-[11.5px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
              >
                Change
              </button>
            )}
          </div>
        )}

        {/* WHERE IT CAN COME FROM, once an asset is chosen and a wallet is
            connected — the order this section needs, and the reverse of the
            list above it.

            The asset list is what THIS wallet could receive on Rate's chains.
            This is where that same asset already sits, on chains Rate does not
            serve and should not start serving. It renders nothing until an
            operator has proved a route, so on a fresh deployment the panel is
            exactly what it was. */}
        {settled && chain && (
          <CrossChainSources
            asset={symbol}
            tokenSymbol={symbol}
            chainId={chain.id}
            destinationName={chain.name}
            amount={amount}
            externalAddress={externalAccount}
            onBridgingChange={setBridging}
            provider={picked?.provider ?? injectedProvider()}
            recipient={address ?? null}
          />
        )}

        {/* SEND IT, from a browser wallet, in one signature.
            
            This is the only place an injected wallet appears in the app now — it
            is no longer a connector (see `lib/providers.tsx`), because as a
            SIGNER it forces a network switch into the middle of every
            cross-chain trade. Here that same single-chain nature costs nothing:
            a deposit is one transaction, on one chain, that the person has
            already decided to make. `externalFunding` talks EIP-1193 directly
            and can never become `useAccount()`.

            Hidden entirely without a provider rather than shown disabled: on a
            phone there is no extension to enable, and a dead button would be
            telling that user to install something they cannot use. The QR below
            is their path, and it is already there. */}
        {/* Any asset, not just the gas one: `sendFunding` takes an optional
            token and calls `transfer()` on the contract instead of moving a
            native value. `nativeChoice` now gates only the FAUCET. */}
        {/* NO BROWSER WALLET — said, not omitted.
        
            This block used to be hidden outright without a provider, and the
            reasoning was sound for phones: there is no extension to install, so
            a dead "Connect" button would be telling that user to do something
            they cannot. But it also hid the step from a desktop user with no
            wallet, who then saw a deposit screen that simply skips the part
            everyone else sees — which reads as broken rather than as absent.

            The resolution is copy that is true in both places. It names the
            situation and points at the QR that is already on this page, and it
            asks nobody to install anything — so it needs no phone/desktop
            sniffing, which would be fragile and is what the original comment was
            really avoiding.

            Gated on `probed` rather than on `hasInjectedProvider()` alone: that
            reads `window.ethereum`, and branching on it during the first render
            would print this row on the server and then remove it in a browser
            that has a wallet. */}
        {settled && chain && address && probed && !bridging && !hasInjectedProvider() && (
          <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5">
            <span
              aria-hidden
              className="flex shrink-0 items-center justify-center rounded-lg border border-[color:var(--m-border)] font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]"
              style={{ width: 28, height: 28, minWidth: 28, minHeight: 28 }}
            >
              ?
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-[color:var(--m-text-primary)]">
                No browser wallet found
              </span>
              <span className="block font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                send {symbol} to the address below from any wallet
              </span>
            </span>
          </div>
        )}

        {/* Hidden while a bridge is being confirmed: sending directly on this
            chain and bringing the asset from another are the same decision made
            two ways, and both on screen meant two Deposit buttons with different
            amounts, one above the other. */}
        {settled && chain && address && !bridging && hasInjectedProvider() && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
                className="min-w-0 flex-1 bg-transparent font-dm-mono text-[15px] tabular-nums text-[color:var(--m-text-primary)] outline-none"
                aria-label={`Amount of ${symbol} to deposit`}
              />
              <span className="shrink-0 font-dm-mono text-[12px] text-[color:var(--m-text-secondary)]">
                {symbol}
              </span>
              {/* Only once a wallet is connected: before that there is no
                  balance to name, and a Max button with nothing behind it is a
                  control that does nothing. */}
              {externalAccount && spendable && (
                <button
                  type="button"
                  onClick={() => setAmount(spendable.max)}
                  className="shrink-0 rounded-lg border border-[color:var(--m-border)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
                >
                  Max
                </button>
              )}
            </label>
            {externalAccount && spendable && (
              <p className="px-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
                Balance{" "}
                <span className="tabular-nums text-[color:var(--m-text-secondary)]">
                  {spendable.held} {symbol}
                </span>
                {/* Say WHY Max is short of the balance, rather than leaving a
                    discrepancy the user has to work out. On Arc this is the
                    normal case, not an edge one. */}
                {spendable.reserved && <> · Max leaves a little {symbol} for gas</>}
              </p>
            )}
            {prompt.stage === "idle" && !externalAccount ? (
              /* STEP ONE — connect, by picking the wallet to connect WITH.
                 
                 This was a row of name chips plus a separate Connect button, so
                 choosing and connecting were two clicks for one decision, and
                 the button sat DISABLED until a chip was picked — a disabled
                 primary control with no explanation beside it reads as a broken
                 screen far more often than as "choose one first".

                 The row is the action now, which also deletes `picked` and the
                 disabled state with it. And it fixes a blind spot: with exactly
                 one wallet installed the chips did not render at all, so the
                 button said "Connect your wallet" and the user could not tell
                 WHICH wallet they were about to authorise. One wallet is now one
                 row, named and marked, exactly like three. */
              <>
                <p className="font-dm-mono text-[11px] uppercase tracking-wide text-[color:var(--m-text-secondary)]">
                  Deposit from
                </p>

                {/* Past a handful, a column of extensions is the same scanning
                    problem the network list had — and a browser with five
                    wallets installed is ordinary, not an edge case. */}
                {wallets.length > WALLETS_PER_PAGE && (
                  <input
                    value={walletQuery}
                    onChange={(event) => {
                      setWalletQuery(event.target.value);
                      setWalletPage(0);
                    }}
                    placeholder="Search wallets"
                    aria-label="Search your installed wallets"
                    className="w-full rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[13px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  {shownWallets.map((w) => (
                    <button
                      key={w.rdns}
                      type="button"
                      disabled={connecting}
                      onClick={() => {
                        setPicked(w);
                        setConnecting(true);
                        void connectWallet(w)
                          .then((account) => setExternalAccount(account))
                          .catch((error: unknown) => {
                            // Dismissing the connect dialog is a decision, not a
                            // failure — the same rule the send path below follows.
                            if (!isUserRejection(error)) {
                              toast.error("Could not connect", {
                                description: error instanceof Error ? error.message : String(error),
                              });
                            }
                          })
                          .finally(() => setConnecting(false));
                      }}
                      className="flex items-center gap-2.5 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--m-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <WalletMark wallet={w} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[color:var(--m-text-primary)]">
                        {w.name}
                      </span>
                      <span className="shrink-0 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                        {connecting && picked?.rdns === w.rdns ? "Waiting…" : "Connect"}
                      </span>
                    </button>
                  ))}
                  {shownWallets.length === 0 && (
                    <p className="px-1 py-2 text-[12px] text-[color:var(--m-text-secondary)]">
                      No wallet matches &ldquo;{walletQuery}&rdquo;.
                    </p>
                  )}
                </div>

                {walletPages > 1 && (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="font-dm-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary)]">
                      {walletPageIndex * WALLETS_PER_PAGE + 1}&ndash;
                      {walletPageIndex * WALLETS_PER_PAGE + shownWallets.length} of{" "}
                      {matchedWallets.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setWalletPage(walletPageIndex - 1)}
                        disabled={walletPageIndex === 0}
                        aria-label="Previous page of wallets"
                        className="rounded-lg border border-[color:var(--m-border)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setWalletPage(walletPageIndex + 1)}
                        disabled={walletPageIndex >= walletPages - 1}
                        aria-label="Next page of wallets"
                        className="rounded-lg border border-[color:var(--m-border)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] disabled:opacity-40"
                      >
                        Next
                      </button>
                    </span>
                  </div>
                )}

                {/* A WAY OUT of the wait — the same one the send step below has
                    had all along, and the connect step did not.

                    `eth_requestAccounts` is not guaranteed to settle. An
                    extension whose connection to its own background worker has
                    broken shows a spinner in its popup and never answers: the
                    promise neither resolves nor rejects, so `.finally` never
                    runs and the button stays disabled reading "Waiting for your
                    wallet…" until the page is reloaded. That is a dead end
                    reached through no fault of the user, on the only control
                    that advances the screen.

                    It stops WAITING, not the request. Nothing here can withdraw
                    a prompt already queued inside an extension, so the wording
                    does not pretend otherwise — and if the wallet does answer
                    later, the handler above still records the account. */}
                {connecting && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] leading-4 text-[color:var(--m-warning-600)]">
                      Not seeing it? Requests wait inside the extension — open{" "}
                      {picked?.name ?? "your wallet"} from the browser toolbar.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConnecting(false)}
                      className="self-start text-[11.5px] font-medium text-[color:var(--m-text-secondary)] underline-offset-2 hover:underline"
                    >
                      Stop waiting
                    </button>
                  </div>
                )}
              </>
            ) : prompt.stage === "idle" ? (
              <button
                type="button"
                disabled={!(Number(amount) > 0) || !preflight || short}
                onClick={() => {
                  if (!preflight) return;
                  prompt.begin(picked);
                  // NOTHING is awaited before this call. Every read it needs
                  // was done by the preflight above, so the wallet request is
                  // the first thing the click does and the gesture still
                  // belongs to it.
                  void sendFunding({
                    to: address,
                    chainId: chain.id,
                    amount,
                    account: preflight.account,
                    wallet: picked ?? undefined,
                    token: fundingToken,
                    needsSwitch: !preflight.onChain,
                    onStep: prompt.report,
                  })
                    .then((hash) => {
                      prompt.end();
                      // NOT reported here. identity-service verifies a transfer
                      // by reading its receipt, and a transaction that has just
                      // been broadcast has none — the report answered 404 and
                      // wrote nothing, silently, while the local row made the
                      // list look right on this machine alone.
                      confirmation.watch({
                        hash,
                        chainId: chain.id,
                        kind: "deposit",
                        account: address,
                        symbol,
                        amount,
                      });
                      toast.success(`Submitted ${amount} ${symbol}`, {
                        description: `${hash.slice(0, 10)}… — confirming on ${chain.name}.`,
                      });
                    })
                    .catch((error: unknown) => {
                      prompt.end();
                      // Dismissing a wallet prompt is a decision, not a failure —
                      // the same rule `lib/wallet/index.ts` applies to connecting.
                      if (!isUserRejection(error)) {
                        toast.error("Deposit failed", {
                          description: error instanceof Error ? error.message : String(error),
                        });
                      }
                    });
                }}
                className="w-full rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* Now that connecting is its own step, this names the amount
                    and the asset rather than the mechanism. The shortfall is
                    known before the click, so it is said here rather than
                    spending a signature to discover it. */}
                {!(Number(amount) > 0)
                  ? `Enter an amount of ${symbol}`
                  : !preflight
                    ? "Checking your wallet…"
                    : short
                      ? `Not enough ${symbol} in that wallet`
                      : `Deposit ${amount} ${symbol}`}
              </button>
            ) : (
              /* WAITING. The app cannot tell whether the prompt actually appeared —
                 there is no event for either — so this adds help on a timer and
                 never converts the wait into a failure. Nothing is removed as it
                 escalates, because the request stays approvable throughout. */
              <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--m-border)] border-t-[color:var(--m-primary)] motion-reduce:animate-none"
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
                      Waiting for {prompt.wallet?.name ?? "your wallet"}
                    </span>
                    <span className="truncate text-[11px] text-[color:var(--m-text-secondary)]">
                      {prompt.step ? FUNDING_STEP_LABEL[prompt.step] : "Opening…"}
                    </span>
                  </span>
                </div>

                {/* A QUESTION, not a claim. It may well be on screen and simply
                    unread, and "your wallet did not open" is something this app
                    has no way to know. */}
                {prompt.stage !== "waiting" && (
                  <p className="text-[11px] leading-4 text-[color:var(--m-warning-600)]">
                    Not seeing it? Requests wait inside the extension — open{" "}
                    {prompt.wallet?.name ?? "your wallet"} from the browser toolbar.
                  </p>
                )}

                {prompt.stage === "alternatives" && (
                  <p className="text-[11px] leading-4 text-[color:var(--m-text-secondary)]">
                    The request is still open and approving it still works. You can also
                    scan the code below instead.
                  </p>
                )}

                {/* Stops WAITING, not the request. Nothing here can withdraw a
                    prompt already queued in an extension, so the wording does not
                    promise that it does. */}
                <button
                  type="button"
                  onClick={() => prompt.end()}
                  className="self-start text-[11.5px] font-medium text-[color:var(--m-text-secondary)] underline-offset-2 hover:underline"
                >
                  Stop waiting
                </button>
              </div>
            )}
            {prompt.stage === "idle" && (
              <p className="text-center text-[11px] text-[color:var(--m-text-secondary-2)]">
                {externalAccount
                  ? /* Which account is about to be debited. Two extensions, or
                       one holding several accounts, is the normal case — and
                       "it sent from the wrong address" is unrecoverable. */
                    `Sending from ${externalAccount.slice(0, 6)}…${externalAccount.slice(-4)}. Your wallet will ask to switch to ${chain.name} if it is not there already.`
                  : `Your wallet will ask to switch to ${chain.name} if it is not there already.`}
              </p>
            )}
          </div>
        )}

        {/* Above the address, because on a chain where the asset is FREE the tap is a
            better answer than "here is where to send some". Shown permanently rather
            than only on a first run: this sheet is reached from the account menu long
            before anything has gone wrong, and the error toast already offers the same
            link — a menu whose Deposit helped less than an error message would be an
            odd thing to ship.

            Testnets only, and `gasFaucetFor` enforces that rather than this component:
            on a production chain nothing hands anybody the gas asset, so the button
            would link to a page that cannot help. */}
        {/* Only for the GAS asset. A faucet dispenses the chain's own asset, so
            this offered "Get test USDC" while a launched coin was selected. */}
        {settled && nativeChoice && faucet && address && (
          <div className="flex flex-col gap-3">
            <a
              href={faucet.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]"
            >
              {faucet.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[color:var(--m-border)]" />
              <span className="font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--m-text-secondary-2)]">
                or send your own
              </span>
              <span className="h-px flex-1 bg-[color:var(--m-border)]" />
            </div>
          </div>
        )}

        {/* WHERE THE TRANSFER GOT TO. The panel announced "Sending…" and
            then went quiet, so a mined deposit, a pending one and a
            reverted one all looked the same. A reverted transaction HAS a
            receipt, so only `receipt.status` separates the last two. */}
        {confirmation.status !== "idle" && confirmation.transfer && (
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
              confirmation.status === "reverted"
                ? "border-[color:var(--m-error)]/40 bg-[color:var(--m-error)]/10"
                : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]",
            )}
          >
            {confirmation.status === "confirming" && (
              <span
                className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--m-border)] border-t-[color:var(--m-primary)] motion-reduce:animate-none"
                aria-hidden
              />
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
                {confirmation.status === "confirming"
                  ? `Confirming ${confirmation.transfer.amount} ${confirmation.transfer.symbol}`
                  : confirmation.status === "confirmed"
                    ? `Deposited ${confirmation.transfer.amount} ${confirmation.transfer.symbol}`
                    : "That transaction failed on chain"}
              </span>
              <span className="truncate font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
                {confirmation.transfer.hash.slice(0, 14)}…
              </span>
            </span>
            {confirmation.status !== "confirming" && (
              <button
                type="button"
                onClick={confirmation.reset}
                className="ml-auto shrink-0 rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 text-[11.5px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* WHERE IT GOES. Inside this card rather than beside it, and only
            after an asset is chosen: the address is what the whole page is
            for, and the network warning under it can only be written once a
            network is known. */}
        {/* TWO different things are called a wallet on this screen, and this
            block is about the one people were not reading it as.

            Funds arrive in the Rate ACCOUNT — a passkey wallet, the destination,
            and the thing whose address the QR encodes. They are sent FROM a
            browser extension, chosen a few lines above. "No wallet is connected"
            named neither, so someone who had just connected MetaMask to deposit
            was told to connect a wallet, and the sentence read as false.

            It is also a routine state rather than an error: the passkey key
            lives only inside a live mera session, so a hard reload ends it by
            design (see the wallet section of apps/web/CLAUDE.md). The wording
            asks for a tap, it does not report a fault. */}
        {settled && !address && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-[color:var(--m-surface-2)] px-3 py-6 text-center">
            <p className="text-xs font-semibold text-[color:var(--m-text-primary)]">
              Sign in to see your deposit address
            </p>
            <p className="text-[11.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
              Deposits land in your Rate account, so its address is what this page shows —
              and a passkey unlocks it. The outside wallet you send from is a separate
              choice, made after that.
            </p>
            {/* OFFERED, not described. This said "Use Connect Wallet at the top
                of the page", which names a control that is not always on screen:
                AppShell's chrome is `hidden min-[1200px]:*`, so below that width
                the sentence points at nothing, and an instruction pointing at a
                button the reader cannot see reads as the app being broken.

                WithdrawPanel's sign-in state already made this call, and its
                comment gives the reason: the session ending is not a mistake the
                user made, and the fix is one tap. `requestWalletConnect` is the
                same plain function every other gated control uses; the dialog is
                mounted once in AppShell. */}
            <button
              type="button"
              onClick={() => requestWalletConnect("See your deposit address")}
              className="mt-2 self-center rounded-lg border border-[color:var(--m-border)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
            >
              Sign in
            </button>
          </div>
        )}

        {settled && address && (
          <div className="flex flex-col gap-4 border-t border-[color:var(--m-border)] pt-4">
            {qr && (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise */}
                <img
                  src={qr}
                  alt={`QR code containing this wallet's address${chain ? ` on ${chain.name}` : ""}`}
                  className="h-[196px] w-[196px] rounded-xl border border-[color:var(--m-border)] bg-white p-2"
                />
                {/* Captioned, because a QR is the one thing here that gets
                    screenshotted and sent to someone else — and a code with no
                    network beside it is how funds end up on the wrong chain. */}
                {chain && (
                  <span className="font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
                    {chain.name} · {chain.id}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void copy()}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--m-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)]"
            >
              {/* Whole address, never truncated: this is the value being checked
                  against a wallet screen, and an ellipsis in the middle is
                  exactly where a lookalike address would differ. */}
              <span className="min-w-0 flex-1 break-all font-dm-mono text-[12px] leading-5 text-[color:var(--m-text-primary)]">
                {address}
              </span>
              <span className="shrink-0 text-[color:var(--m-text-secondary)]">
                {copied ? <Check size={16} className="text-[color:var(--m-success)]" /> : <Copy size={16} />}
              </span>
            </button>
            <span aria-live="polite" className="sr-only">{copied ? "Address copied" : ""}</span>

            {chain && (
              <p className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5 text-[11px] leading-5 text-[color:var(--m-text-secondary)]">
                <strong className="font-medium text-[color:var(--m-text-primary)]">
                  {chain.name} only.
                </strong>{" "}
                This address exists on every network, so anything sent on a different one
                is not recoverable from here. The QR names the network for wallets that
                read it — check yours is on {chain.name} before sending.
              </p>
            )}
          </div>
        )}
    </>
  );
}

/**
 * How much a listed asset can be trusted, in one chip.
 *
 * `held` shows nothing: a token already in the wallet needs no vouching, and a
 * badge on every row is a badge nobody reads. The distinction matters because
 * anyone can launch a coin here, including one whose symbol is already taken.
 */
function TrustBadge({ trust }: { trust: AssetTrust }) {
  if (trust === "held") return null;
  const label = trust === "graduated" ? "graduated" : trust === "verified" ? "verified" : "unverified";
  const tone =
    trust === "unverified"
      ? "border-[color:var(--m-warning-600)]/45 text-[color:var(--m-warning-600)]"
      : "border-[color:var(--m-success-fg)]/40 text-[color:var(--m-success-fg)]";
  return (
    <span className={`shrink-0 rounded border px-1 font-dm-mono text-[8.5px] ${tone}`}>
      {label}
    </span>
  );
}
