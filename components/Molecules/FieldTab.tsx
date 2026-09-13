import { LucideIcon } from 'lucide-react';
import { Icon } from '../Atoms/Icon';
import { cn } from '@/lib/utils';

export interface FieldTabProps {
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  className?: string;
}

export default function FieldTab({
  icon,
  label,
  active = false,
  className,
}: FieldTabProps) {
  return (
    <div
      className={cn(
        'text-neutral-dark-100 hover:bg-primary-default hover:text-neutral-dark-default flex gap-2 px-3 py-2',
        active && 'bg-primary-default text-neutral-dark-default',
        className,
      )}
    >
      {icon && <Icon icon={icon} />}
      <span>{label}</span>
    </div>
  );
}
