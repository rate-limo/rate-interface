"use client";

import { useCallback, useMemo, useState } from "react";
import type { OgPassConfig, OwnedPass, TierId } from "./types";
import { mintPass, ogPassConfig } from "./mock";

/**
 * OG Pass state seam.
 *
 * Real behaviour: `owned` = does the connected wallet hold a pass NFT (read its
 * tier); `buy` = the mint transaction; the sale-open time comes from config/chain.
 * This mock starts un-owned (sale view) and `buy(tier)` mints locally so the
 * owned view is reachable; `reset` returns to the sale view (demo only).
 */
export interface UseOgPass {
  config: OgPassConfig;
  owned: OwnedPass | null;
  buy(tierId: TierId): void;
  reset(): void;
}

export function useOgPass(): UseOgPass {
  const config = useMemo(() => ogPassConfig(), []);
  const [owned, setOwned] = useState<OwnedPass | null>(null);

  const buy = useCallback(
    (tierId: TierId) => {
      // TODO(real): send the mint tx, then read the pass back from chain.
      const tier = config.tiers.find((t) => t.id === tierId);
      if (tier) setOwned(mintPass(tier));
    },
    [config]
  );

  const reset = useCallback(() => setOwned(null), []);

  return { config, owned, buy, reset };
}
