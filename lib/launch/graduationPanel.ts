import type { GraduationStatus } from "@/lib/portfolio/coinLaunch";
import { countdown } from "@/lib/launch/ladderView";

/**
 * What the coin page's graduation panel offers, from the coin's onchain state.
 *
 * `AssetGenerator.graduate(coin)` is permissionless and takes two calls: the first,
 * once all five ladder asks have filled, ARMS it; a second, at or after `readyAt`,
 * finishes it. Anyone may make either call, and a keeper usually does, so the panel
 * offers the button to any connected wallet rather than only the creator.
 */
export type GraduationPanelAction =
  | { kind: "selling"; title: string; detail: string }
  | { kind: "arm"; title: string; detail: string; button: string }
  | { kind: "wait"; title: string; detail: string; secondsLeft: number }
  | { kind: "graduate"; title: string; detail: string; button: string }
  | { kind: "done"; title: string; detail: string };

export const GRADUATION_NOTE = "Anyone can do this; it usually happens automatically.";

export function graduationPanelAction(
  status: GraduationStatus,
  readyAt: number,
  nowSec: number,
  opts: { stepsSold: number; poolValue?: string | null } = { stepsSold: 0 },
): GraduationPanelAction {
  switch (status) {
    case "selling":
      return {
        kind: "selling",
        title: `Step ${Math.min(opts.stepsSold + 1, 5)} of 5`,
        detail: "Graduation opens once all five steps sell.",
      };
    case "armable":
      return {
        kind: "arm",
        title: "Ready to graduate",
        detail: "All five steps sold. Arming starts a 5-minute wait, then the pool opens.",
        button: "Arm graduation",
      };
    case "armed": {
      const secondsLeft = Math.max(0, readyAt - nowSec);
      return {
        kind: "wait",
        title: `Graduating in ${countdown(secondsLeft)}`,
        detail: "Armed. The pool opens when the wait ends.",
        secondsLeft,
      };
    }
    case "ready":
      return {
        kind: "graduate",
        title: "Ready to finish",
        detail: "The wait is over. Graduating moves the raise and the held-back coins into the pool.",
        button: "Graduate",
      };
    case "graduated":
      return {
        kind: "done",
        title: opts.poolValue ? `Graduated · pool ${opts.poolValue}` : "Graduated",
        detail: "The pool is open and trading.",
      };
  }
}
