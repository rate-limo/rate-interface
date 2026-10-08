/**
 * The Web Audio synth. Browser-only; nothing here runs during SSR because every
 * entry point is reached from an event or an effect.
 *
 * One AudioContext per page, created on the first play — which in practice is a
 * click, the user gesture browsers require before audio may start. A cue that
 * arrives before any gesture (a fill toast on a fresh load) asks the context to
 * resume and is simply silent if the browser says no.
 *
 * iOS routes Web Audio through the ringer, so the hardware silent switch mutes
 * all of this. That is the platform, not a bug.
 */
import type { Cue, Layer } from "./cues";

type Ctx = { ctx: AudioContext; master: GainNode };
let state: Ctx | null = null;
const noise = new Map<string, AudioBuffer>();

/** Bounds the node count if something upstream fires in a loop. */
const MAX_VOICES = 24;
let voices = 0;

function context(volume: number): Ctx | null {
  if (!state) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      state = { ctx, master };
    } catch {
      return null;
    }
  }
  state.master.gain.value = volume;
  if (state.ctx.state === "suspended") state.ctx.resume().catch(() => {});
  return state;
}

function noiseBuffer(ctx: AudioContext, color: "white" | "brown"): AudioBuffer {
  const hit = noise.get(color);
  if (hit && hit.sampleRate === ctx.sampleRate) return hit;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "brown") {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = w;
  }
  noise.set(color, buf);
  return buf;
}

function voice(ctx: AudioContext, dest: AudioNode, L: Layer, t0: number, ratio: number): void {
  const start = t0 + (L.delay ?? 0);
  const a = Math.max(0.001, L.env.a ?? 0);
  const { d } = L.env;
  const s = L.env.s ?? 0;
  const r = L.env.r ?? 0;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(L.gain, start + a);
  const decayEnd = start + a + d;
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, L.gain * s), decayEnd);
  const end = decayEnd + (s ? Math.max(r, 0.02) : r) + 0.02;
  if (s) g.gain.exponentialRampToValueAtTime(0.0001, end - 0.01);

  let src: AudioScheduledSourceNode;
  if (L.type === "noise") {
    const b = ctx.createBufferSource();
    b.buffer = noiseBuffer(ctx, L.color);
    src = b;
  } else {
    const o = ctx.createOscillator();
    o.type = L.type;
    const f0 = (typeof L.f === "number" ? L.f : L.f.start) * ratio;
    o.frequency.setValueAtTime(f0, start);
    if (typeof L.f !== "number") o.frequency.exponentialRampToValueAtTime(L.f.end * ratio, decayEnd);
    if (L.fm) {
      const mod = ctx.createOscillator();
      const depth = ctx.createGain();
      mod.frequency.value = f0 * L.fm.ratio;
      depth.gain.value = L.fm.depth;
      mod.connect(depth).connect(o.frequency);
      mod.start(start);
      mod.stop(end);
    }
    src = o;
  }

  let node: AudioNode = src;
  if (L.filter) {
    const f = ctx.createBiquadFilter();
    f.type = L.filter.type;
    f.frequency.value = L.filter.f;
    f.Q.value = L.filter.q ?? 0.707;
    node = node.connect(f);
  }
  node.connect(g).connect(dest);

  voices++;
  src.onended = () => {
    voices--;
    g.disconnect();
  };
  src.start(start);
  src.stop(end);
}

/** Renders one cue now. `pitch` multiplies every frequency (1 = as written). */
export function renderCue(cue: Cue, volume: number, pitch = 1): void {
  if (voices >= MAX_VOICES) return;
  const c = context(volume);
  if (!c) return;
  const cents = cue.jitter ? (Math.random() * 2 - 1) * cue.jitter : 0;
  const ratio = 2 ** (cents / 1200) * pitch;
  const t0 = c.ctx.currentTime + 0.004;
  for (const layer of cue.layers) voice(c.ctx, c.master, layer, t0, ratio);
}
