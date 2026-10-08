"use client";

import { useCallback, useEffect, useState } from "react";
import { WithdrawPanel } from "./WithdrawPanel";
import { TransferShell } from "./TransferShell";
import { TransferHistory } from "./TransferHistory";
import { closeWithdraw, openWithdraw, useWithdraw } from "@/lib/wallet/withdraw";

/** `/withdraw`. Same shape as the deposit page — see the note there. */
export function WithdrawView() {
  const open = useWithdraw();
  // The panel settles the chain by settling the ASSET, and the shell's network
  // guard has no other way to learn it. It used to read `request.chainId`,
  // which nothing set — so the guard was on this page and inert.
  const [chainId, setChainId] = useState<number | null>(null);
  const onChainChange = useCallback((next: number | null) => setChainId(next), []);
  /* Lifted for the same reason the chain is: the panel chooses the asset, and
     the transfer list below has no other way to know which one is on screen. */
  const [symbol, setSymbol] = useState<string | undefined>(undefined);
  const onAssetChange = useCallback((next: string | undefined) => setSymbol(next), []);

  useEffect(() => {
    openWithdraw();
    return () => closeWithdraw();
  }, []);

  return (
    <TransferShell
      chainId={chainId ?? undefined}
      below={<TransferHistory symbol={symbol} />}
    >
      <WithdrawPanel
        open={open}
        onDone={() => undefined}
        onChainChange={onChainChange}
        onAssetChange={onAssetChange}
      />
    </TransferShell>
  );
}
