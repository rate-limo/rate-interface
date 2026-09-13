'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CarouselNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}

export function CarouselNavigation({
  onPrevious,
  onNext,
  className,
}: CarouselNavigationProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button variant="neutral" size="xs" onClick={onPrevious}>
        <ChevronLeft size={24} />
        Previous
      </Button>
      <Button variant="primary" size="xs" onClick={onNext}>
        Next
        <ChevronRight size={24} />
      </Button>
    </div>
  );
}
