import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

type CheckboxCellProps = {
  id: string;
  isSelected: boolean;
  onSelectChange: (id: string, checked: boolean) => void;
  className?: string;
};

export function CheckboxCell({
  id,
  isSelected,
  onSelectChange,
  className,
}: CheckboxCellProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Checkbox
        checked={isSelected}
        onCheckedChange={checked => onSelectChange(id, !!checked)}
      />
    </div>
  );
}
