"use client";

import { WalletButton } from "@/components/Shell/WalletButton";

/**
 * The Rate dashboard's desktop wallet button, passed to AppShell as
 * `walletContent`.
 *
 * Now a thin wrapper over Shell/WalletButton. It used to hand-roll the
 * disconnected state only, which was fine when AppKit's `<appkit-button>` was
 * the default elsewhere — but with that element gone, two implementations of
 * the same control would drift, and this one would silently never show a
 * connected address.
 */
export function IterDesktopWalletButton() {
  return <WalletButton />;
}
