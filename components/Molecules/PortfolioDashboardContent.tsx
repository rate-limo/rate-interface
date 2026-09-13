import Image from 'next/image';
import { Label } from '../Atoms/Label';
import { TokenPercentageChange } from '../Atoms/TokenPercentageChange';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { adjustDecimalLength } from '@/utils/number';

interface PortfolioDashboardContentProps {
  value: number;
  change: number;
}

export default function PortfolioDashboardContent({
  value,
  change,
}: PortfolioDashboardContentProps) {

  const {
    connectedNetworkName,
    tokenListWithBalance,
    tokenListWithBalanceStatus,
    tokenListWithBalanceError,
    tokenListWithBalanceHoldings,
    traderData,
  } = useMarketPageContext();

  // The snapshot admin-service holds for this wallet. `balanceUsd` is null when
  // nothing has ever been recorded — distinct from a recorded zero, and the
  // reason the value below falls back to a dash rather than to $0.00.
  const balanceUsd = traderData?.balanceUsd;

  // Derived from two day buckets on read, not stored. It is the change since
  // the wallet's PREVIOUS RECORDED day, which is only "24 hours" when the app
  // was opened yesterday too — hence the wording below.
  const pnlPercentage = traderData?.pnl?.percentage;

  return (
    <div className="flex items-center gap-3">
      <div className="text-neutral-light-default bg-neutral-dark-400 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full">
        <Image
          src="/wallet.svg"
          alt="Wallet"
          width={32}
          height={32}
          className="p-0 leading-none"
        />
      </div>
      <div className="flex flex-col items-start gap-1">
        <Label className="text-neutral-dark-100 text-xs font-medium">
          Portfolio Value
        </Label>
        <Label className="text-neutral-light-default text-[2rem] leading-tight font-semibold">
          {balanceUsd === null || balanceUsd === undefined
            ? "--"
            : `$${adjustDecimalLength(balanceUsd, 8)} USD`}
        </Label>
        {/* Only claim a change when there is a prior snapshot to measure from.
            The old copy rendered "0.00% in last 24 hours" for a wallet with no
            history at all, which reads as a flat day rather than as no data. */}
        {pnlPercentage === undefined ? (
          <Label className="text-neutral-dark-100 text-xs">No previous snapshot yet</Label>
        ) : (
          <Label className="text-neutral-dark-100 text-xs">
            <TokenPercentageChange change={pnlPercentage} /> since your last visit
          </Label>
        )}
      </div>
    </div>
  );
}
