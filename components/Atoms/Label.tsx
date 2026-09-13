import { cn } from '@/lib/utils';
import type React from 'react';
interface LabelProps {
  children: React.ReactNode;
  className?: string;
}

export function Label({ children, className = '' }: LabelProps) {
  return (
    <span className={cn('text-neutral-dark-100 text-xs', className)}>
      {children}
    </span>
  );
}
