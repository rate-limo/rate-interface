import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CarouselSlideProps {
  children: ReactNode;
  isActive: boolean;
  className?: string;
}

export function CarouselSlide({
  children,
  isActive,
  className,
}: CarouselSlideProps) {
  return (
    <div
      className={cn(
        'min-w-full transition-opacity duration-500 ease-in-out',
        isActive ? 'opacity-100' : 'absolute top-0 left-0 opacity-0',
        className,
      )}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
