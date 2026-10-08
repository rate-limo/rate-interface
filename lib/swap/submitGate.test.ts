import { describe, expect, it } from "vitest";
import { swapSubmitDisabled, type SubmitGate } from "./submitGate";

/** A connected wallet with a funded amount and a routable quote: the live case. */
const ready = (over: Partial<SubmitGate> = {}): SubmitGate => ({
  connected: true,
  sameAsset: false,
  isWrap: false,
  hasAmount: true,
  insufficientBalance: false,
  hasExecution: true,
  quoteLoading: false,
  quoteError: false,
  ...over,
});

describe("swapSubmitDisabled", () => {
  it("lets an ordinary routable trade through", () => {
    expect(swapSubmitDisabled(ready())).toBe(false);
  });

  it("enables a WRAP that has no router path — the bug this file exists for", () => {
    // `hasExecution` false is the gateway saying it could not route these two
    // tokens, which for a wrap is correct and irrelevant: they share no market
    // and the conversion never reaches the router.
    expect(swapSubmitDisabled(ready({ isWrap: true, hasExecution: false }))).toBe(false);
  });

  it("still refuses a TRADE with no router path", () => {
    expect(swapSubmitDisabled(ready({ hasExecution: false }))).toBe(true);
  });

  it("does not let a wrap outrun the amount or the balance", () => {
    expect(swapSubmitDisabled(ready({ isWrap: true, hasAmount: false }))).toBe(true);
    expect(swapSubmitDisabled(ready({ isWrap: true, insufficientBalance: true }))).toBe(true);
  });

  it("ignores a stale quote state on a wrap, which never issued a request", () => {
    expect(swapSubmitDisabled(ready({ isWrap: true, hasExecution: false, quoteLoading: true }))).toBe(false);
    expect(swapSubmitDisabled(ready({ isWrap: true, hasExecution: false, quoteError: true }))).toBe(false);
  });

  it("refuses the same asset even disconnected, where every other clause relents", () => {
    // Connecting a wallet cannot make an asset convertible into itself, so the
    // button must not look like it offers a way forward.
    expect(swapSubmitDisabled(ready({ sameAsset: true, connected: false }))).toBe(true);
    expect(swapSubmitDisabled(ready({ sameAsset: true, isWrap: true }))).toBe(true);
  });

  it("keeps 'Connect wallet' live with no amount and no quote", () => {
    // Gating this would leave a visitor no way to connect at all.
    expect(
      swapSubmitDisabled(ready({ connected: false, hasAmount: false, hasExecution: false, quoteError: true })),
    ).toBe(false);
  });

  it("waits out a loading quote and refuses a failed one, for a trade", () => {
    expect(swapSubmitDisabled(ready({ quoteLoading: true }))).toBe(true);
    expect(swapSubmitDisabled(ready({ quoteError: true }))).toBe(true);
  });
});
