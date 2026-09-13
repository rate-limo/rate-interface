import { cn } from '@/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type ActionItem = {
  label: string;
  onClick: () => void;
};

type ActionCellProps = {
  actions: ActionItem[];
  className?: string;
};

export function ActionCell({ actions, className }: ActionCellProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="transparent"
            size="sm"
            className="text-neutral-dark-100 h-auto p-0"
          >
            <MoreHorizontal size={20} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="bg-neutral-dark-700 border-neutral-dark-600 w-48">
          <div className="flex flex-col space-y-1">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant="transparent"
                size="sm"
                onClick={action.onClick}
                className="text-neutral-dark-100 hover:bg-neutral-dark-600 justify-start hover:text-white"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
