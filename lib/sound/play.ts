"use client";

import { CUES, type CueId } from "./cues";
import { renderCue } from "./engine";
import { createSoundGate } from "./gate";
import { readSoundSettings } from "./settings";

const gate = createSoundGate();

/** When the last OUTCOME cue played. The toast observer reads this so an
 *  explicit market cue (fill, rateHit…) is not followed by a generic success
 *  for the toast that carries the same news. */
let lastOutcomeAt = 0;
const OUTCOMES = new Set<CueId>(["success", "error", "warning", "fill", "rest", "pool", "rateHit", "copy", "connect"]);

export type PlayOptions = {
  /** Coalescing key — a tx hash, a toast id. One sound per key. */
  key?: string;
  /** Frequency multiplier: `select` rises by position, `fill` by how much filled. */
  pitch?: number;
};

export function playSound(cue: CueId, opts: PlayOptions = {}): void {
  if (typeof window === "undefined") return;
  const settings = readSoundSettings();
  if (!settings.enabled || settings.volume <= 0) return;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (!gate.allow({ cue, key: opts.key, hidden })) return;
  if (OUTCOMES.has(cue)) lastOutcomeAt = Date.now();
  try {
    renderCue(CUES[cue], settings.volume, opts.pitch);
  } catch {
    // Sound is decoration. Nothing it does may break the action it decorates.
  }
}

/** Plays regardless of the stored switch — for the switch itself, which must
 *  sound when it turns sound on. */
export function previewSound(cue: CueId, volume = readSoundSettings().volume): void {
  try {
    renderCue(CUES[cue], volume);
  } catch {}
}

/** Marks the news as told without sounding it — for a toast whose event has
 *  already been sounded elsewhere (the receipt, the press that caused it). */
export function claimOutcome(): void {
  lastOutcomeAt = Date.now();
}

export function outcomePlayedWithin(ms: number): boolean {
  return Date.now() - lastOutcomeAt < ms;
}
