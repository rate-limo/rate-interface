'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PairPicker } from '@/components/Organisms/PairPicker';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';

/**
 * Mobile market selector.
 *
 * Selecting a pair anywhere in the app is navigation — each row is a link to
 * `/trade/pro?chain=&base=&quote=`. Desktop exposes that through
 * `SearchPopover`, whose content is far too wide for a phone, so this wraps the
 * same picker in a bottom sheet instead.
 *
 * ## It shares the picker, rather than reimplementing it
 *
 * This used to filter `defaultSpotPairData.pairs` with its own
 * `String.includes` — a second copy of exactly the bug the desktop popover had,
 * in a second file, which is how one of two implementations quietly stops
 * finding things. Both surfaces now read `useAllPairs`, so a market findable on
 * one is findable on the other, and the listing chip says the same thing in
 * both places.
 *
 * Tapping a row navigates and unmounts this screen; `onSelect` closes the sheet
 * for the case where the chosen market is the one already open, which changes
 * no route.
 */
export function MobilePairSearch({ children }: { children: React.ReactNode }) {
  const { displayNetworkName } = useMarketPageContext();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="flex h-[85vh] flex-col gap-3 rounded-t-2xl border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-0 pt-4 text-[color:var(--m-text-primary)]"
      >
        <SheetHeader className="px-4 pb-1 pt-0">
          <SheetTitle className="text-[color:var(--m-text-primary)]">Select market</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PairPicker
            networkName={displayNetworkName}
            onSelect={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
