"use client";

import type { CueId } from "./cues";
import { outcomePlayedWithin, playSound } from "./play";

/**
 * Sounds that follow what APPEARS rather than what was pressed: toasts and
 * overlays. Read from the DOM so the hundred-odd `toast.*` call sites and every
 * Radix dialog, sheet, popover and menu are covered without an import each.
 *
 * Toasts are already one-per-transaction in this app (see "One transaction, one
 * toast" in apps/web/CLAUDE.md), so sounding the toast inherits that rule for
 * free. A loading toast that turns into a success in place is one element whose
 * `data-type` changes — it sounds `sign` when the wallet hands it off and the
 * outcome when the receipt lands, and never twice for one state.
 */

export function cueForToast(type: string | null, text: string): CueId | null {
  if (/\bcopied\b/i.test(text)) return "copy";
  if (/\bconnected\b/i.test(text) && type !== "error") return "connect";
  switch (type) {
    case "success":
      return "success";
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "loading":
      return "sign";
    default:
      return null;
  }
}

const OVERLAY = "[role=dialog],[role=alertdialog],[role=menu],[role=listbox]";
const OUTCOME_GRACE_MS = 1200;

const toastState = new WeakMap<Element, string>();
const overlays = new WeakMap<Element, "open" | "closed">();

function soundToast(li: Element) {
  const type = li.getAttribute("data-type");
  if (!type || toastState.get(li) === type) return;
  toastState.set(li, type);
  const cue = cueForToast(type, li.textContent ?? "");
  if (!cue) return;
  // An explicit market cue (fill, rateHit, rest…) just told this news.
  if (cue !== "sign" && outcomePlayedWithin(OUTCOME_GRACE_MS)) return;
  playSound(cue);
}

function overlayIn(node: Node): Element | null {
  if (!(node instanceof Element)) return null;
  if (node.matches(OVERLAY)) return node;
  return node.querySelector(OVERLAY);
}

function setOverlay(el: Element, next: "open" | "closed") {
  if (overlays.get(el) === next) return;
  overlays.set(el, next);
  playSound(next === "open" ? "open" : "close");
}

let installed = 0;
let teardown: (() => void) | null = null;

export function installSurfaceSounds(): () => void {
  installed++;
  if (installed === 1) {
    const watched = new WeakSet<Element>();
    const observers: MutationObserver[] = [];

    const toastObserver = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof Element && r.target.hasAttribute("data-sonner-toast")) {
          soundToast(r.target);
        }
        for (const n of r.addedNodes) {
          if (n instanceof Element && n.hasAttribute("data-sonner-toast")) soundToast(n);
        }
      }
    });
    observers.push(toastObserver);

    const scanToasters = () => {
      for (const section of document.querySelectorAll("section[aria-label*='otifications']")) {
        if (watched.has(section)) continue;
        watched.add(section);
        toastObserver.observe(section, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-type"] });
      }
    };
    scanToasters();
    // Toasters mount with their page, not on <body>; a slow scan finds new
    // ones without observing the whole document (the order book rewrites
    // hundreds of nodes a second, and a body-wide subtree observer would see
    // every one of them).
    const scan = window.setInterval(scanToasters, 1500);

    // Radix portals land as direct children of <body>, so this needs no subtree.
    const portalObserver = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof Element && r.target.matches(OVERLAY)) {
          const state = r.target.getAttribute("data-state");
          if (state === "closed") setOverlay(r.target, "closed");
          continue;
        }
        for (const n of r.addedNodes) {
          const el = overlayIn(n);
          if (!el) continue;
          if (el.getAttribute("data-state") !== "closed") setOverlay(el, "open");
          // Radix flips data-state to "closed" before its exit animation, so
          // the close sound lands with the gesture, not after the fade.
          if (n instanceof Element) portalObserver.observe(n, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
        }
        for (const n of r.removedNodes) {
          const el = overlayIn(n);
          if (el && overlays.get(el) === "open") setOverlay(el, "closed");
        }
      }
    });
    portalObserver.observe(document.body, { childList: true });
    observers.push(portalObserver);

    teardown = () => {
      window.clearInterval(scan);
      for (const o of observers) o.disconnect();
    };
  }
  return () => {
    installed--;
    if (installed === 0) {
      teardown?.();
      teardown = null;
    }
  };
}
