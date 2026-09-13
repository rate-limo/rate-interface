import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMarketPageContext } from '@/contexts/MarketPageProvider';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useRequireWallet } from '@/lib/wallet/connectGate';
import { toast } from 'sonner';

type StarButtonProps = {
  isFavorite?: boolean;
  onClick?: () => void;
  className?: string;
  size?: number;
  /**
   * The pair id or token id. This is what the watchlist is KEYED by — symbols
   * are not unique on a venue where anyone can mint a coin called USDC, so
   * keying on one would let a counterfeit take a real token's place in
   * somebody's list.
   */
  id: string;
  /** Display label only, stored so a row can render before market data lands. */
  symbol: string;
  option: "spot" | "token";
};

export function StarButton({
  isFavorite,
  onClick,
  size = 24,
  id,
  symbol,
  className,
  option,
}: StarButtonProps) {
  const { spotPairWatchlist, tokenWatchlist, address } = useMarketPageContext();
  const apiFavorite =
    option === "spot" ? spotPairWatchlist.includes(id) : tokenWatchlist.includes(id);
  const { addToWatchlist, removeFromWatchlist } = useWatchlist(option, address);
  
  // The server is authoritative. The five-branch version this replaced computed
  // exactly `apiFavorite` in every reachable case — `isFavorite` only ever
  // decided the outcome when the two already agreed — so keeping it would have
  // implied a precedence that never existed.
  const isFavoriteResult = apiFavorite;

  const requireWallet = useRequireWallet();

  /**
   * A watchlist belongs to a wallet, so this asks for one BEFORE writing.
   *
   * It used to call the mutation unconditionally. With nobody connected the
   * request came back unauthorized, the rejection was never caught, and a
   * visitor clicking a star got a client-side error instead of a bookmark — from
   * a control whose whole job is a bookmark. Asking first is the fix; the catch
   * below is the second line, because a write can still fail for reasons that
   * have nothing to do with being signed in.
   */
  const handleToggleFavorite = async () => {
    try {
      if (isFavoriteResult) {
        await removeFromWatchlist(id);
      } else {
        await addToWatchlist(id, symbol);
      }
    } catch (error) {
      // Named, not swallowed: a star that silently does nothing is the same
      // dead control this change exists to remove.
      toast.error(
        isFavoriteResult ? "Could not remove from watchlist" : "Could not add to watchlist",
        { description: error instanceof Error ? error.message : undefined },
      );
    }
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        requireWallet(
          () => void handleToggleFavorite(),
          "Connect a wallet to keep a watchlist. It is stored against your address.",
        );
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn('focus:outline-none ', isFavoriteResult ? 'cursor-grabbing' : 'cursor-grab')}
      aria-label="Toggle favorite"
    >
      <Star
        size={size}
        className={cn(
          'text-dark-grey-1',
          isFavoriteResult ? 'text-yellow-500 hover:text-dark-grey-1' : 'hover:text-yellow-500',
        )}
        fill={isFavoriteResult ? 'currentColor' : 'none'}
      />
    </button>
  );
}
