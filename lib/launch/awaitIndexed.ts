/**
 * Wait until the backend has indexed a just-launched coin.
 *
 * The logo claim is authorized against `spotTokens.creator`, a row the broker
 * writes from the `Launched` event a few seconds AFTER the launch receipt. The
 * claim used to run the instant the receipt came back, found no row, and was
 * refused with a 404: every coin launched on RISE ended up with no logo, and
 * the creator was told the signature "was declined or did not go through".
 *
 * Polling here, before the nonce is requested, keeps it to one signature: the
 * server consumes the nonce before it checks the creator, so retrying the claim
 * itself would mean a second wallet prompt.
 *
 * `probe` resolves true once the coin is readable. A thrown probe counts as
 * "not yet". Returns false if the deadline passes, and the claim then goes
 * ahead anyway: a refusal still reaches the success screen as "not linked".
 */
export async function awaitIndexed(
  probe: () => Promise<boolean>,
  { timeoutMs = 90_000, intervalMs = 2_000, sleep = defaultSleep, now = Date.now } = {},
): Promise<boolean> {
  const deadline = now() + timeoutMs;
  for (;;) {
    if (await probe().catch(() => false)) return true;
    if (now() + intervalMs > deadline) return false;
    await sleep(intervalMs);
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
