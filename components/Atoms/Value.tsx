import { cn } from '@/lib/utils';
import type React from 'react';

interface ValueProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}

export function Value({
  children,
  className = '',
  highlight = false,
}: ValueProps) {
  return (
    <span
      className={cn(
        'text-right text-xs',
        highlight ? 'text-primary-default' : 'text-neutral-light-default',
        className,
      )}
    >
      {children}
    </span>
  );
}
