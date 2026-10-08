// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cueForClick } from "./delegate";
import { cueForToast } from "./surfaces";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}
const q = (root: HTMLElement, sel: string) => root.querySelector(sel)!;

describe("cueForClick", () => {
  it("a button or link taps; a click on nothing interactive is silent", () => {
    const r = dom(`<button><span id=t>Review</span></button><a href="/x" id=l>x</a><p id=p>text</p>`);
    expect(cueForClick(q(r, "#t"))).toEqual({ cue: "tap" });
    expect(cueForClick(q(r, "#l"))).toEqual({ cue: "tap" });
    expect(cueForClick(q(r, "#p"))).toBeNull();
  });

  it("data-sound overrides the press, and none silences it", () => {
    const r = dom(`<button data-sound="destructive" id=c>Cancel</button><button data-sound="none" id=n>x</button>`);
    expect(cueForClick(q(r, "#c"))).toEqual({ cue: "destructive" });
    expect(cueForClick(q(r, "#n"))).toBeNull();
  });

  it("an ancestor's override does not leak past a closer control that has none", () => {
    const r = dom(`<div data-sound="none"><button id=b>inner</button></div>`);
    // The container opts its whole subtree out.
    expect(cueForClick(q(r, "#b"))).toBeNull();
    const r2 = dom(`<button data-sound="swoosh"><span id=i>⇅</span></button>`);
    expect(cueForClick(q(r2, "#i"))).toEqual({ cue: "swoosh" });
  });

  it("a toggle sounds the state it is going TO, read before its handler runs", () => {
    const r = dom(`<button role=switch aria-checked=false id=off></button><button role=switch aria-checked=true id=on></button><button aria-pressed=true id=p></button>`);
    expect(cueForClick(q(r, "#off"))).toEqual({ cue: "toggleOn" });
    expect(cueForClick(q(r, "#on"))).toEqual({ cue: "toggleOff" });
    expect(cueForClick(q(r, "#p"))).toEqual({ cue: "toggleOff" });
  });

  it("a native checkbox has already flipped when click dispatches", () => {
    const r = dom(`<input type=checkbox id=c>`);
    const box = q(r, "#c") as HTMLInputElement;
    box.checked = true;
    expect(cueForClick(box)).toEqual({ cue: "toggleOn" });
  });

  it("a tab selects, pitched by its place; the current tab is silent", () => {
    const r = dom(`<div role=tablist><button role=tab aria-selected=true id=a>1H</button><button role=tab id=b>1D</button><button role=tab id=c>1W</button></div>`);
    expect(cueForClick(q(r, "#a"))).toBeNull();
    expect(cueForClick(q(r, "#b"))).toEqual({ cue: "select", pitch: 1.06 });
    expect(cueForClick(q(r, "#c"))).toEqual({ cue: "select", pitch: 1.12 });
  });

  it("aria-disabled and destructive variants", () => {
    const r = dom(`<button aria-disabled=true id=d>Not enough USDC</button><div role=menuitem data-variant=destructive id=x>Disconnect</div>`);
    expect(cueForClick(q(r, "#d"))).toEqual({ cue: "blocked" });
    expect(cueForClick(q(r, "#x"))).toEqual({ cue: "destructive" });
  });
});

describe("cueForToast", () => {
  it("maps sonner's types to outcomes, and a loading toast to the signature", () => {
    expect(cueForToast("success", "Order confirmed")).toBe("success");
    expect(cueForToast("error", "Trade failed")).toBe("error");
    expect(cueForToast("warning", "Partly filled")).toBe("warning");
    expect(cueForToast("loading", "Market order submitted")).toBe("sign");
    expect(cueForToast("default", "Something")).toBeNull();
  });

  it("names copy and connect from the words, whatever the type", () => {
    expect(cueForToast("success", "Referral link copied")).toBe("copy");
    expect(cueForToast("default", "Contract address copied")).toBe("copy");
    expect(cueForToast("success", "X account connected")).toBe("connect");
    expect(cueForToast("error", "Could not connect")).toBe("error");
  });
});
