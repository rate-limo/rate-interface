/**
 * Rate's interface sounds, as data.
 *
 * Every cue is synthesised at play time — no audio files ship. A cue is a few
 * layers (an oscillator or a noise burst), each with its own envelope, an
 * optional frequency sweep, filter, FM and delay; `jitter` detunes each play by
 * up to that many cents so a repeated press never sounds machine-identical.
 *
 * Approved as a set on 2026-10-05 (artifact "Rate interface sound",
 * https://claude.ai/artifact/EQrgVsQwnmaRPHEbsJZd4F). Change a value here and
 * the whole app hears it; there is no second copy.
 */

export type Envelope = { a?: number; d: number; s?: number; r?: number };

export type Layer =
  | {
      type: "sine" | "triangle" | "square";
      f: number | { start: number; end: number };
      fm?: { ratio: number; depth: number };
      filter?: { type: BiquadFilterType; f: number; q?: number };
      env: Envelope;
      gain: number;
      delay?: number;
    }
  | {
      type: "noise";
      color: "white" | "brown";
      filter?: { type: BiquadFilterType; f: number; q?: number };
      env: Envelope;
      gain: number;
      delay?: number;
    };

export type Cue = { jitter: number; layers: Layer[] };

export const CUES = {
  // Presses
  tap: { jitter: 26, layers: [{ type: "sine", f: 1300, fm: { ratio: 0.5, depth: 100 }, env: { a: 0, d: 0.015, r: 0.005 }, gain: 0.2 }] },
  select: { jitter: 22, layers: [{ type: "triangle", f: { start: 900, end: 780 }, env: { a: 0.001, d: 0.055 }, gain: 0.26 }] },
  destructive: {
    jitter: 12,
    layers: [
      { type: "triangle", f: { start: 300, end: 170 }, filter: { type: "lowpass", f: 1400 }, env: { a: 0.002, d: 0.12 }, gain: 0.32 },
      { type: "noise", color: "brown", filter: { type: "bandpass", f: 700, q: 1.1 }, env: { a: 0, d: 0.05 }, gain: 0.06 },
    ],
  },
  // Toggles
  toggleOn: { jitter: 14, layers: [{ type: "sine", f: { start: 520, end: 880 }, env: { a: 0.002, d: 0.085 }, gain: 0.3 }] },
  toggleOff: { jitter: 14, layers: [{ type: "sine", f: { start: 780, end: 420 }, env: { a: 0.002, d: 0.085 }, gain: 0.28 }] },
  // Surfaces
  open: { jitter: 10, layers: [{ type: "triangle", f: { start: 320, end: 620 }, filter: { type: "lowpass", f: 2600 }, env: { a: 0.006, d: 0.13 }, gain: 0.24 }] },
  close: { jitter: 10, layers: [{ type: "triangle", f: { start: 560, end: 300 }, filter: { type: "lowpass", f: 2200 }, env: { a: 0.004, d: 0.11 }, gain: 0.22 }] },
  swoosh: { jitter: 14, layers: [{ type: "sine", f: { start: 300, end: 2000 }, env: { a: 0.008, d: 0.12, r: 0.04 }, gain: 0.12 }] },
  // Values
  tick: { jitter: 18, layers: [{ type: "square", f: 1400, filter: { type: "lowpass", f: 3000 }, env: { a: 0, d: 0.014 }, gain: 0.1 }] },
  sliderTick: {
    jitter: 10,
    layers: [
      { type: "noise", color: "white", filter: { type: "bandpass", f: 3000, q: 4 }, env: { a: 0, d: 0.02, r: 0.006 }, gain: 0.19 },
      { type: "sine", f: 700, env: { a: 0, d: 0.012, r: 0.004 }, gain: 0.09 },
    ],
  },
  key: {
    jitter: 20,
    layers: [
      { type: "sine", f: { start: 1000, end: 900 }, env: { a: 0.001, d: 0.028 }, gain: 0.14 },
      { type: "noise", color: "white", filter: { type: "bandpass", f: 3200, q: 2 }, env: { a: 0, d: 0.01 }, gain: 0.035 },
    ],
  },
  // Outcomes
  success: {
    jitter: 5,
    layers: [
      { type: "triangle", f: 784, env: { a: 0.004, d: 0.16 }, gain: 0.22 },
      { type: "triangle", f: 1175, env: { a: 0.004, d: 0.22 }, gain: 0.18, delay: 0.075 },
    ],
  },
  error: {
    jitter: 5,
    layers: [
      { type: "triangle", f: 300, filter: { type: "lowpass", f: 1200 }, env: { a: 0.003, d: 0.13 }, gain: 0.26 },
      { type: "triangle", f: 224, filter: { type: "lowpass", f: 1000 }, env: { a: 0.003, d: 0.2 }, gain: 0.24, delay: 0.09 },
    ],
  },
  warning: {
    jitter: 5,
    layers: [
      { type: "triangle", f: 622, filter: { type: "lowpass", f: 2800 }, env: { a: 0.003, d: 0.14 }, gain: 0.2 },
      { type: "triangle", f: 622, filter: { type: "lowpass", f: 2800 }, env: { a: 0.003, d: 0.18 }, gain: 0.17, delay: 0.085 },
    ],
  },
  // Market — Rate's own family
  sign: {
    jitter: 8,
    layers: [
      { type: "sine", f: { start: 520, end: 390 }, filter: { type: "lowpass", f: 1800 }, env: { a: 0.002, d: 0.09 }, gain: 0.24 },
      { type: "noise", color: "white", filter: { type: "bandpass", f: 2400, q: 1.5 }, env: { a: 0.001, d: 0.03 }, gain: 0.05 },
    ],
  },
  pending: { jitter: 4, layers: [{ type: "sine", f: 440, filter: { type: "lowpass", f: 900 }, env: { a: 0.02, d: 0.18 }, gain: 0.07 }] },
  fill: {
    jitter: 6,
    layers: [
      { type: "triangle", f: 660, env: { a: 0.002, d: 0.09 }, gain: 0.22 },
      { type: "sine", f: 1320, env: { a: 0.001, d: 0.05 }, gain: 0.06, delay: 0.012 },
    ],
  },
  rest: {
    jitter: 6,
    layers: [
      { type: "triangle", f: { start: 494, end: 392 }, filter: { type: "lowpass", f: 1500 }, env: { a: 0.004, d: 0.16 }, gain: 0.24 },
      { type: "sine", f: 392, env: { a: 0.01, d: 0.3, s: 0.15, r: 0.15 }, gain: 0.06, delay: 0.08 },
    ],
  },
  pool: {
    jitter: 10,
    layers: [
      { type: "sine", f: { start: 1250, end: 420 }, env: { a: 0.001, d: 0.1 }, gain: 0.2 },
      { type: "noise", color: "white", filter: { type: "bandpass", f: 1800, q: 3 }, env: { a: 0.005, d: 0.06 }, gain: 0.04, delay: 0.03 },
    ],
  },
  /** The signature: a resting order filled while you were away. */
  rateHit: {
    jitter: 3,
    layers: [
      { type: "triangle", f: { start: 659, end: 784 }, env: { a: 0.006, d: 0.26 }, gain: 0.16 },
      { type: "triangle", f: { start: 988, end: 784 }, env: { a: 0.006, d: 0.26 }, gain: 0.14 },
      { type: "sine", f: 1175, env: { a: 0.01, d: 0.4, s: 0.08, r: 0.2 }, gain: 0.12, delay: 0.24 },
    ],
  },
  // System
  copy: {
    jitter: 6,
    layers: [
      { type: "sine", f: 1200, env: { a: 0, d: 0.015, r: 0.006 }, gain: 0.16 },
      { type: "sine", f: 1400, env: { a: 0, d: 0.015, r: 0.006 }, gain: 0.14, delay: 0.04 },
    ],
  },
  connect: {
    jitter: 4,
    layers: [
      { type: "triangle", f: 587, env: { a: 0.006, d: 0.16 }, gain: 0.16 },
      { type: "triangle", f: 880, env: { a: 0.006, d: 0.24 }, gain: 0.14, delay: 0.09 },
      { type: "sine", f: 1760, env: { a: 0.002, d: 0.06 }, gain: 0.03, delay: 0.09 },
    ],
  },
  blocked: { jitter: 30, layers: [{ type: "sine", f: 180, filter: { type: "lowpass", f: 700 }, env: { a: 0.004, d: 0.06 }, gain: 0.16 }] },
  notification: {
    jitter: 3,
    layers: [
      { type: "triangle", f: 523, env: { a: 0.008, d: 0.3, s: 0.03, r: 0.12 }, gain: 0.14 },
      { type: "triangle", f: 784, env: { a: 0.008, d: 0.25, s: 0.02, r: 0.1 }, gain: 0.12, delay: 0.12 },
    ],
  },
} satisfies Record<string, Cue>;

export type CueId = keyof typeof CUES;

export function isCueId(value: unknown): value is CueId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CUES, value);
}

/**
 * Outcomes of the viewer's own transactions. The only cues allowed to play in a
 * hidden tab: a fill that lands while you are on another tab is news, a press
 * sound from a tab you cannot see is not.
 */
export const BACKGROUND_CUES: ReadonlySet<CueId> = new Set<CueId>([
  "rateHit",
  "fill",
  "success",
  "error",
  "warning",
  "rest",
  "pool",
]);
