"use client";

import { isCueId, type CueId } from "./cues";
import { playSound } from "./play";

/**
 * Presses, tabs, toggles and sliders are sounded by ONE document listener, not
 * by each component. Two hundred buttons do not each get an import; a new
 * button is sounded the day it ships.
 *
 * A component overrides what its press sounds like with `data-sound="<cue>"`
 * (Cancel → `destructive`, theme toggle → `notification`) and opts out with
 * `data-sound="none"` — the sound switch does, because it plays its own cue
 * after the state change and a tap first would be read as the answer.
 *
 * Capture phase, so a handler's `stopPropagation` cannot swallow the sound.
 */

const INTERACTIVE = [
  "button",
  "a[href]",
  "summary",
  "input[type=checkbox]",
  "input[type=radio]",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=option]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
].join(",");

const SELECTS = new Set(["tab", "radio", "option", "menuitemradio"]);
const TOGGLES = new Set(["switch", "checkbox", "menuitemcheckbox"]);

export type ClickCue = { cue: CueId; pitch?: number };

function positionPitch(el: Element, role: string | null): number {
  const parent = el.parentElement;
  if (!parent) return 1;
  const siblings = Array.from(parent.children).filter((c) =>
    role ? c.getAttribute("role") === role : c.tagName === el.tagName,
  );
  const i = Math.max(0, siblings.indexOf(el));
  return 1 + Math.min(i, 8) * 0.06;
}

/**
 * What a click on `target` should sound like, or null for silence. Pure DOM
 * reading — call it in the capture phase, BEFORE the control's own handler has
 * flipped any ARIA state, because a toggle's cue is the state it is going TO.
 */
export function cueForClick(target: Element): ClickCue | null {
  const tagged = target.closest("[data-sound]");
  const el = target.closest(INTERACTIVE);

  // An override applies to the control it sits on or any ancestor of it — and
  // only if no closer interactive element sits between them.
  if (tagged && (!el || tagged === el || tagged.contains(el))) {
    const value = tagged.getAttribute("data-sound");
    if (value === "none") return null;
    if (isCueId(value)) return { cue: value };
  }
  if (!el) return null;

  if (el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled) {
    return { cue: "blocked" };
  }

  // shadcn menu items and buttons mark themselves; a destructive control
  // sounds heavier wherever it is.
  if (el.getAttribute("data-variant") === "destructive") return { cue: "destructive" };

  const role = el.getAttribute("role");
  if (el instanceof HTMLInputElement) {
    // A native input's `checked` has ALREADY flipped by the time click
    // dispatches (pre-activation), so it is read as-is, not inverted.
    if (el.type === "checkbox") return { cue: el.checked ? "toggleOn" : "toggleOff" };
    if (el.type === "radio") return { cue: "select", pitch: positionPitch(el, null) };
  }
  if (role && TOGGLES.has(role)) {
    return { cue: el.getAttribute("aria-checked") === "true" ? "toggleOff" : "toggleOn" };
  }
  if (el.hasAttribute("aria-pressed")) {
    return { cue: el.getAttribute("aria-pressed") === "true" ? "toggleOff" : "toggleOn" };
  }
  if (role && SELECTS.has(role)) {
    // Re-selecting the current tab is not a change.
    if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true") return null;
    return { cue: "select", pitch: positionPitch(el, role) };
  }
  return { cue: "tap" };
}

let installed = 0;
let uninstall: (() => void) | null = null;

function onClick(e: MouseEvent) {
  // A <label> forwards a second, synthetic click to its control; sound the
  // control's click only.
  const t = e.target;
  if (!(t instanceof Element)) return;
  const label = t.closest("label");
  if (label && !t.closest(INTERACTIVE)) return;
  const hit = cueForClick(t);
  if (hit) playSound(hit.cue, { pitch: hit.pitch });
}

function onPointerDown(e: PointerEvent) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  // Native-disabled controls never receive `click`, so this is the only
  // chance to answer them. aria-disabled ones do, and are handled there.
  if (t.closest("button:disabled, input:disabled")) {
    playSound("blocked");
    return;
  }
  if (t instanceof HTMLInputElement && t.type === "range") playSound("tick");
}

function onInput(e: Event) {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === "range") playSound("sliderTick");
}

/**
 * Refcounted: AppShell can be mounted twice on pages that gate it by width,
 * and a second listener would sound every click twice.
 */
export function installSoundDelegate(): () => void {
  installed++;
  if (installed === 1) {
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("input", onInput, true);
    uninstall = () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("input", onInput, true);
    };
  }
  return () => {
    installed--;
    if (installed === 0) {
      uninstall?.();
      uninstall = null;
    }
  };
}
