"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { wagmiConfig } from "@/lib/providers";
import { setFeeToken, useFeeTokenChoice } from "@/lib/wallet/feeToken";

/**
 * Which stablecoin pays this account's network fees -- Tempo only.
 *
 * Tempo has no gas coin: gas is charged in a USD TIP-20, PathUSD unless the account
 * picks another (FeeManager `setUserToken`). The protocol does not fall back to a
 * second token when the first is empty -- the transaction is rejected -- so a wallet
 * holding only AlphaUSD cannot do anything until the choice moves. This makes the
 * choice visible and one tap to change. Renders nothing on a chain with a gas coin.
 *
 * Plain buttons, not menu items: a menu item closes the menu on select, and the
 * point is to see the check move once the switch confirms.
 */
export function FeeTokenPicker({ address }: { address: `0x${string}` }) {
  const { chainId } = useAccount();
  const choice = useFeeTokenChoice(chainId, address);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  if (!choice || chainId === undefined) return null;

  const pick = async (token: `0x${string}`, symbol: string) => {
    setPending(token);
    try {
      await setFeeToken(wagmiConfig, chainId, token);
      await queryClient.invalidateQueries();
      toast.success(`Network fees now paid in ${symbol}`);
    } catch (error) {
      toast.error("Could not change the gas token", {
        description: error instanceof Error ? error.message.split("\n")[0] : undefined,
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="px-2 py-1.5" data-testid="fee-token-picker">
      <p id="fee-token-picker-label" className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]">
        Network fees paid in
      </p>
      <ul aria-labelledby="fee-token-picker-label" className="flex flex-col gap-0.5">
        {choice.options.map(({ token, balance }) => {
          const current = token.address.toLowerCase() === choice.current.address.toLowerCase();
          const busy = pending?.toLowerCase() === token.address.toLowerCase();
          const empty = balance === BigInt(0);
          return (
            <li key={token.address}>
              <button
                type="button"
                data-testid={`fee-token-${token.symbol}`}
                aria-pressed={current}
                aria-busy={busy || undefined}
                disabled={current || pending !== null || empty}
                title={empty ? `No ${token.symbol} to pay fees with` : undefined}
                onClick={() => void pick(token.address, token.symbol)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] text-[color:var(--m-text-primary)] transition-colors hover:bg-[color:var(--m-surface-2)] disabled:cursor-default disabled:hover:bg-transparent aria-[pressed=false]:disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  {busy ? (
                    <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                  ) : current ? (
                    <Check aria-hidden className="h-3.5 w-3.5 text-[color:var(--m-success)]" />
                  ) : (
                    <span aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {token.symbol}
                  {/* `title` is hover-only; the reason a row is disabled has to reach keyboard and screen-reader users too. */}
                  {empty && !current && <span className="sr-only">, none to pay fees with</span>}
                  {busy && <span className="sr-only">, switching</span>}
                </span>
                <span className="font-dm-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary-2)]">
                  {balance === undefined ? "—" : Number(formatUnits(balance, token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!choice.chosen && (
        <p className="mt-1 text-[11px] leading-snug text-[color:var(--m-text-secondary-2)]">
          Network default. A stablecoin transfer pays its fee in the coin it sends.
        </p>
      )}
    </div>
  );
}
