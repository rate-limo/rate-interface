import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { LogoMarkV2 } from '@/components/Atoms/LogoMarkV2';

type BrandLogoProps = {
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

// Mark height per size; the wordmark tracks it. The mark is LogoMarkV2 (an
// inline geometric mark that inherits `currentColor` + `--m-background`), and
// the wordmark is the text "Rate" — no baked-in legacy SVG lockup.
const MARK_HEIGHT: Record<NonNullable<BrandLogoProps['size']>, number> = {
  sm: 18,
  md: 22,
  lg: 26,
  xl: 34,
};

export function BrandLogo({
  showName = true,
  size = 'lg',
  className = '',
}: BrandLogoProps) {
  const { displayNetworkSlug } = useMarketPageContext();
  const h = MARK_HEIGHT[size];

  return (
    <Link
      href={buildPageUrl("explore")}
      aria-label="Rate"
      className={cn(
        'font-satoshi flex items-center gap-2 font-medium cursor-pointer text-[color:var(--m-logo)]',
        className,
      )}
    >
      <LogoMarkV2 size={h} />
      {showName && (
        <span
          className="font-bold leading-none tracking-[0.08em]"
          style={{ fontSize: Math.round(h * 0.6) }}
        >
          Rate
        </span>
      )}
    </Link>
  );
}
