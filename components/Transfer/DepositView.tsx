"use client";

import { useCallback, useEffect, useState } from "react";
import { DepositPanel } from "./DepositPanel";
import { TransferShell } from "./TransferShell";
import { TransferHistory } from "./TransferHistory";
import { ClaimDeposit } from "./ClaimDeposit";
import { closeGasDeposit, openGasDeposit, useGasDeposit } from "@/lib/wallet/gasDeposit";

/**
 * `/deposit`.
 *
 * The page drives the same store the dialog does, so `DepositPanel` needs no
 * page-specific branch and the two can never render different things. Opening
 * it on mount is what turns "the dialog is closed" into "the page is showing".
 */
export function DepositView({ initialAsset }: { initialAsset?: string }) {
  const open = useGasDeposit();
  // Lifted so the QR can sit beside the claim form: the panel chooses the
  // network by choosing an asset, and the other column has no other way to know.
  const [chainId, setChainId] = useState<number | null>(null);
  const onChainChange = useCallback((next: number | null) => setChainId(next), []);
  /* Lifted for the same reason the chain is: the panel chooses the asset, and
     the transfer list below has no other way to know which one is on screen. */
  const [symbol, setSymbol] = useState<string | undefined>(undefined);
  const onAssetChange = useCallback((next: string | undefined) => setSymbol(next), []);

  useEffect(() => {
    openGasDeposit();
    // Leaving the page closes it, so returning does not resume a half-finished
    // deposit against an asset the user has since navigated away from.
    return () => closeGasDeposit();
  }, []);

  return (
    <TransferShell
      chainId={chainId ?? undefined}
      below={<TransferHistory symbol={symbol} />}
    >
      <DepositPanel
        initialAsset={initialAsset}
        open={open}
        onDone={() => undefined}
        onChainChange={onChainChange}
        onAssetChange={onAssetChange}
      />
      {/* Under the address, because it is the answer to the question the
          address raises: you sent to it from somewhere else, and nothing here
          saw that happen. */}
      {chainId !== null && <ClaimDeposit />}
    </TransferShell>
  );
}
