"use client";

import { ChevronDown, WalletCards } from "lucide-react";
import { useWalletAccount } from "@/lib/wallet";
import { requestWalletConnect } from "@/lib/wallet/connectGate";
import { WalletMenu } from "./WalletMenu";
import { useWalletName } from "@/hooks/useWalletName";

/**
 * The app's wallet button.
 *
 * Replaces AppKit's `<appkit-button balance="show" />`, a prebuilt web
 * component that rendered both states itself. Privy ships no equivalent
 * element, so the two states are explicit here — which is also why the whole
 * thing is one component rather than repeated at each mount point.
 *
 * Shows the wallet's NAME once connected, falling back to a truncated address
 * when nobody has claimed one. The address is not lost — the menu this opens
 * renders it in full, which is the only place it is actually useful (copying,
 * or checking it against a wallet). Repeating 42 hex characters in the chrome
 * identified the account without recognising it, on a venue that already knew
 * what to call it.
 *
 * Not a balance: AppKit's `balance` attribute displayed the NATIVE balance, and
 * on this app's chains that is a testnet token whose number means nothing next
 * to the quote-denominated figures the rest of the UI shows. Portfolio is where
 * balances live.
 */
export function WalletButton({ className }: { className?: string }) {
  const { address, isConnected, isLoading } = useWalletAccount();
  // Same hook the menu uses, so the trigger and the panel it opens can never
  // disagree about what this wallet is called.
  const name = useWalletName(address);

  const base =
    "inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-5 text-sm font-semibold text-[color:var(--m-text-primary)] shadow-[inset_0_-2px_var(--m-text-primary-12)] transition-colors hover:border-[color:var(--m-primary-300)] hover:bg-[color:var(--m-primary-100)] hover:text-[color:var(--m-primary-700)]";

  // Render the connected shape while wagmi restores the session, so an
  // already-connected user does not see "Connect Wallet" flash on every page
  // load. (Named Privy here until 2026-08-07; AppKit is the wallet layer again,
  // and the seam is why that swap did not reach this file.)
  if (isLoading) {
    return (
      <span
        aria-hidden
        className={`${base} pointer-events-none opacity-50 ${className ?? ""}`}
      >
        <WalletCards className="h-4 w-4" />
        <span className="font-dm-mono">····</span>
      </span>
    );
  }

  if (isConnected && address) {
    return (
      <WalletMenu address={address}>
        <button
          type="button"
          data-testid="wallet-account"
          title={address}
          aria-label="Wallet menu"
          className={`${base} ${className ?? ""}`}
        >
          <WalletCards className="h-4 w-4" />
          {/* Mono only for the address — a name is prose and reads badly in a
              tabular face. `max-w` so a long display name truncates instead of
              stretching the header. */}
          <span className={name ? "max-w-[13ch] truncate" : "font-dm-mono"}>
            {name ?? `${address.slice(0, 6)}…${address.slice(-4)}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </WalletMenu>
    );
  }

  // The chooser lives in `Wallet/ConnectWalletDialog`, mounted once by AppShell.
  // It was local state here, which is what made it unreachable from every other
  // control that needs a wallet — see `lib/wallet/connectGate`.
  return (
    <button
      type="button"
      data-testid="wallet-connect"
      aria-haspopup="dialog"
      onClick={() => requestWalletConnect()}
      className={`${base} ${className ?? ""}`}
    >
      <WalletCards className="h-4 w-4" />
      Connect Wallet
    </button>
  );
}
