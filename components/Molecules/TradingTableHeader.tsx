import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { Icon } from '@/components/Atoms/Icon';
import { Checkbox } from '@/components/ui/checkbox';

export type SortDirection = 'asc' | 'desc' | null;
export type ColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
};

type TradingTableHeaderProps = {
  columns: ColumnConfig[];
  sortField: string | null;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  isSelectAllChecked: boolean;
  onSelectAll: (checked: boolean) => void;
  className?: string;
};

export function TradingTableHeader({
  columns,
  sortField,
  sortDirection,
  onSort,
  isSelectAllChecked,
  onSelectAll,
  className,
}: TradingTableHeaderProps) {
  const headerClasses =
    'text-neutral-dark-100 text-base cursor-pointer flex items-center gap-2';

  const gridTemplateColumns = `auto repeat(${columns.length - 1}, minmax(0, 1fr)) auto`;

  return (
    <div
      className={cn(
        'bg-neutral-dark-600 border-neutral-light-white-12 grid w-full rounded-[8px] border px-4 py-7',
        className,
      )}
      style={{ gridTemplateColumns }}
    >
      <div className="mr-4 flex w-6 items-center justify-center">
        <Checkbox checked={isSelectAllChecked} onCheckedChange={onSelectAll} />
      </div>

      {columns.slice(0, -1).map(column => (
        <div
          key={column.key}
          className={cn(
            headerClasses,
            column.sortable ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={() => column.sortable && onSort(column.key)}
        >
          {sortField === column.key && column.sortable && (
            <Icon icon={ChevronsUpDown} size={16} className="mr-1" />
          )}
          <span>{column.label}</span>
        </div>
      ))}

      {/* Actions column header */}
      <div className={cn(headerClasses, 'justify-center')}>
        <span>{columns[columns.length - 1].label}</span>
      </div>
    </div>
  );
}
