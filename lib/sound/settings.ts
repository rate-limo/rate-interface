"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the interface makes sound, and how loud.
 *
 * Ships ON at 40%: quiet enough that the first press of a session is a
 * discovery rather than a surprise, loud enough to carry a fill notification.
 * The switch lives in the StatusBar on desktop and in the ☰ More sheet on a
 * phone, beside the theme toggle in both places.
 *
 * `rate.sound` has a row in `/cookies`, as every storage key must. Validated on
 * the way out as well as in — localStorage is user-writable.
 */
export const SOUND_KEY = "rate.sound";

export type SoundSettings = { enabled: boolean; volume: number };

export const DEFAULT_SOUND: SoundSettings = { enabled: true, volume: 0.4 };

export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return DEFAULT_SOUND;
  try {
    const decoded: unknown = JSON.parse(raw);
    if (typeof decoded !== "object" || decoded === null) return DEFAULT_SOUND;
    const { enabled, volume } = decoded as Record<string, unknown>;
    return {
      enabled: typeof enabled === "boolean" ? enabled : DEFAULT_SOUND.enabled,
      volume:
        typeof volume === "number" && Number.isFinite(volume)
          ? Math.min(1, Math.max(0, volume))
          : DEFAULT_SOUND.volume,
    };
  } catch {
    return DEFAULT_SOUND;
  }
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; settings: SoundSettings } = { raw: null, settings: DEFAULT_SOUND };

/** Synchronous, cached read — safe to call on every play. */
export function readSoundSettings(): SoundSettings {
  if (typeof window === "undefined") return DEFAULT_SOUND;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SOUND_KEY);
  } catch {
    return cache.settings;
  }
  if (raw !== cache.raw) cache = { raw, settings: parseSoundSettings(raw) };
  return cache.settings;
}

export function writeSoundSettings(patch: Partial<SoundSettings>): void {
  const next = { ...readSoundSettings(), ...patch };
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(SOUND_KEY, raw);
  } catch {
    // Storage blocked: keep the choice for this page's life rather than ignore it.
  }
  cache = { raw, settings: next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The server cannot know the choice, so it renders the default — same
 *  hydration rule as the consent banner. */
export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, readSoundSettings, () => DEFAULT_SOUND);
}
