"use client";

import { useEffect } from "react";
import { installSoundDelegate } from "@/lib/sound/delegate";
import { installSurfaceSounds } from "@/lib/sound/surfaces";

/**
 * Mounts the app-wide sound listeners. Renders nothing. AppShell is the only
 * mount, so sound is an in-app feature — the landing and legal pages are silent,
 * the same boundary SupportWidget draws. Both installers are refcounted, so a
 * second mount costs nothing and sounds nothing twice.
 */
export function SoundEffects() {
  useEffect(() => {
    const offClicks = installSoundDelegate();
    const offSurfaces = installSurfaceSounds();
    return () => {
      offClicks();
      offSurfaces();
    };
  }, []);
  return null;
}
