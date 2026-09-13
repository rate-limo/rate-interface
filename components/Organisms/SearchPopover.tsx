'use client';

import type React from 'react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { PairPicker } from './PairPicker';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { cn } from '@/lib/utils';

/**
 * The anchored market picker on `/trade/pro`.
 *
 * All of the list logic moved to `PairPicker`; this is the popover around it.
 * What used to live here — a tab group with one live tab and two commented
 * out, a token table, dead favourites code, and a `String.includes` filter over
 * `defaultSpotPairData.pairs` — is gone. See `PairPicker` for why that filter
 * was the bug and not merely a limitation.
 *
 * ## Anchored, not a full-screen modal
 *
 * It opens over a live order book, and taking the whole screen to choose a
 * market loses the thing the trader was reading. The shell's ⌘K modal is a
 * different control — cross-chain, four kinds of result — and the two are
 * deliberately not merged.
 *
 * ## `pinnedSpotPair` is gone
 *
 * It existed so the active market stayed selectable "even when the paginated
 * discovery request is empty or temporarily unavailable" — a real hazard when
 * the list was one gated page, and routinely true on RISE, where that page is
 * empty. Now that the picker queries every market on the chain server-side, the
 * condition it guarded cannot arise, and a prop that pins a row for a reason
 * that no longer holds is a row that appears twice.
 */
export interface SearchPopoverProps {
  children?: React.ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function SearchPopover({ children, className, onOpenChange }: SearchPopoverProps) {
  const { displayNetworkName } = useMarketPageContext();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        <div className={cn('relative w-full', className)}>{children}</div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        collisionPadding={16}
        className="mt-2 w-[min(760px,calc(100vw-48px))] max-w-[calc(100vw-48px)] overflow-hidden rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-0 text-[color:var(--m-text-primary)] shadow-[0_24px_80px_rgba(18,30,48,0.24),0_8px_24px_rgba(18,30,48,0.12)] ring-1 ring-black/5"
      >
        <PairPicker
          networkName={displayNetworkName}
          // Selecting a market is navigation, and the destination unmounts this
          // tree — but only when the route actually changes. Closing on select
          // covers re-picking the market already open, which otherwise leaves
          // the popover sitting there looking inert.
          onSelect={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
