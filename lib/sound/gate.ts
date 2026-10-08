import { BACKGROUND_CUES, type CueId } from "./cues";

/**
 * Decides whether a cue may play. Pure, so the rules are testable without audio.
 *
 * - **One transaction, one sound.** A cue carrying a `key` (a tx hash, a toast
 *   id) plays once per key per `keyTtlMs`. A 20-fill sweep, a StrictMode double
 *   effect and a re-render all collapse to one.
 * - **No machine-gun.** Each cue has a minimum gap, so a slider dragged fast or
 *   a burst of frames cannot stack copies on top of each other.
 * - **Hidden tabs hear outcomes only** (`BACKGROUND_CUES`).
 */
const MIN_GAP_MS: Partial<Record<CueId, number>> = {
  sliderTick: 35,
  tick: 30,
  key: 25,
  tap: 25,
  select: 25,
};
const DEFAULT_GAP_MS = 60;

export type GateInput = { cue: CueId; key?: string; hidden?: boolean };

export function createSoundGate(opts: { now?: () => number; keyTtlMs?: number } = {}) {
  const now = opts.now ?? (() => Date.now());
  const keyTtlMs = opts.keyTtlMs ?? 6_000;
  const lastByCue = new Map<CueId, number>();
  const keys = new Map<string, number>();

  return {
    allow({ cue, key, hidden }: GateInput): boolean {
      const t = now();
      if (hidden && !BACKGROUND_CUES.has(cue)) return false;

      if (key) {
        for (const [k, at] of keys) if (t - at > keyTtlMs) keys.delete(k);
        if (keys.has(key)) return false;
      }

      const last = lastByCue.get(cue);
      if (last !== undefined && t - last < (MIN_GAP_MS[cue] ?? DEFAULT_GAP_MS)) return false;

      lastByCue.set(cue, t);
      if (key) keys.set(key, t);
      return true;
    },
  };
}
