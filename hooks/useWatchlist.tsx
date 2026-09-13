import {
  getSpotPairWatchlistClient,
  getTokenWatchlistClient,
} from "@/queries/client/watchlist";
import {
  addToSpotPairWatchlistClient,
  addToTokenWatchlistClient,
  removeFromSpotPairWatchlistClient,
  removeFromTokenWatchlistClient,
} from "@/mutations/client/watchlist";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Option = "spot" | "token";

export function useWatchlist(option: Option, address?: string) {
  const queryClient = useQueryClient();

  const queryKey = [option, "watchlist", address];

  const {
    data: watchlist = [],
    isLoading,
    refetch,
    error,
  } = useQuery<string[]>({
    queryKey,
    queryFn: () => {
      if (option === "spot") {
        return getSpotPairWatchlistClient();
      } else {
        return getTokenWatchlistClient();
      }
    },
  });

  /**
   * `id` is the pair id or token id — never the symbol. `symbol` rides along as
   * a display label so the row can render before market data arrives.
   *
   * The cache is updated after the write, not before: the server is the source
   * of truth for whether the wallet session was accepted, and an optimistic
   * star that silently failed a 401 is worse than one that appears a beat late.
   */
  const addToWatchlist = async (id: string, symbol?: string) => {
    if (option === "spot") {
      await addToSpotPairWatchlistClient(id, { symbol });
    } else {
      await addToTokenWatchlistClient(id, symbol);
    }

    queryClient.setQueryData<string[]>(queryKey, (prev = []) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const removeFromWatchlist = async (id: string) => {
    if (option === "spot") {
      await removeFromSpotPairWatchlistClient(id);
    } else {
      await removeFromTokenWatchlistClient(id);
    }

    queryClient.setQueryData<string[]>(queryKey, (prev = []) => prev.filter((item) => item !== id));
  };

  return {
    watchlist,
    isLoading,
    error,
    addToWatchlist,
    removeFromWatchlist,
    refetch,
  };
}
