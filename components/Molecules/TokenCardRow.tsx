import { TokenImageIcon } from '@/components/Atoms/TokenImageIcon';
import { TokenName } from '@/components/Atoms/TokenName';
import { TokenPrice } from '@/components/Atoms/TokenPrice';
import { TokenPercentageChange } from '@/components/Atoms/TokenPercentageChange';
import Link from 'next/link';

type TokenCardRowProps = {
  networkSlug: string;
  name: string;
  symbol: string;
  logoURI: string;
  iconColor: string;
  price: number;
  percentageChange: number;
  loading?: boolean;
};

export function TokenCardRow({
  networkSlug,
  name,
  symbol,
  logoURI,
  iconColor,
  price,
  percentageChange,
  loading = false,
}: TokenCardRowProps) {
  if (loading) {
    return (
      <div className="flex w-full items-center p-2 hover:bg-neutral-dark-500">
        <div className="flex w-1/3 items-center justify-start gap-2">
          <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-dark-500" />
          <div className="h-4 w-20 animate-pulse rounded bg-neutral-dark-500" />
        </div>
        <div className="flex w-1/3 justify-end">
          <div className="h-4 w-16 animate-pulse rounded bg-neutral-dark-500" />
        </div>
        <div className="flex w-1/3 justify-end">
          <div className="h-4 w-12 animate-pulse rounded bg-neutral-dark-500" />
        </div>
      </div>
    );
  }

  return (
    <Link href={`/token/${symbol}?chain=${networkSlug}`} className="flex w-full items-center p-2 hover:bg-neutral-dark-500">
      <div className="flex w-1/3 items-center justify-start gap-2">
        <TokenImageIcon symbol={symbol} color={iconColor} logoURI={logoURI} />
        <TokenName name={name} />
      </div>
      <div className="flex w-1/3 justify-end">
        <TokenPrice price={price} fontWeight="light"/>
      </div>
      <div className="flex w-1/3 justify-end">
        <TokenPercentageChange change={percentageChange} />
      </div>
    </Link>
  );
}
