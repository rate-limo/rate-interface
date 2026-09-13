import type { GasStatus } from "@/lib/wallet/gasStatus";

/**
 * How far a wallet is from its first trade — OBSERVED, never recorded.
 *
 * ## Why nothing is stored
 *
 * The first version of this was a one-shot modal guarded by a localStorage flag
 * (`iter.deposit-offered`), which meant onboarding was spent whether or not it
 * was used: leave halfway and you were never offered it again. Coinbase and Plum
 * both solve the same moment with a resumable card whose progress comes from real
 * state, and that removes the whole class of problem — a stored flag can drift
 * from the truth, and clearing a browser can lose someone's place. A balance and a
 * trade count cannot drift, because they ARE the truth.
 *
 * So there is no claim, no offer, no "already asked". The card is visible while
 * work remains and gone when it does not.
 *
 * ## `unknown` is not `incomplete`
 *
 * Every step returns `pending` when its source has not answered. A card that
 * says "add USDC" over a wallet whose balance merely failed to load is the same
 * lie `useGasStatus` refuses to tell on the send path, and here it would be
 * permanently on screen rather than momentary.
 */
export type StepState = "done" | "todo" | "pending";

export type OnboardingStep = {
  key: "wallet" | "fund" | "trade";
  state: StepState;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  /** Steps genuinely finished. Pending never counts as done. */
  completed: number;
  total: number;
  /** The first unfinished step, or null when there is nothing left to do. */
  next: OnboardingStep | null;
  /** True only when every step is DONE — never merely "not todo". */
  finished: boolean;
  /**
   * Whether the card should render at all.
   *
   * False while anything is still pending, so the card does not appear, change
   * its own numbers and disappear as reads land — a card that flickers through
   * three states on every page load is worse than one that arrives a beat late.
   */
  ready: boolean;
};

export function onboardingProgress(input: {
  connected: boolean;
  gas: GasStatus;
  /** From `stats.trades`; undefined until the account read answers. */
  trades: number | undefined;
}): OnboardingProgress {
  const wallet: StepState = input.connected ? "done" : "todo";
  const fund: StepState =
    input.gas === "ok" ? "done" : input.gas === "empty" ? "todo" : "pending";
  const trade: StepState =
    input.trades === undefined ? "pending" : input.trades > 0 ? "done" : "todo";

  const steps: OnboardingStep[] = [
    { key: "wallet", state: wallet },
    { key: "fund", state: fund },
    { key: "trade", state: trade },
  ];

  const completed = steps.filter((s) => s.state === "done").length;
  const next = steps.find((s) => s.state === "todo") ?? null;
  const finished = steps.every((s) => s.state === "done");
  const ready = input.connected && steps.every((s) => s.state !== "pending");

  return { steps, completed, total: steps.length, next, finished, ready };
}
