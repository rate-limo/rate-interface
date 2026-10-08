/**
 * When the swap card's primary button is dead, and why.
 *
 * Pulled out of the JSX because it is where a real bug lived and nothing could
 * reach it: the expression required `quote.execution` — the GATEWAY's router
 * path — before any swap could be submitted, which disabled the one conversion
 * that never touches the router. A wrap is `deposit()`/`withdraw()` on the
 * wrapped token, and `execution.ts` has branched to it before any pool lookup
 * all along.
 *
 * The rule is that each clause names a reason the trade cannot proceed, and a
 * clause must not stand in for a different one. "No router path" meant "the
 * gateway could not route this", and it was being read as "this cannot be
 * executed" — true for a trade, false for a wrap.
 */
export interface SubmitGate {
  /** A wallet is connected. Disconnected, the button connects one instead. */
  connected: boolean;
  /** One asset on both legs — refused outright, wallet or no wallet. */
  sameAsset: boolean;
  /** A 1:1 contract call: no route, no book, nothing to quote. */
  isWrap: boolean;
  hasAmount: boolean;
  insufficientBalance: boolean;
  /** The gateway returned a router path. Irrelevant to a wrap. */
  hasExecution: boolean;
  quoteLoading: boolean;
  quoteError: boolean;
}

export function swapSubmitDisabled(gate: SubmitGate): boolean {
  // Before the wallet check: there is no wallet state in which converting an
  // asset into itself becomes possible, so connecting one must not appear to
  // offer a way forward.
  if (gate.sameAsset) return true;
  // Disconnected the button is "Connect wallet", which is always live — gating
  // it on a quote would leave a visitor with no way to connect.
  if (!gate.connected) return false;
  if (!gate.hasAmount || gate.insufficientBalance) return true;
  // A wrap is exempt from every remaining clause: no request was made, so there
  // is no pending state to wait out, no error that could arrive, and no path to
  // require.
  if (gate.isWrap) return false;
  return !gate.hasExecution || gate.quoteLoading || gate.quoteError;
}
