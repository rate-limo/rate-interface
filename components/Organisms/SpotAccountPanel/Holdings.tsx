"use client";

import { useMemo } from "react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { formatUsd } from "@/utils/number";
import { tokenColor } from "@/lib/swap/tokens";
import { formatAmount, sortHoldingsFirst } from "@/components/Organisms/Tables/orderRows";

/**
 * The wallet's balances on this chain, what it HOLDS first.
 *
 * The full token list is long and mostly zero for any one wallet, so in list
 * order the two tokens someone actually holds sat somewhere down a column of
 * zeros. Non-zero rows lead (by value), then everything else as listed.
 */
export function Holdings() {
  const { tokenListWithBalance, tokenListWithBalanceStatus, displayNetworkName } = useMarketPageContext();
  const tokens = useMemo(() => sortHoldingsFirst(tokenListWithBalance ?? []), [tokenListWithBalance]);
  const held = tokens.filter((t) => Number(t.balance) > 0).length;

  if (tokens.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-[color:var(--m-text-secondary)]">
        {tokenListWithBalanceStatus === "pending" ? "Loading balances…" : "No balances on this network"}
      </div>
    );
  }

  return (
    <div className="flex flex-col text-[12px]" data-testid="holdings">
      <div className="flex h-9 items-center justify-between border-b border-[color:var(--m-border)] px-4 text-[color:var(--m-text-secondary)]">
        <span>{held > 0 ? `${held} held` : "Nothing held on this network yet"}</span>
        <span>Value</span>
      </div>
      <ul>
        {tokens.map((t) => {
          const zero = !(Number(t.balance) > 0);
          return (
            <li
              key={t.id}
              className={`flex min-h-[48px] items-center justify-between gap-3 border-b border-[color:var(--m-border)] px-4 last:border-0 ${zero ? "opacity-55" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <TokenImageIcon
                  symbol={t.symbol}
                  logoURI={t.logoURI}
                  color={tokenColor(t.symbol)}
                  chainName={displayNetworkName}
                  badge={false}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium text-[color:var(--m-text-primary)]">{t.symbol}</div>
                  <div className="truncate font-mono tabular-nums text-[color:var(--m-text-secondary)]">
                    {formatAmount(t.balance)}
                  </div>
                </div>
              </div>
              <div className="shrink-0 font-mono tabular-nums text-[color:var(--m-text-primary)]">
                {zero ? "—" : formatUsd(t.valueUSD)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
