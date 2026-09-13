"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveredWallet, FundingStep } from "@/lib/wallet/externalFunding";

/**
 * The state of a wallet request that may or may not have appeared on screen.
 *
 * ## The premise: those two cases are indistinguishable
 *
 * When the app calls `eth_requestAccounts` or `sendTransaction`, the promise does
 * not settle until the user acts. There is no event for "the prompt rendered",
 * and none for "the extension popup was closed so nothing appeared" — a browser
 * wallet queues the request behind its toolbar icon with no visible sign. From
 * here the two look identical.
 *
 * So this escalates on a timer and never claims to know which it is in. It adds
 * help; it never converts the pending state into a failure.
 *
 * ## Why there is no timeout
 *
 * A timer that gave up and reset the button would be the worst option available.
 * The request is still sitting in the wallet: the user approves it two minutes
 * later, the funds move, and the app — having stopped watching — shows no pending
 * deposit and no confirmation, so they send again. Only the user ends the wait.
 *
 * That is the same failure the seed's nonce cascade was: a client that stops
 * tracking something it has already broadcast, and behaves as though it never
 * happened.
 */
export type PromptStage =
  /** Nothing in flight. */
  | "idle"
  /** Asked, and it is reasonable to still be waiting. */
  | "waiting"
  /** Long enough that the popup may not have surfaced — suggest the toolbar. */
  | "hint"
  /** Long enough to offer another route, WITHOUT withdrawing this one. */
  | "alternatives";

/** Long enough to read a dialog, short enough that a missing one is not a wait. */
const HINT_AFTER_MS = 4_000;
/** Long enough to conclude this route may not work today. */
const ALTERNATIVES_AFTER_MS = 15_000;

export interface WalletPrompt {
  stage: PromptStage;
  /** Which dialog is open, for naming it. Null before the first step reports. */
  step: FundingStep | null;
  /** The wallet being asked, when one was chosen. */
  wallet: DiscoveredWallet | null;
  /** Begin a request. `wallet` is only used for the label. */
  begin: (wallet?: DiscoveredWallet | null) => void;
  /** Report the dialog now open — pass straight to `fundPasskeyWallet`'s `onStep`. */
  report: (step: FundingStep) => void;
  /** The request settled, either way. Clears the timers. */
  end: () => void;
}

export function useWalletPrompt(): WalletPrompt {
  const [stage, setStage] = useState<PromptStage>("idle");
  const [step, setStep] = useState<FundingStep | null>(null);
  const [wallet, setWallet] = useState<DiscoveredWallet | null>(null);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const begin = useCallback(
    (chosen?: DiscoveredWallet | null) => {
      clear();
      setWallet(chosen ?? null);
      setStep(null);
      setStage("waiting");
      timers.current.push(
        window.setTimeout(() => setStage("hint"), HINT_AFTER_MS),
        window.setTimeout(() => setStage("alternatives"), ALTERNATIVES_AFTER_MS),
      );
    },
    [clear],
  );

  /**
   * A new dialog does NOT restart the clock.
   *
   * Each step is its own prompt, so a naive implementation resets the timers on
   * every one — and a user stuck on the third dialog would never see the hint,
   * because the first two kept moving the goalposts. The escalation measures how
   * long this deposit has been waiting overall, which is the thing the user is
   * actually experiencing.
   */
  const report = useCallback((next: FundingStep) => setStep(next), []);

  const end = useCallback(() => {
    clear();
    setStage("idle");
    setStep(null);
    setWallet(null);
  }, [clear]);

  // A component unmounting mid-request must not leave timers setting state on it.
  useEffect(() => clear, [clear]);

  return { stage, step, wallet, begin, report, end };
}
