import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Atoms/Icon';
import { type ColumnVisibility } from '@/components/Organisms/TokenTable';

export type SortDirection = 'asc' | 'desc' | null;
export type SortField =
  | 'name'
  | 'price'
  | 'marketCap'
  | 'volume'
  | 'change'
  | null;

type TokenTableHeaderProps = {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  columns?: ColumnVisibility;
  className?: string;
  variant?: 'default' | 'trading';
};

export function TokenTableHeader({
  sortField,
  sortDirection,
  onSort,
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
}: TokenTableHeaderProps) {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;

    if (variant === 'trading') {
      return <Icon icon={ChevronsUpDown} size={16} />;
    }

    return sortDirection === 'asc' ? (
      <Icon icon={ArrowUp} size={16} className="mr-1" />
    ) : (
      <Icon icon={ArrowDown} size={16} className="mr-1" />
    );
  };

  // Count visible columns to determine grid template
  const visibleColumnCount = Object.values(columns).filter(Boolean).length;

  // Dynamically create grid template based on visible columns
  const gridTemplateStyle = {
    gridTemplateColumns: `repeat(${visibleColumnCount}, minmax(0, 1fr))`,
  };

  // Different base container classes based on variant
  const containerClasses =
    variant === 'trading'
      ? 'bg-neutral-dark-600 border-neutral-light-white-12 rounded-[8px] border px-4 py-2 text-xs'
      : 'border-neutral-light-white-12 relative border-b px-4 py-2';

  // Different header classes based on variant
  const headerBaseClass =
    variant === 'trading'
      ? 'text-neutral-dark-100 text-base cursor-pointer flex items-center text-xs'
      : 'text-dark-grey-1 text-sm cursor-pointer flex items-center px-2 py-3 text-xs';

  return (
    <div
      className={cn('grid w-full', containerClasses, className)}
      style={gridTemplateStyle}
    >
      {columns.name && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'flex-1 gap-2' : 'flex-1',
          )}
          onClick={() => onSort('name')}
        >
          {renderSortIcon('name')}
          <span>Name</span>
        </div>
      )}

      {columns.price && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'justify-end gap-2' : 'flex-1 justify-end',
          )}
          onClick={() => onSort('price')}
        >
          {renderSortIcon('price')}
          <span>Price</span>
        </div>
      )}

      {columns.marketCap && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'justify-end gap-2' : 'flex-1 justify-end',
          )}
          onClick={() => onSort('marketCap')}
        >
          {renderSortIcon('marketCap')}
          <span>Market Cap</span>
        </div>
      )}

      {columns.volume && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'justify-end gap-2' : 'flex-1 justify-end',
          )}
          onClick={() => onSort('volume')}
        >
          {renderSortIcon('volume')}
          <span>24h Volume</span>
        </div>
      )}

      {columns.change && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'justify-end gap-2' : 'flex-1 justify-end',
          )}
          onClick={() => onSort('change')}
        >
          {renderSortIcon('change')}
          <span>24h Change</span>
        </div>
      )}

      {columns.chart && (
        <div
          className={cn(
            headerBaseClass,
            variant === 'trading' ? 'justify-end' : 'flex-1 justify-end',
          )}
        >
          <span>Last 7 Days</span>
        </div>
      )}
    </div>
  );
}
