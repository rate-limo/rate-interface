import { TokenImageIcon } from '@/components/Atoms/TokenImageIcon';
import { TokenName } from '@/components/Atoms/TokenName';
import { TokenPrice } from '@/components/Atoms/TokenPrice';
import { TokenPercentageChange } from '@/components/Atoms/TokenPercentageChange';
import { StarButton } from '@/components/Organisms/StarButton';
import { TokenMiniChart } from '@/components/Atoms/TokenMiniChart';
import { cn } from '@/lib/utils';
import { type ColumnVisibility } from '@/components/Organisms/TokenTable';
import Link from 'next/link';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';

type TokenTableRowProps = {
  id: string;
  name: string;
  symbol: string;
  logoURI: string;
  iconColor: string;
  price: number;
  marketCap: string;
  volume: string;
  percentageChange: number;
  chartData: number[];
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  columns?: ColumnVisibility;
  className?: string;
  variant?: 'default' | 'trading';
  onClick?: (id: string) => void;
};

export function TokenTableRow({
  id,
  name,
  symbol,
  logoURI,
  iconColor,
  price,
  marketCap,
  volume,
  percentageChange,
  chartData,
  isFavorite,
  onToggleFavorite,
  columns = {
    name: true,
    price: true,
    marketCap: true,
    volume: true,
    change: true,
    chart: true,
  },
  className,
  variant = 'default',
}: TokenTableRowProps) {
  const isPositive = percentageChange >= 0;

  // Count visible columns to determine grid template
  const visibleColumnCount = Object.values(columns).filter(Boolean).length;

  const {displayNetworkSlug} = useMarketPageContext();

  // Dynamically create grid template based on visible columns
  const gridTemplateStyle = {
    gridTemplateColumns: `repeat(${visibleColumnCount}, minmax(0, 1fr))`,
  };

  // Base container class based on variant
  const containerClass =
    variant === 'trading'
      ? 'grid w-full items-center px-4 py-7'
      : 'border-neutral-light-white-12 grid w-full p-4';

  return (
    <Link className={cn(containerClass, className)} style={gridTemplateStyle} href={`/token/${symbol}?chain=${displayNetworkSlug}`}>
      {columns.name && (
        <div
          className={cn(
            'flex min-w-0 items-center gap-4',
            variant === 'trading' ? 'flex-1' : 'flex-1',
          )}
        >
          <StarButton
            id={id}
            isFavorite={isFavorite}
            className="cursor-grab"
            symbol={symbol}
            option="token"
          />
          <TokenImageIcon symbol={symbol} color={iconColor} logoURI={logoURI} size="lg" />
          <div className="flex min-w-0 flex-col overflow-hidden">
            <TokenName
              name={name}
              className={
                variant === 'trading' ? 'text-neutral-dark-100 text-base' : ''
              }
            />
            <span
              className={cn(
                'truncate text-xs font-medium',
                variant === 'trading'
                  ? 'text-neutral-dark-100'
                  : 'text-dark-grey-1',
              )}
            >
              {symbol}
            </span>
          </div>
        </div>
      )}

      {columns.price && (
        <div
          className={cn(
            'flex items-center justify-end',
            variant === 'trading' ? 'flex-1' : 'flex-1',
          )}
        >
          <TokenPrice
            price={price}
            decimals={2}
            className={
              variant === 'trading' ? 'text-neutral-dark-100 text-base' : ''
            }
          />
        </div>
      )}

      {columns.marketCap && (
        <div
          className={cn(
            'flex items-center justify-end',
            variant === 'trading'
              ? 'text-neutral-dark-100 flex-1 text-base'
              : 'flex-1 text-sm text-white',
          )}
        >
          {marketCap}
        </div>
      )}

      {columns.volume && (
        <div
          className={cn(
            'flex items-center justify-end',
            variant === 'trading'
              ? 'text-neutral-dark-100 flex-1 text-base'
              : 'flex-1 text-sm text-white',
          )}
        >
          {volume}
        </div>
      )}

      {columns.change && (
        <div
          className={cn(
            'flex items-center justify-end',
            variant === 'trading' ? 'flex-1' : 'flex-1',
          )}
        >
          <TokenPercentageChange
            change={percentageChange}
            className={variant === 'trading' ? 'text-base' : ''}
          />
        </div>
      )}

      {columns.chart && (
        <div
          className={cn(
            'flex items-center justify-end',
            variant === 'trading' ? 'flex-1' : 'flex-1',
          )}
        >
          <TokenMiniChart data={chartData} isPositive={isPositive} width={100} height={30} />
        </div>
      )}
    </Link>
  );
}
