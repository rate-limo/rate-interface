import { cn } from '@/lib/utils';

type TokenNameProps = {
  name: string;
  className?: string;
};

export function TokenName({ name, className }: TokenNameProps) {
  return (
    <span className={cn('text-sm font-light text-white', className)}>
      {name}
    </span>
  );
}
