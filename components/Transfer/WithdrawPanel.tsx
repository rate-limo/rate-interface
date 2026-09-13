"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useSendTransaction, useWriteContract } from "wagmi";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { toast } from "sonner";
import { splitWithdrawal } from "@/lib/wallet/withdrawSplit";
import { buildWithdrawalBatch } from "@/lib/wallet/batchTransfer";
import { canBatch, sendBatch } from "@/lib/wallet/sendBatch";
import { FEE_WALLET, feeWalletConfigured } from "@/lib/wallet/feeWallet";
import { cn } from "@/lib/utils";
import { normalizeAmountInput } from "@/utils/numberInput";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import { wagmiChains } from "@/lib/customChains";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import {
  isPlausibleAddress,
  isSelfSend,
} from "@/lib/wallet/withdraw";
import { RecipientPicker } from "./RecipientPicker";
import { useTransferConfirmation } from "@/hooks/useTransferConfirmation";
import {
  describeWithdrawBlock,
  describeWithdrawFailure,
  withdrawNeedsSignIn,
} from "@/lib/transfer/withdrawError";
import { requestWalletConnect } from "@/lib/wallet/connectGate";
import { useDepositAssets, type DepositCandidate } from "@/hooks/useDepositAssets";
import {
  defaultDepositAssets,
  needsAddress,
  searchDepositAssets,
} from "@/lib/wallet/depositAssets";

/**
 * Send funds OUT of the Iter wallet.
 *
 * ## Why this exists at all
 *
 * The account menu could take money in and never let it out. A passkey wallet
 * whose funds cannot leave is not a wallet, and the absence reads as "they hold
 * my money" — which is the one thing this venue is built not to do.
 *
 * ## Preview is not optional, and is copied from a CEX on purpose
 *
 * Coinbase's withdraw CTA is "Preview", never "Send", and the reason applies
 * MORE here than there: they can reverse a mistake with a support ticket and we
 * cannot. There is no recall, no custody and nobody to ask. So the amount, the
 * destination and the network are restated on a second screen before a signature
 * is requested, and the irreversibility is said in words rather than implied.
 *
 * ## Two transfer paths, chosen by the ASSET
 *
 * A native send moves `value`; an ERC-20 calls `transfer` on the token. The
 * asset decides, never the chain — and that distinction is the whole reason
 * decimals are read from the chosen token rather than from `nativeCurrency`.
 * Arc is the case that punishes getting it wrong: its native view is 18
 * decimals while the USDC contract at 0x3600…0000 is 6, so a chain-derived
 * decimal on an ERC-20 amount is off by 10^12. apps/web/CLAUDE.md records that
 * trap for balances; it is the same one here, with a signature on the end.
 *
 * Switching the asset CLEARS the amount for the same reason. "0.5" is
 * denominated in whatever was selected when it was typed, and carrying it
 * across a change of decimals is how a number that looks unchanged becomes a
 * different sum.
 *
 * The asset list is the deposit list's, curated the same way and for the same
 * reason: `defaultDepositAssets` is a SAFETY filter, not a relevance one, since
 * anyone here can launch a coin whose symbol is already taken. An unverified
 * row always shows its address, because a symbol is not an identity.
 */
