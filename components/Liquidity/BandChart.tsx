"use client";

/**
 * The band chart, which is also the allocation control.
 *
 * ## Why history stops at the centre
 *
 * Everything right of the last close is not time. It is price space, and it is
 * where the deposit is waiting — so the right half is given to the position
 * rather than to more chart. Each band's allocation is drawn outward from that
 * close, mirrored above and below it, because a band quotes a bid and an ask at
 * the same instant: drawing one side would describe half a position.
 *
 * ## Why it replaced `CLPriceChart` here
 *
 * That chart is `readOnly` on this step and its own prop doc says why — a band
 * position has no range to drag, so the largest element on the screen collected
 * no input. It stays where it is still right: `LaunchLiquidityStep`, where a
 * launch really is choosing a range. Here the same real estate now takes the
 * decision it was only ever illustrating.
 *
 * ## Dragging, and the control it is one half of
 *
 * Pointer-drag writes the same state the preset cards and the split sliders in
 * `BandShapePicker` write — one value, three ways in, never three controls. A
 * canvas cannot be operated by keyboard, so the sliders beneath are the
 * accessible equivalent rather than a second control, and the canvas is
 * `role="img"` with the split spelled out in its label.
 *
 * ## The flow is the argument for the whole page
 *
 * Arrows leave the current price and diverge — up into the asks, down into the
 * bids — arriving in each band in proportion to what is sitting there. It is
 * the only part of this screen that shows the thing an LP is actually buying:
 * not a range, but a share of the order flow that crosses it.
 *
 * Under `prefers-reduced-motion` there is no flow and no slide; the still frame
 * draws the split where it actually is, so nothing about the position is
 * conveyed by movement alone.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatRate } from "@/lib/liquidity/rate";
import type { BandSet } from "@/lib/liquidity/bands";
import type { ChartPeriod } from "@/lib/liquidity/types";
import type { PairCandle } from "@/hooks/usePairCandles";

const PERIODS: ChartPeriod[] = ["1D", "7D", "1M"];
/** Room for the price axis. The bars stop here; the labels live past it. */
const LABEL_W = 104;
const PAD_Y = 16;
/**
 * How much of the axis sits outside the widest band. At 1.0 the outermost band
 * touches the frame and its label has nowhere to go; this leaves it room and
 * still spends most of the height on the bands, which are what is being chosen.
 */
const AXIS_MARGIN = 1.3;
/**
 * How far the axis may stretch past the bands to fit price history, as a
 * multiple of the band span. Beyond this the wicks clip instead: the bands are
 * the thing being chosen, and letting a volatile day squash them back into a
 * hairline undoes the reason this chart replaced the old one.
 */
const MAX_AXIS_SPAN = 4;
/** Exponential approach, per second. Frame-rate independent, and fast enough
 *  that a drag converges inside one frame — so the slide is invisible exactly
 *  where it would otherwise read as lag. */
const EASE_PER_SEC = 13;

/**
 * A canvas colour, with alpha, from a resolved Monet token.
 *
 * Canvas 2D cannot resolve `var()` or `color-mix()` — it has no element to
 * resolve a custom property against — and it fails in two different ways that
 * between them produce a blank chart with no clue why: an unparseable
 * `fillStyle` or `strokeStyle` is SILENTLY IGNORED, leaving whatever was set
 * before, while `addColorStop` THROWS, which aborts the whole frame partway
 * through. This drew nothing at all — not even the market line, which comes
 * after the first gradient — and reported a 497x338 canvas of entirely
 * transparent pixels.
 *
 * So every colour has to be a literal by the time it reaches the context.
 * `css()` resolves the token through `getComputedStyle`; this turns what comes
 * back into `rgba(...)`.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const raw = hex[1]!;
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    const n = Number.parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const parts = rgb[1]!.split(/[,\s/]+/).filter(Boolean).slice(0, 3);
    if (parts.length === 3) return `rgba(${parts.join(", ")}, ${alpha})`;
  }
  /*
   * An unrecognised format — a wide-gamut token, say. Returning it opaque is
   * the safe direction: a solid colour is a visible chart, where anything
   * unparseable is a blank one, and `addColorStop` would take the frame down
   * with it.
   */
  return color;
}

