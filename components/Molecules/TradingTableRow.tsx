import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ActionCell } from '@/components/Atoms/ActionCell';

type ActionItem = {
  label: string;
  onClick: () => void;
};

type CellConfig = {
  key: string;
  value: string;
  className?: string;
};

type TradingTableRowProps = {
  id: string;
  cells: CellConfig[];
  isSelected: boolean;
  onSelectChange: (id: string, checked: boolean) => void;
  actions: ActionItem[];
  className?: string;
};

export function TradingTableRow({
  id,
  cells,
  isSelected,
  onSelectChange,
  actions,
  className,
}: TradingTableRowProps) {
  const gridTemplateColumns = `auto repeat(${cells.length}, minmax(0, 1fr)) auto`;

  return (
    <div
      className={cn('grid w-full items-center px-4 py-5', className)}
      style={{ gridTemplateColumns }}
    >
      {/* Checkbox column */}
      <div className="mr-4 flex w-6 items-center justify-center">
        <Checkbox
          checked={isSelected}
          onCheckedChange={checked => onSelectChange(id, !!checked)}
        />
      </div>

      {/* Data cells */}
      {cells.map(cell => (
        <div
          key={cell.key}
          className={cn(
            'text-neutral-dark-100 text-base',
            (cell.key === 'pair' || cell.key === 'price' || cell.key === 'amount' || cell.key === 'received') && 'text-success-300',
            cell.className,
          )}
        >
          {cell.value}
        </div>
      ))}

      {/* Action cell - explicitly in its own column */}
      <ActionCell actions={actions} />
    </div>
  );
}