export function WithdrawPanel({
  open,
  onDone,
  onChainChange,
}: {
  /** Whether the withdraw surface is showing. `false` renders nothing. */
  open: boolean;
  /** Called when the flow finishes — the dialog closes, the page navigates. */
  onDone: () => void;
  /** The chain the chosen asset settled on, so the shell can guard the network. */
  onChainChange?: (chainId: number | null) => void;
}) {
  const { address, connector } = useAccount();
  const { data: chainBrands } = useChainBrand();
  const visible = useVisibleChains();

  /**
   * WHAT to send. `null` means the chain's own gas asset, which is the default
   * because it is what a wallet always holds and what it needs to move anything
   * at all. Choosing an ERC-20 also answers the chain, since an asset carries
   * one — the same rule the deposit list follows.
   */
  const [asset, setAsset] = useState<DepositCandidate | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const confirmation = useTransferConfirmation();

  /**
   * The chain comes from the ASSET, and from nothing else.
   *
   * This screen used to ask "Which chain?" first and then filter the asset list
   * to that answer — the exact shape the deposit page was corrected out of. It
   * is wrong for the same reasons: every candidate already carries its network,
   * so the question is one the next step answers by itself; and the two
   * together could disagree, which on a screen whose mistakes are unrecoverable
   * is not a cosmetic problem.
   *
   * It also produced a dead end. Filtering to a chosen chain meant a network
   * holding nothing rendered "Nothing to send on this network" with no way
   * forward except going back and guessing again, while the asset the user
   * wanted sat one chain away, unlisted.
   *
   * `offered` and `pickedChain` went with the question. The visible-chain list
   * still filters what `useDepositAssets` fetches, so an operator-hidden chain
   * contributes no rows here either.
   */
  const chainId = asset?.chainId ?? null;
  const chain = wagmiChains.find((c) => c.id === chainId);

  // Lifted so `TransferShell` can warn about a wallet standing elsewhere. It
  // was fed `request.chainId`, which the page never sets — so the network guard
  // existed on this page and could never fire.
  useEffect(() => {
    onChainChange?.(chainId);
  }, [chainId, onChainChange]);

  const balance = useBalance({
    address,
    chainId: chainId ?? undefined,
    query: { enabled: Boolean(address && chainId) },
  });

  const { sendTransactionAsync, isPending: sending } = useSendTransaction();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const isPending = sending || writing;

  const { assets, isLoading: assetsLoading } = useDepositAssets();
  const erc20 = asset && !asset.native ? (asset.token.id as `0x${string}`) : undefined;
  // Balance for an ERC-20 comes from the token itself; `useBalance` answers for
  // the native asset only in wagmi v2.
  const tokenBalance = useReadContract({
    abi: erc20Abi,
    address: erc20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: chainId ?? undefined,
    query: { enabled: Boolean(erc20 && address && chainId) },
  });

  // A fresh sheet never inherits the last withdrawal's destination or amount.
  // Both are unrecoverable if wrong, so neither is sticky.
  useEffect(() => {
    if (!open) return;
    setAsset(null);
    setAssetSearch("");
    setAmount("");
    setTo("");
    setPreviewing(false);
  }, [open]);

  // The chosen asset decides all three. Reading decimals from the CHAIN while
  // sending an ERC-20 is how an amount comes out 10^12 wrong — the trap
  // apps/web/CLAUDE.md records for Arc, whose native view is 18 decimals while
  // its USDC contract is 6.
  const decimals = asset ? asset.token.decimals : (chain?.nativeCurrency.decimals ?? 18);
  const symbol = asset ? asset.token.symbol : (chain?.nativeCurrency.symbol ?? "");
  const held = asset && !asset.native
    ? ((tokenBalance.data as bigint | undefined) ?? BigInt(0))
    : (balance.data?.value ?? BigInt(0));
  const heldLabel = formatUnits(held, decimals);

  const parsed = useMemo(() => {
    if (!amount || !Number(amount)) return null;
    try {
      return parseUnits(amount, decimals);
    } catch {
      return null;
    }
  }, [amount, decimals]);

  /**
   * The fee split, or null when this withdrawal does not take one.
   *
   * Null in three cases, and each is a real answer rather than a degraded one:
   * no fee wallet configured, a wallet that cannot batch (injected — it cannot
   * authorize a 7702 delegate), or a chain with no executor deployed. In every
   * one of them the withdrawal goes out in full as a single transfer, which is
   * exactly what it did before this existed.
   *
   * Charging the fee WITHOUT a batch would mean two transactions, and the
   * window between them is the failure this whole path exists to remove.
   */
  const split = useMemo(() => {
    if (parsed === null || parsed <= BigInt(0)) return null;
    if (!feeWalletConfigured()) return null;
    if (!canBatch(connector, chainId ?? undefined)) return null;
    if (to.trim().toLowerCase() === FEE_WALLET.toLowerCase()) return null;
    return splitWithdrawal(parsed);
  }, [parsed, connector, chainId, to]);

  const overBalance = parsed !== null && parsed > held;
  const selfSend = to.length > 0 && isSelfSend(address, to);
  const badAddress = to.length > 0 && !isPlausibleAddress(to);
  const ready =
    chain !== undefined && parsed !== null && !overBalance && !badAddress && !selfSend && to.length > 0;

  /**
   * Why the confirm step could not act, in the CARD.
   *
   * Everything this handler could say used to be a toast, and every `<Toaster>`
   * in this app is bottom-right — which is exactly where a wallet extension's
   * panel sits. A failure the user cannot see is the same screen as a button
   * that does nothing, which is what this looked like.
   */
  const [problem, setProblem] = useState<string | null>(null);
  /** The one failure with a one-click remedy, so it gets a button rather than advice. */
  const [signInFixes, setSignInFixes] = useState(false);

  const confirm = async () => {
    setProblem(null);
    setSignInFixes(false);
    // Never a silent return. These two conditions used to end the handler with
    // no state change and nothing on screen.
    const blocked = describeWithdrawBlock({
      hasChain: chain !== undefined,
      hasAmount: parsed !== null,
      hasAccount: Boolean(address),
    });
    if (blocked) {
      setProblem(blocked);
      // A missing account is the one blocked reason with a one-tap fix, so it
      // raises the same Sign in control a failed signature does. Without this
      // the sentence rendered alone and the copy had to describe where a button
      // might be — which is not dependable, since AppShell's chrome is hidden
      // below 1200px.
      if (!address) setSignInFixes(true);
      return;
    }
    if (!chain || parsed === null) return;
    try {
      const hash = split
        ? // ONE transaction carrying both legs. The fee and the withdrawal land
          // together or neither does — as two transactions there is a window
          // where the fee lands and the transfer reverts, leaving the user
          // charged and unpaid.
          await sendBatch({
            connector,
            chainId: chain.id,
            calls: buildWithdrawalBatch({
              destination: to.trim() as `0x${string}`,
              feeWallet: FEE_WALLET as `0x${string}`,
              rest: split.rest,
              fee: split.fee,
              token: erc20,
            }),
          })
        : // Unchanged. An injected wallet cannot authorize a 7702 delegate, and
          // a chain with no executor has nothing to delegate to — so the
          // withdrawal is exactly what it was, in full, with no fee. Charging
          // one here would mean two transactions and the window above.
          erc20
          ? await writeContractAsync({
              abi: erc20Abi,
              address: erc20,
              functionName: "transfer",
              args: [to.trim() as `0x${string}`, parsed],
              chainId: chain.id,
            })
          : await sendTransactionAsync({
              to: to.trim() as `0x${string}`,
              value: parsed,
              chainId: chain.id,
            });
      onDone();
      // Watched to its receipt, not reported at broadcast: identity-service
      // verifies a transfer by READING that receipt, so an unmined hash was
      // answering 404 and writing nothing.
      confirmation.watch({
        hash,
        chainId: chain.id,
        kind: "withdraw",
        account: address ?? "",
        symbol,
        amount,
        peer: to.trim(),
      });
      toast.success(`Submitted ${amount} ${symbol}`, {
        description: `${hash.slice(0, 10)}… — confirming on ${chain.name}.`,
      });
    } catch (error) {
      // A declined prompt is a decision, not a failure — the same rule the
      // connect and deposit paths follow. Anything else is SAID, in the card as
      // well as in a toast, and `describeWithdrawFailure` is what unwraps
      // mera's wrapper so the sentence is the real reason rather than
      // "Passkey operation failed".
      // The chain names its own fee asset, so a shortfall says which one.
      const said = describeWithdrawFailure(error, { gasSymbol: chain.nativeCurrency.symbol });
      if (said) {
        setProblem(said);
        setSignInFixes(withdrawNeedsSignIn(error));
        toast.error("Withdrawal failed", { description: said });
      }
    }
  };

  if (!open) return null;

  return (
    <>
      {/* The panel owns its heading so the page and the dialog cannot disagree,
          and so the title still tracks the preview step. */}
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
                  ? `Sent ${confirmation.transfer.amount} ${confirmation.transfer.symbol}`
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

      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-[color:var(--m-text-primary)]">
          {previewing ? "Confirm withdrawal" : "Withdraw"}
        </h1>
        <p className="text-sm text-[color:var(--m-text-secondary)]">
          {previewing
            ? "Check every line. This cannot be undone."
            : `Send ${symbol || "funds"} from your Iter wallet to another address.`}
        </p>
      </div>

        {!previewing && (
          <>
            {/* The amount is the hero, with Max as a chip — the shape Coinbase's
                send screen uses, and it is right: everything else on this screen
                is a confirmation of context, but this is the decision. */}
            {/* STEP 1 — WHAT to send. One question at a time: this used to sit
                above the amount and the destination with all three live at
                once, which is the shape the deposit page was just corrected
                out of. */}
            {!asset && (
              <>
            {/* WHAT to send. Default is the chain's gas asset, because that is
                what every wallet holds and what it needs to move anything; the
                search reaches the tail, and an unverified row always shows its
                address, since anyone can launch a coin whose symbol is already
                taken. Same curation and the same reasoning as the deposit
                list — `defaultDepositAssets` is a SAFETY filter, not a
                relevance one. */}
            <div className="flex flex-col gap-2">
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Search a token to send, or paste an address"
                aria-label="Search assets to withdraw"
                className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] focus:border-[color:var(--m-primary)]"
              />
              <div className="flex max-h-[168px] flex-col gap-1 overflow-y-auto">
                {(() => {
                  // CROSS-CHAIN, like the deposit list: the row carries its
                  // network and choosing it settles one.
                  const searching = assetSearch.trim().length > 0;
                  const rows = searching
                    ? searchDepositAssets(assets.map((a) => a.token), assetSearch)
                    : defaultDepositAssets(assets.map((a) => a.token));
                  const byId = new Map(assets.map((a) => [a.token.id, a]));
                  if (assetsLoading) {
                    return (
                      <p className="py-3 text-center text-[12px] text-[color:var(--m-text-secondary)]">
                        Loading assets…
                      </p>
                    );
                  }
                  if (rows.length === 0) {
                    return (
                      <p className="py-3 text-center text-[12px] text-[color:var(--m-text-secondary)]">
                        {searching ? "No token matches that." : "Nothing to send yet."}
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
                        onClick={() => {
                          setAsset(candidate);
                          // The amount is denominated in the OLD asset, so it
                          // cannot survive the switch. Carrying it over is how
                          // "0.5" of a six-decimal token becomes a different
                          // sum entirely.
                          setAmount("");
                        }}
                        // No selected state: this list only exists while
                        // nothing is chosen, and the choice replaces it with a
                        // summary row carrying a Change control.
                        className="flex items-center gap-2.5 rounded-xl border border-transparent bg-[color:var(--m-surface-2)] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--m-primary)]"
                      >
                        {/* `chainName` rather than `badge={false}`: this list
                            is cross-chain now, so the network is part of what a
                            row IS — the same reason ChainBadge rides the token
                            on every market row in the app, and the same call the
                            deposit list makes. */}
                        <TokenImageIcon
                          symbol={token.symbol}
                          color="#666666"
                          logoURI={token.logoURI ?? undefined}
                          size="md"
                          chainName={candidate.chainName}
                          className="h-6 w-6"
                        />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
                            {token.symbol}
                          </span>
                          {/* The network is named in WORDS as well as on the
                              mark. A badge is a chip, and a chip needs a label:
                              two rows reading "USDC" differ only by which chain
                              they are on, and that difference is the whole
                              decision. An unverified row spends the line on its
                              ADDRESS instead, because a symbol is not an
                              identity here — its network is still on the mark. */}
                          <span className="truncate font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
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
              </>
            )}

            {/* STEP 2 — how much, and to whom. Nothing here can be answered
                before the asset is known: the amount is denominated in it, the
                balance is read from it, and the decimals that turn one into the
                other come from it. Showing them together asked for a number in
                a unit nobody had named. */}
            {asset && (
              <>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2.5">
              <TokenImageIcon
                symbol={asset.token.symbol}
                color="#666666"
                logoURI={asset.token.logoURI ?? undefined}
                size="md"
                chainName={asset.chainName}
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-[color:var(--m-text-primary)]">
                  {asset.token.symbol} on {asset.chainName}
                </span>
                <span className="font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
                  {heldLabel} available
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAsset(null);
                  setAssetSearch("");
                  // Denominated in the asset being left behind, so it cannot
                  // survive the change — see the note at the top of this file.
                  setAmount("");
                }}
                className="ml-auto shrink-0 rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 text-[11.5px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
              >
                Change
              </button>
            </div>

            <div className="flex flex-col items-center gap-1 pt-1">
              <input
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
                aria-label={`Amount of ${symbol} to withdraw`}
                className="w-full bg-transparent text-center font-dm-mono text-[32px] font-semibold tabular-nums text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
              />
              <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                {symbol} on {chain?.name ?? asset.chainName}
              </span>
              <button
                type="button"
                onClick={() => setAmount(heldLabel)}
                className="mt-1 rounded-full border border-[color:var(--m-border)] px-3 py-0.5 font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
              >
                Max
              </button>
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--m-border)]">
              <div className="flex flex-col gap-0.5 bg-[color:var(--m-surface-2)] px-3 py-2.5">
                <span className="font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
                  From · Iter wallet
                </span>
                <span className="font-dm-mono text-[12px] tabular-nums text-[color:var(--m-text-secondary)]">
                  {balance.isLoading
                    ? "…"
                    : `${heldLabel} ${symbol} available`}
                </span>
              </div>
              <label className="flex flex-col gap-0.5 border-t border-[color:var(--m-border)] px-3 py-2.5">
                <span className="font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
                  To
                </span>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  aria-label="Destination address"
                  className="w-full bg-transparent font-dm-mono text-[12.5px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
                />
              </label>
            </div>

            {/* Pick instead of paste. It fills the field above and changes
                nothing else — the same preview, the same irreversibility
                warning — because a saved label and a familiar handle are both
                things an attacker can arrange. */}
            <RecipientPicker
              networkName={chain?.name ?? ""}
              current={to}
              onPick={setTo}
            />

            {/* Said as soon as it is knowable, not held back for the preview.
                A truncated paste is THE mistake people make — every address in
                this app is displayed as `0x38A1…7f0A`, and pasting that looks
                almost right. */}
            {badAddress && (
              <p className="text-[11.5px] text-[color:var(--m-error-fg)]">
                That is not a complete address. Paste all 42 characters — a shortened
                one like <span className="font-dm-mono">0x38A1…7f0A</span> will not work.
              </p>
            )}
            {selfSend && (
              <p className="text-[11.5px] text-[color:var(--m-warning-600)]">
                That is this wallet. The transfer would cost a fee and change nothing.
              </p>
            )}
            {overBalance && (
              <p className="text-[11.5px] text-[color:var(--m-error-fg)]">
                More than the {heldLabel} {symbol} this wallet holds.
              </p>
            )}

            <button
              type="button"
              disabled={!ready}
              onClick={() => setPreviewing(true)}
              className="w-full rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preview
            </button>
              </>
            )}
          </>
        )}

        {chain && previewing && (
          <>
            <div className="flex flex-col items-center gap-0.5 pt-1">
              <span className="font-dm-mono text-[30px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
                {amount}
              </span>
              <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                {symbol} · {chain.name}
              </span>
            {/*
              The fee is disclosed HERE, on the review step, beside the figure
              it comes out of — not in a tooltip and not only in the terms. A
              charge a person meets for the first time in their transaction
              history is not disclosed, whatever a document says.

              It renders only when one is actually taken, so a MetaMask user or
              a chain with no executor never sees a row about a fee they are not
              paying. `feeWaived` is the third case and says so in words: below
              10,000 base units the 0.01% truncates to nothing, and "0" beside a
              fee label reads as a bug rather than as the answer.
            */}
            {split && (
              <div className="mt-2 flex w-full flex-col gap-1 rounded-xl bg-[color:var(--m-surface-2)] px-3 py-2">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-[color:var(--m-text-secondary)]">
                    {to.trim().slice(0, 6)}…{to.trim().slice(-4)} receives
                  </span>
                  <span className="font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                    {formatUnits(split.rest, decimals)} {symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-[color:var(--m-text-secondary)]">Network fee (0.01%)</span>
                  <span className="font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                    {split.feeWaived
                      ? "waived"
                      : `${formatUnits(split.fee, decimals)} ${symbol}`}
                  </span>
                </div>
                <p className="pt-0.5 text-[10.5px] leading-snug text-[color:var(--m-text-secondary)]">
                  Both transfers are sent as one transaction, so they succeed or
                  fail together.
                </p>
              </div>
            )}
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--m-border)]">
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
                  To
                </span>
                {/* The FULL address, never truncated. This is the last screen
                    before it is irreversible, and an ellipsis here hides exactly
                    the characters a wrong paste would have got wrong. */}
                <span className="break-all font-dm-mono text-[12px] text-[color:var(--m-text-primary)]">
                  {to.trim()}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[color:var(--m-border)] px-3 py-2.5">
                <span className="font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--m-text-secondary-2)]">
                  Network
                </span>
                <span className="text-[12px] text-[color:var(--m-text-primary)]">{chain.name}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[color:var(--m-warning-600)]/35 bg-[color:var(--m-warning-600)]/10 px-3 py-2.5">
              <p className="text-[11.5px] leading-4 text-[color:var(--m-warning-600)]">
                This cannot be undone. Iter does not hold your funds and cannot reverse or
                recover a transfer sent to the wrong address or the wrong network.
              </p>
            </div>

            {/* In the card, beside the button that raised it. */}
            {problem && (
              <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--m-error)]/40 bg-[color:var(--m-error)]/10 px-3 py-2.5">
                <p className="text-[11.5px] leading-4 text-[color:var(--m-error-fg)]">{problem}</p>
                {/* The session ending is not a mistake the user made, and the
                    fix is one tap — so it is offered here rather than described.
                    `requestWalletConnect` is the same plain function every other
                    gated control uses; the dialog itself is mounted once in
                    AppShell. */}
                {signInFixes && (
                  <button
                    type="button"
                    onClick={() => requestWalletConnect("Confirm this withdrawal")}
                    className="self-start rounded-lg border border-[color:var(--m-border)] px-2.5 py-1 text-[11.5px] font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
                  >
                    Sign in again
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setProblem(null);
                  setPreviewing(false);
                }}
                className={cn(
                  "flex-1 rounded-xl border border-[color:var(--m-border)] px-4 py-2.5",
                  "text-[13px] font-medium text-[color:var(--m-text-secondary)]",
                  "transition-colors hover:text-[color:var(--m-text-primary)]",
                )}
              >
                Back
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void confirm()}
                className="flex-[2] rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Confirm with your passkey…" : "Confirm with passkey"}
              </button>
            </div>
          </>
        )}
    </>
  );
}
