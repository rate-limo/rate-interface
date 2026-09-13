'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CarouselSlide } from '@/components/Atoms/CarouselSlide';
import { CarouselNavigation } from '@/components/Molecules/CarouselNavigation';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface SlideData {
  title: string;
  buttonText: string;
  buttonLink: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  overlayOpacity?: number;
  textColor?: string;
}

export interface CarouselProps {
  slides: SlideData[];
  autoPlay?: boolean;
  interval?: number;
  className?: string;
  navigationClassName?: string;
}

export function Carousel({
  slides,
  autoPlay = false,
  interval = 5000,
  className,
  navigationClassName,
}: CarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const goToNext = useCallback(() => {
    setActiveIndex(prevIndex => (prevIndex + 1) % slides.length);
  }, [slides.length]);

  const goToPrevious = useCallback(() => {
    setActiveIndex(
      prevIndex => (prevIndex - 1 + slides.length) % slides.length,
    );
  }, [slides.length]);

  useEffect(() => {
    if (!autoPlay) return;

    const timer = setInterval(() => {
      goToNext();
    }, interval);

    return () => clearInterval(timer);
  }, [autoPlay, interval, goToNext]);

  const renderedSlides = slides.map((slide, index) => (
    <CarouselSlide key={index} isActive={index === activeIndex}>
      <div className="border-neutral-light-white-12 relative flex h-[360px] w-full items-center overflow-hidden rounded-[16px] border">
        <div
          className="absolute inset-0 z-0 rounded-[16px]"
          style={{
            backgroundImage: slide.backgroundImage
              ? `url(${slide.backgroundImage})`
              : 'none',
            backgroundSize: 'cover',
            backgroundPosition: slide.backgroundPosition || 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Customizable overlay for text readability */}
          <div
            className="bg-neutral-dark-700 absolute inset-0 rounded-[16px]"
            style={{
              opacity: slide.backgroundImage
                ? slide.overlayOpacity !== undefined
                  ? slide.overlayOpacity / 100
                  : 0.5
                : 1,
            }}
          />
        </div>
        <div className="relative z-10 container ml-6">
          <div className="max-w-sm">
            <h1
              className={cn(
                'mb-5 text-5xl leading-[1.2] font-light font-satoshi',
                slide.textColor || 'text-neutral-light-default font-light font-satoshi',
              )}
            >
              {slide.title}
            </h1>
            <div>
              <Button
                variant="primary"
                size="lg"
                className="rounded-full"
                asChild
              >
                <Link href={slide.buttonLink}>{slide.buttonText}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CarouselSlide>
  ));

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative overflow-hidden">{renderedSlides}</div>

      <div
        className={cn(
          'border-neutral-light-white-12 absolute right-6 bottom-6 border p-2 rounded-[144px]',
          navigationClassName,
        )}
      >
        <CarouselNavigation onPrevious={goToPrevious} onNext={goToNext} />
      </div>
    </div>
  );
}
