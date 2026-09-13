import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Atoms/Icon';

export type SortDirection = 'asc' | 'desc' | null;
export type SortField = 'type' | 'amount' | 'status' | 'date' | null;

type TradingInfoTableHeaderProps = {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
};

export function TradingInfoTableHeader({
  sortField,
  sortDirection,
  onSort,
  className,
}: TradingInfoTableHeaderProps) {
  const headerClasses = 'text-neutral-dark-100 text-base cursor-pointer';

  return (
    <div
      className={cn(
        'bg-neutral-dark-600 border-neutral-light-white-12 grid w-full grid-cols-5 rounded-[8px] border px-4 py-7',
        className,
      )}
    >
      <div
        className={cn(headerClasses, 'flex items-center')}
        onClick={() => onSort('type')}
      >
        {sortField === 'type' && <Icon icon={ChevronsUpDown} size={16} />}
        Type
      </div>

      <div
        className={cn(headerClasses, 'flex items-center gap-2')}
        onClick={() => onSort('amount')}
      >
        {sortField === 'amount' && <Icon icon={ChevronsUpDown} size={16} />}
        Amount
      </div>

      <div
        className={cn(headerClasses, 'flex items-center gap-2')}
        onClick={() => onSort('status')}
      >
        {sortField === 'status' && <Icon icon={ChevronsUpDown} size={16} />}
        Status
      </div>

      <div
        className={cn(headerClasses, 'flex items-center gap-2')}
        onClick={() => onSort('date')}
      >
        {sortField === 'date' && <Icon icon={ChevronsUpDown} size={16} />}
        Date
      </div>

      <div className={(headerClasses)}>Action</div>
    </div>
  );
}
