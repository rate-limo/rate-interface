"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, erc20Abi, isAddress, parseUnits, type Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { WalletConfirmFrame } from "@/components/Wallet/WalletConfirmFrame";
import type { WalletRpc } from "@/lib/wallet/frame/protocol";
import { isWalletDecision } from "@/lib/wallet/walletFailure";
import { findChain } from "@iter/deployments";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import defaultTokenList from "@iter/token-list";
import { Copy, Download, Send as SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/portfolio/mock";

export type WalletTransferMode = "send" | "receive";

export function WalletTransferModal({
  mode,
  address,
  open,
  onOpenChange,
}: {
  mode: WalletTransferMode;
  address: `0x${string}`;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const { displayNetworkName, tokenListWithBalance } = useMarketPageContext();
  const tokens = tokenListWithBalance ?? [];
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const isReceive = mode === "receive";

  useEffect(() => {
    if (!selectedTokenId && tokens[0]?.id) setSelectedTokenId(tokens[0].id);
  }, [selectedTokenId, tokens]);

  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? tokens[0];

  /**
   * Native iff the token IS the chain's `iter_native` entry — the same rule
   * `useTokenlistBalances` applies, deliberately, rather than
   * `symbol === "ETH"`.
   *
   * On Arc there is NO iter_native entry: the gas asset is the USDC ERC-20 at
   * 0x3600…, one pool of funds behind two interfaces, so every row there is an
   * ERC-20 and must be sent with `transfer` at 6 decimals. A symbol-based guess
   * would send the 18-decimal native view instead — off by 10^12 on a real
   * transfer, which is a different class of mistake from the display bug that
   * rule usually causes.
   */
  const nativeToken = defaultTokenList.groupTokens[
    displayNetworkName as keyof typeof defaultTokenList.groupTokens
  ]?.["iter_native"]?.[0];
  const isNative = Boolean(nativeToken?.address && selectedToken?.id === nativeToken.address);

  const { address: sender, chainId: connectedChainId } = useAccount();
  const queryClient = useQueryClient();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  // The chain this modal sends on: the one the market page displays, resolved
  // through the registry the rest of the app uses; the connector's current
  // chain when that name is unknown to it.
  const chainId = findChain(displayNetworkName)?.chainId ?? connectedChainId;

  const { data: receipt, isError: receiptFailed } = useWaitForTransactionReceipt({ hash });

  const recipientValid = isAddress(recipient.trim());
  const parsedAmount = useMemo(() => {
    if (!selectedToken || !amount.trim()) return null;
    try {
      const units = parseUnits(amount.trim(), selectedToken.decimals);
      return units > BigInt(0) ? units : null;
    } catch {
      // A half-typed "0." is not an error to report — it is simply not yet an
      // amount, and the button stays disabled.
      return null;
    }
  }, [amount, selectedToken]);

  /**
   * Success is declared at the RECEIPT, never at broadcast, and a reverted
   * transaction has a receipt too — only `receipt.status` separates the two.
   * The same rule `PlaceOrderButton` documents, for the same reason: reporting a
   * send that reverted as a success leaves the user believing funds moved.
   */
  useEffect(() => {
    if (!hash) return;
    if (receiptFailed) {
      toast.dismiss(`transfer-${hash}`);
      toast.error("The transfer could not be confirmed", {
        description: "It was submitted but the receipt never arrived. Check the explorer before resending.",
      });
      setHash(undefined);
      return;
    }
    if (!receipt) return;

    toast.dismiss(`transfer-${hash}`);
    if (receipt.status === "success") {
      toast.success("Transfer confirmed");
      // Refetch rather than assert a computed balance. The portfolio's read is
      // a multicall over every chain, so the honest move after a confirmed
      // transfer is to ask again — `readContracts` is wagmi's own key for it,
      // and the token lists carry the balances the picker above renders.
      void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
      void queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("tokenlistBalances"),
      });
      onOpenChange(false);
      setRecipient("");
      setAmount("");
    } else {
      toast.error("The transfer reverted", {
        description: "Nothing was sent. The network fee was still spent.",
      });
    }
    setHash(undefined);
  }, [receipt, receiptFailed, hash, queryClient, onOpenChange]);

  /**
   * The request the wallet's confirm control signs. A transfer moves value out,
   * so the wallet frame refuses it on the silent path and signs it only from a
   * click inside its own button — `WalletConfirmFrame`, drawn below in place of
   * the one that used to call `sendTransactionAsync` here. One in flight at a
   * time is enforced by the `hash` gate: the control is inert while a receipt
   * is awaited, which is the same trap PlaceOrderButton guards.
   */
  const rpc = useMemo<WalletRpc | null>(() => {
    if (!selectedToken || !recipientValid || !parsedAmount || !sender || hash) return null;
    const to = recipient.trim() as `0x${string}`;
    return isNative
      ? { method: "eth_sendTransaction", params: [{ to, value: `0x${parsedAmount.toString(16)}` as Hex }] }
      : {
          method: "eth_sendTransaction",
          params: [
            {
              to: selectedToken.id as `0x${string}`,
              value: "0x0",
              data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, parsedAmount] }),
            },
          ],
        };
  }, [selectedToken, recipientValid, parsedAmount, sender, hash, recipient, isNative]);

  const onSubmitted = (sent: Hex) => {
    setHash(sent);
    toast.loading("Confirming transfer…", { id: `transfer-${sent}` });
  };

  const onFailed = (error: unknown) => {
    // A rejected signature is a decision, not a failure — the same
    // distinction `lib/wallet` draws, and a toast for "no thanks" is noise.
    if (isWalletDecision(error)) return;
    const message = error instanceof Error ? error.message : String(error);
    toast.error("Could not send", { description: message.slice(0, 200) });
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(address)}`;

  async function copyAddress() {
    try {
      await navigator.clipboard?.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The address is rendered as selectable text if clipboard permissions fail.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))] rounded-3xl border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-0 text-[color:var(--m-text-primary)] shadow-2xl">
        <DialogHeader className="border-b border-[color:var(--m-border)] px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-3 text-xl tracking-[-0.03em]">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[color:var(--m-surface-2)] text-[color:var(--m-primary)]">
              {isReceive ? <Download className="h-5 w-5" /> : <SendIcon className="h-5 w-5" />}
            </span>
            {isReceive ? "Receive assets" : "Send assets"}
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm text-[color:var(--m-text-secondary)]">
            {isReceive ? "Receive tokens to your connected Rate wallet." : "Send tokens from your connected Rate wallet."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {isReceive ? (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--m-text-secondary)]">Your wallet address</p>
              <div className="flex justify-center rounded-2xl border border-[color:var(--m-border)] bg-white p-4">
                <img
                  src={qrCodeUrl}
                  alt="QR code for wallet address"
                  width={208}
                  height={208}
                  className="h-52 w-52 rounded-xl"
                />
              </div>
              <p className="text-center text-xs text-[color:var(--m-text-secondary-2)]">Scan to send assets to this wallet</p>
              <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3">
                <code className="min-w-0 flex-1 break-all font-dm-mono text-xs leading-5">{address}</code>
                <button type="button" onClick={() => void copyAddress()} aria-label="Copy wallet address" className="shrink-0 rounded-xl p-2 text-[color:var(--m-text-secondary)] transition-colors hover:bg-[color:var(--m-surface)] hover:text-[color:var(--m-text-primary)]">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-[color:var(--m-text-secondary-2)]">{copied ? "Address copied" : "Only send assets on a supported network."}</p>
            </div>
          ) : (
            <>
              <label className="block text-sm text-[color:var(--m-text-secondary)]">
                Token
                <div className="relative mt-2 flex h-14 items-center gap-3 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 focus-within:border-[color:var(--m-primary)]">
                  {selectedToken && <TokenImageIcon symbol={selectedToken.symbol} logoURI={selectedToken.logoURI} color={tokenColor(selectedToken.symbol)} size="md" chainName={displayNetworkName} />}
                  <select value={selectedTokenId} onChange={(event) => setSelectedTokenId(event.target.value)} aria-label="Token to send" className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-5 font-dm-mono text-sm outline-none">
                    {tokens.length === 0 ? <option value="">No tokens available</option> : tokens.map((token) => <option key={token.id} value={token.id}>{token.symbol} · balance {token.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}</option>)}
                  </select>
                  <span aria-hidden className="pointer-events-none absolute right-4 text-[color:var(--m-text-secondary)]">⌄</span>
                </div>
              </label>
              <label className="block text-sm text-[color:var(--m-text-secondary)]">
                Recipient address
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" className="mt-2 h-12 w-full rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 font-dm-mono text-sm outline-none transition-colors focus:border-[color:var(--m-primary)]" />
              </label>
              <label className="block text-sm text-[color:var(--m-text-secondary)]">
                Amount
                <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" className="mt-2 h-12 w-full rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 font-dm-mono text-sm outline-none transition-colors focus:border-[color:var(--m-primary)]" />
              </label>
            </>
          )}
        </div>

        <div className="border-t border-[color:var(--m-border)] px-6 py-5">
          {isReceive ? (
            <Button type="button" onClick={() => void copyAddress()} className="h-12 w-full rounded-2xl bg-[color:var(--m-text-primary)] text-[color:var(--m-surface)] hover:bg-[color:var(--m-text-primary)] hover:opacity-90">{copied ? "Address copied" : "Copy address"}</Button>
          ) : (
            // Disabled for a REASON the label names, rather than a dead
            // button: an inert control with no explanation is what this was
            // before it did anything at all. The control itself is drawn by the
            // wallet origin — see components/Wallet/WalletConfirmFrame.
            <WalletConfirmFrame
              chainId={chainId ?? 0}
              rpc={chainId ? rpc : null}
              variant="modal"
              label={
                !sender
                  ? "Connect a wallet"
                  : hash
                    ? "Confirming…"
                    : recipient.trim() && !recipientValid
                      ? "That is not a valid address"
                      : `Send ${selectedToken?.symbol ?? ""}`.trim()
              }
              onSubmitted={onSubmitted}
              onFailed={onFailed}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
