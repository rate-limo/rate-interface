"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deserialize, serialize, type LayoutNode, type PanelId } from "@/lib/layout/tree";

/**
 * Holds the workspace tree and mirrors it to localStorage.
 *
 * Renders start from `defaultTree` on both server and client so hydration
 * matches; the stored tree is read in an effect and applied afterwards. A
 * stored tree whose panel set no longer matches the code is rejected by
 * `deserialize`, so a shipped panel change can't leave a user stuck with a
 * broken saved layout. `reset` clears the preference.
 *
 * `legacyStorageKey` exists so renaming a key doesn't silently throw away the
 * layout someone arranged. It is read only when the current key holds nothing,
 * and the value is rewritten under the new name and the old one deleted, so the
 * migration happens once per browser and never fights a newer saved layout.
 */
export function usePersistentLayout(
  storageKey: string,
  defaultTree: LayoutNode,
  panelIds: readonly PanelId[],
  legacyStorageKey?: string,
) {
  const [tree, setTree] = useState<LayoutNode>(defaultTree);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = true;
    try {
      let raw = localStorage.getItem(storageKey);
      if (!raw && legacyStorageKey) {
        raw = localStorage.getItem(legacyStorageKey);
        if (raw) {
          localStorage.setItem(storageKey, raw);
          localStorage.removeItem(legacyStorageKey);
        }
      }
      if (raw) {
        const restored = deserialize(raw, panelIds);
        if (restored) setTree(restored);
      }
    } catch {
      // localStorage unavailable (private mode, SSR edge) — keep the default.
    }
    // panelIds is a module constant; the keys are stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, legacyStorageKey]);

  const update = useCallback(
    (next: LayoutNode) => {
      setTree(next);
      // Don't write before the initial read, or we'd clobber a stored tree
      // with the default during the first commit.
      if (!hydrated.current) return;
      try {
        localStorage.setItem(storageKey, serialize(next));
      } catch {
        // Ignore write failures; the layout still works for this session.
      }
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    setTree(defaultTree);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // no-op
    }
  }, [storageKey, defaultTree]);

  return { tree, setTree: update, reset };
}