export function BandChart({
  set,
  anchor,
  bands,
  weights,
  onAllocate,
  bringing = "both",
  candles,
  candlesLoading,
  period,
  onPeriod,
  className,
}: {
  set: BandSet;
  anchor: number;
  /** Usable band indices, tightest first — which is also fill order. */
  bands: number[];
  /** Relative weights aligned with `bands`. Normalised here for display. */
  weights: number[];
  /** A band's new share of the deposit, 0–1. 0 leaves the band out entirely. */
  onAllocate: (bandIndex: number, share: number) => void;
  /**
   * Which token the LP is bringing, and therefore WHICH HALF of each band
   * their liquidity occupies.
   *
   * A band quotes a bid and an ask at once, so a two-sided deposit really does
   * sit on both sides of the price and the bars are mirrored. A single-sided
   * one does not: bringing the QUOTE rests below the price as bids, waiting to
   * be converted as the market comes down, and bringing the BASE rests above
   * it as asks. Drawing both halves there claims liquidity on a side the
   * deposit never touches — and the flip control is then a control with no
   * visible effect, which is the failure this chart exists to undo.
   *
   * The band ZONES still span both halves, because the pool's bands do. Only
   * the allocation bars and the flow that arrives in them are one-sided.
   */
  bringing?: "both" | "base" | "quote";
  quoteSym: string;
  candles?: PairCandle[];
  candlesLoading?: boolean;
  period: ChartPeriod;
  onPeriod: (p: ChartPeriod) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<number>(-1);
  /** What the chart DRAWS, easing toward what the deposit IS. */
  const shownRef = useRef<number[] | null>(null);
  const partsRef = useRef<
    { x: number; y: number; m: number; up: boolean; span: number; dyEnd: number }[]
  >([]);

  const shares = useMemo(() => {
    const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
    return sum > 0 ? weights.map((w) => Math.max(0, w) / sum) : weights.map(() => 0);
  }, [weights]);

  // The drawing loop reads these through refs so it never restarts on a render.
  const sharesRef = useRef(shares);
  const bandsRef = useRef(bands);
  const candlesRef = useRef(candles);
  const candlesLoadingRef = useRef(candlesLoading);
  const anchorRef = useRef(anchor);
  const bringingRef = useRef(bringing);
  const setRef = useRef(set);

  const widest = useMemo(
    () => Math.max(...bands.map((i) => set.bands[i]?.tolerance ?? 0), 0.001),
    [bands, set],
  );
  const widestRef = useRef(widest);

  // Synced after commit, not during render: a render React discards must not
  // leave the loop drawing props that never reached the screen.
  useLayoutEffect(() => {
    sharesRef.current = shares;
    bandsRef.current = bands;
    candlesRef.current = candles;
    candlesLoadingRef.current = candlesLoading;
    anchorRef.current = anchor;
    bringingRef.current = bringing;
    setRef.current = set;
    widestRef.current = widest;
  });

  /* ── geometry, all derived from the canvas box ────────────────────────── */
  const geom = useCallback((w: number, h: number) => {
    const a = anchorRef.current;
    const span = widestRef.current * AXIS_MARGIN;
    let hi = a * (1 + span);
    let lo = a * (1 - span);

    /*
     * Grow the axis to fit the history, up to a cap.
     *
     * Bands are ±0.02% to ±0.5% and a day of real trading is routinely wider,
     * so an axis fitted to the bands alone draws candles outside the frame —
     * invisible, with nothing saying they were dropped. Fitting to the candles
     * alone is the opposite failure and the one this whole component exists to
     * undo: on a 5% day the bands collapse back into the hairline that made the
     * old chart useless exactly where the decision is made.
     *
     * So it grows to the candles and stops at `MAX_AXIS_SPAN` times the band
     * span. Past that the bands stay legible and the extreme wicks clip, which
     * is the right way round — the bands are what is being chosen here, and the
     * history is context.
     */
    const rows = candlesRef.current ?? [];
    if (rows.length > 0) {
      let cHi = -Infinity;
      let cLo = Infinity;
      for (const c of rows) {
        if (Number.isFinite(c.h) && c.h > cHi) cHi = c.h;
        if (Number.isFinite(c.l) && c.l < cLo) cLo = c.l;
      }
      if (Number.isFinite(cHi) && Number.isFinite(cLo)) {
        const cap = span * MAX_AXIS_SPAN;
        hi = Math.min(Math.max(hi, cHi), a * (1 + cap));
        lo = Math.max(Math.min(lo, cLo), a * (1 - cap));
      }
    }

    // A degenerate axis divides by zero and puts every mark at NaN, which draws
    // nothing at all and looks exactly like a broken component.
    if (!(hi > lo)) {
      hi = a * (1 + span);
      lo = a * (1 - span);
    }

    const yOf = (price: number) =>
      PAD_Y + ((hi - price) / (hi - lo)) * Math.max(1, h - PAD_Y * 2);
    const midX = Math.round(w * 0.5);
    return { hi, lo, yOf, midX, barMax: Math.max(36, w - LABEL_W - midX - 8) };
  }, []);

  const bandAtY = useCallback(
    (y: number, w: number, h: number) => {
      const { yOf } = geom(w, h);
      const dy = Math.abs(y - yOf(anchorRef.current));
      const list = bandsRef.current;
      for (let i = 0; i < list.length; i++) {
        const tol = setRef.current.bands[list[i]!]?.tolerance ?? 0;
        if (dy <= Math.abs(yOf(anchorRef.current) - yOf(anchorRef.current * (1 + tol)))) return i;
      }
      return -1;
    },
    [geom],
  );

  /* ── the loop ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Bound to a non-nullable name: the null check above does not narrow inside
    // the draw closures below, which run on their own frames.
    const ctx: CanvasRenderingContext2D = context;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 1;
    let h = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(r.width * d);
      canvas.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const css = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

    function ease(dt: number) {
      const target = sharesRef.current;
      const shown = shownRef.current;
      if (!shown || shown.length !== target.length) {
        shownRef.current = target.slice();
        return;
      }
      const k = reduced ? 1 : 1 - Math.exp(-EASE_PER_SEC * dt);
      for (let i = 0; i < target.length; i++) {
        shown[i] += (target[i]! - shown[i]!) * k;
        // Land exactly, or a band at 0% keeps a sliver of bar for ever.
        if (Math.abs(target[i]! - shown[i]!) < 0.0008) shown[i] = target[i]!;
      }
    }

    function drawn(): number[] {
      if (!shownRef.current) shownRef.current = sharesRef.current.slice();
      return shownRef.current;
    }

    function flow(dt: number) {
      if (reduced) return;
      const { yOf, barMax } = geom(w, h);
      const s = drawn();
      const list = bandsRef.current;
      spawn += dt * 24;
      while (spawn >= 1) {
        spawn -= 1;
        // Which band a trade reaches is weighted by what is sitting there, so
        // the flow and the allocation are the same picture.
        let r = Math.random();
        let target = -1;
        for (let i = 0; i < s.length; i++) {
          r -= s[i]!;
          if (r <= 0) {
            target = i;
            break;
          }
        }
        if (target < 0) continue;
        const tol = setRef.current.bands[list[target]!]?.tolerance ?? 0;
        const innerTol =
          target === 0 ? 0 : setRef.current.bands[list[target - 1]!]?.tolerance ?? 0;
        const at = innerTol + Math.random() * Math.max(1e-9, tol - innerTol);
        /*
         * Flow reaches the half the deposit is actually in. With one side
         * empty, arrows arriving there would show order flow meeting liquidity
         * the LP does not have — the chart's whole claim is that what arrives
         * is proportional to what was put there.
         */
        const bringingNow = bringingRef.current;
        const up =
          bringingNow === "base" ? true : bringingNow === "quote" ? false : Math.random() < 0.5;
        partsRef.current.push({
          x: 0,
          y: 0,
          m: 0.25 + Math.random() * 0.7,
          up,
          span: barMax * (0.45 + Math.random() * 0.5),
          dyEnd: yOf(anchorRef.current * (1 + (up ? at : -at))) - yOf(anchorRef.current),
        });
      }
      const parts = partsRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.x += (52 + 68 * p.m) * dt;
        // Eased outward: a trade leaves the price quickly and settles into its
        // band, rather than travelling in a straight line to a corner.
        const t = Math.min(1, p.x / p.span);
        p.y = p.dyEnd * (1 - (1 - t) * (1 - t));
        if (p.x > p.span) parts.splice(i, 1);
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);
    }

    function draw() {
      const { yOf, midX, barMax } = geom(w, h);
      const s = drawn();
      const list = bandsRef.current;
      const a = anchorRef.current;
      const anchorY = yOf(a);
      const plotR = w - LABEL_W;

      const primary = css("--m-primary");
      const border = css("--m-border");
      const dim = css("--m-text-secondary-2");
      const bg = css("--m-background");
      const success = css("--m-success");
      const error = css("--m-error");
      const textCol = css("--m-text-primary");
      const surface = css("--m-surface-2");

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Zones, widest first so the tight ones read as denser.
      for (let k = list.length - 1; k >= 0; k--) {
        const tol = setRef.current.bands[list[k]!]?.tolerance ?? 0;
        const yHi = yOf(a * (1 + tol));
        const yLo = yOf(a * (1 - tol));
        ctx.fillStyle = withAlpha(primary, s[k]! > 0 ? 0.07 : 0.03);
        ctx.fillRect(0, yHi, plotR, yLo - yHi);
        ctx.strokeStyle = s[k]! > 0 ? withAlpha(primary, 0.5) : border;
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yHi + 0.5);
        ctx.lineTo(plotR, yHi + 0.5);
        ctx.moveTo(0, yLo - 0.5);
        ctx.lineTo(plotR, yLo - 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Candles — history only, so they stop at the centre.
      const rows = candlesRef.current ?? [];
      if (rows.length === 0) {
        /*
         * Say so, rather than leave half the chart blank.
         *
         * A pair with no indexed candles is ordinary here — a market can be
         * live and unlisted, or simply new — and an empty left half with
         * nothing in it is indistinguishable from a chart that failed to draw.
         * That is exactly the reading this component shipped with when its
         * colours were unparseable, and it cost a round trip to diagnose.
         */
        ctx.font = "11px 'DM Mono', ui-monospace, monospace";
        ctx.fillStyle = dim;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          candlesLoadingRef.current ? "loading price history…" : "no price history yet",
          midX / 2,
          anchorY - 14,
        );
        ctx.textAlign = "left";
      } else {
        const slot = (midX - PAD_Y) / rows.length;
        const bw = Math.max(1.5, Math.min(9, slot * 0.62));
        for (let i = 0; i < rows.length; i++) {
          const c = rows[i]!;
          const cx = PAD_Y + slot * (i + 0.5);
          const rising = c.c >= c.o;
          ctx.strokeStyle = rising ? success : error;
          ctx.fillStyle = rising ? success : error;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(cx) + 0.5, yOf(c.h));
          ctx.lineTo(Math.round(cx) + 0.5, yOf(c.l));
          ctx.stroke();
          const yo = yOf(c.o);
          const yc = yOf(c.c);
          ctx.fillRect(cx - bw / 2, Math.min(yo, yc), bw, Math.max(1.2, Math.abs(yc - yo)));
        }
      }

      // NOW.
      ctx.strokeStyle = withAlpha(primary, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(midX + 0.5, 6);
      ctx.lineTo(midX + 0.5, h - 6);
      ctx.stroke();
      ctx.setLineDash([]);

      // Allocation, outward from the close — mirrored only when both sides are
      // actually being brought. See the `bringing` prop.
      const showAbove = bringingRef.current !== "quote";
      const showBelow = bringingRef.current !== "base";
      for (let b = 0; b < list.length; b++) {
        if (s[b]! <= 0) continue;
        const tol = setRef.current.bands[list[b]!]?.tolerance ?? 0;
        const innerTol = b === 0 ? 0 : setRef.current.bands[list[b - 1]!]?.tolerance ?? 0;
        const topA = yOf(a * (1 + tol));
        const botA = yOf(a * (1 + innerTol));
        const topB = yOf(a * (1 - innerTol));
        const botB = yOf(a * (1 - tol));
        const bw = Math.max(4, s[b]! * barMax);
        const grad = ctx.createLinearGradient(midX, 0, midX + bw, 0);
        grad.addColorStop(0, withAlpha(primary, 0.5));
        grad.addColorStop(1, withAlpha(primary, 0.16));
        ctx.fillStyle = grad;
        if (showAbove) ctx.fillRect(midX, topA + 1, bw, Math.max(2, botA - topA - 2));
        if (showBelow) ctx.fillRect(midX, topB + 1, bw, Math.max(2, botB - topB - 2));
        // The grab edge, so the bar reads as something you can pull.
        ctx.fillStyle = primary;
        if (showAbove) ctx.fillRect(midX + bw - 2, topA + 1, 2, Math.max(2, botA - topA - 2));
        if (showBelow) ctx.fillRect(midX + bw - 2, topB + 1, 2, Math.max(2, botB - topB - 2));
        // The fee multiplier rides the share: it is the one per-band fact the
        // deposit needs that the chart does not otherwise show. The tightest
        // band straddles the market line, so its two halves read as one row
        // centred on it — each half alone is usually too thin for text.
        const mult = setRef.current.bands[list[b]!]?.feeMultiplier ?? 0;
        const label = `${Math.round(s[b]! * 100)}%${mult > 0 ? ` · ${+mult.toFixed(2)}×` : ""}`;
        // The tightest band straddles the market line, so with both halves
        // drawn its label centres on it. One-sided, the label belongs in the
        // half that exists — centred on the line it would otherwise hang off
        // the end of a bar that is not there.
        const straddles = b === 0 && showAbove && showBelow;
        const rowH = straddles ? botB - topA : showAbove ? botA - topA : botB - topB;
        if (rowH > 13) {
          const ly = straddles
            ? anchorY
            : showAbove
              ? (topA + botA) / 2
              : (topB + botB) / 2;
          ctx.font = "10px 'DM Mono', ui-monospace, monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          if (straddles) {
            // A pill, so the label stays legible over the market line.
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = surface;
            ctx.beginPath();
            ctx.roundRect(midX + bw + 2, ly - 7, tw + 6, 14, 4);
            ctx.fill();
          }
          ctx.fillStyle = textCol;
          ctx.fillText(label, midX + bw + 5, ly);
        }
      }

      // Order flow, diverging into whatever is holding liquidity.
      const parts = partsRef.current;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        const px = midX + p.x;
        const py = anchorY + p.y;
        const fade = Math.max(0, 1 - p.x / Math.max(1, p.span));
        ctx.strokeStyle = withAlpha(p.up ? success : error, 0.2 + 0.6 * fade);
        ctx.lineWidth = 1 + p.m;
        ctx.lineCap = "round";
        const ux = 5 + p.m * 4;
        const uy = (p.dyEnd > 0 ? 1 : -1) * Math.min(4, Math.abs(p.dyEnd) * 0.02);
        ctx.beginPath();
        ctx.moveTo(px - ux, py - uy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }

      // The market, and the axis it is measured on.
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, anchorY);
      ctx.lineTo(plotR, anchorY);
      ctx.stroke();

      ctx.font = "10px 'DM Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const placed: number[] = [anchorY];
      // Outermost first, so a tight band's label is the one dropped when two
      // collide — it sits nearest the market line, which already states a price
      // within a hairline of the one it would be repeating.
      for (let i = list.length - 1; i >= 0; i--) {
        const tol = setRef.current.bands[list[i]!]?.tolerance ?? 0;
        for (const price of [a * (1 + tol), a * (1 - tol)]) {
          const y = yOf(price);
          if (placed.some((p) => Math.abs(p - y) < 12)) continue;
          placed.push(y);
          ctx.fillStyle = s[i]! > 0 ? primary : dim;
          ctx.fillText(formatRate(price), plotR + 6, y - 5);
          ctx.fillStyle = dim;
          ctx.font = "9px 'DM Mono', ui-monospace, monospace";
          ctx.fillText(`±${(tol * 100).toFixed(2)}%`, plotR + 6, y + 5);
          ctx.font = "10px 'DM Mono', ui-monospace, monospace";
        }
      }
      ctx.fillStyle = primary;
      ctx.fillText(formatRate(a), plotR + 6, anchorY);
    }

    let spawn = 0;
    let last = 0;
    let raf = 0;
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      ease(dt);
      flow(dt);
      draw();
      raf = requestAnimationFrame(tick);
    };

    if (reduced) {
      ease(1);
      draw();
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [geom]);

  /* ── dragging ─────────────────────────────────────────────────────────── */
  const hit = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const { midX, barMax } = geom(r.width, r.height);
      return {
        x,
        band: bandAtY(y, r.width, r.height),
        share: Math.max(0, Math.min(1, (x - midX) / barMax)),
        midX,
      };
    },
    [bandAtY, geom],
  );

  return (
    <div
      className={cn(
        "rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-3.5 shadow-sm",
        className,
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Where your liquidity sits</h3>
        <div className="flex items-center gap-2">
          {candlesLoading && (
            <span className="font-mono text-[10px] text-[var(--m-text-secondary-2)]">loading…</span>
          )}
          <div className="flex gap-1 rounded-lg bg-[var(--m-surface-2)] p-[3px]">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === period}
                onClick={() => onPeriod(p)}
                className={cn(
                  "rounded-md px-2 py-1 font-mono text-[11px]",
                  p === period
                    ? "bg-[var(--m-surface)] font-semibold text-[var(--m-text-primary)] shadow-sm"
                    : "text-[var(--m-text-secondary)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative h-[min(46vw,340px)] min-h-[240px] w-full overflow-hidden rounded-[12px] border border-[var(--m-border)]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            `Price history to the centre of the chart, then this deposit's split: ` +
            bands
              .map(
                (b, i) =>
                  `${Math.round((shares[i] ?? 0) * 100)}% in the ±${(
                    (set.bands[b]?.tolerance ?? 0) * 100
                  ).toFixed(2)}% band`,
              )
              .join(", ") +
            `. The sliders below set the same split and can be used from the keyboard.`
          }
          className="block h-full w-full touch-none"
          style={{ cursor: "ew-resize" }}
          onPointerDown={(e) => {
            const h = hit(e);
            if (!h || h.band < 0 || h.x < h.midX - 6) return;
            draggingRef.current = h.band;
            e.currentTarget.setPointerCapture(e.pointerId);
            onAllocate(h.band, h.share);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current < 0) return;
            const h = hit(e);
            if (h) onAllocate(draggingRef.current, h.share);
          }}
          onPointerUp={() => {
            draggingRef.current = -1;
          }}
          onPointerCancel={() => {
            draggingRef.current = -1;
          }}
        />
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary-2)]">
        Drag a band&apos;s bar to put more or less there.
      </p>
    </div>
  );
}
