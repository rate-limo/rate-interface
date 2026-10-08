import { BandPoolABI, BandPositionManagerABI, BandSwapRouterABI } from "@iter/abis";

/**
 * The ABI every band-deposit call should be made with.
 *
 * A deposit is three contracts deep. The wallet calls `BandPositionManager`; the
 * manager calls `BandPool`; a single-sided deposit also calls `BandSwapRouter` on
 * the way in, to convert half the input. A revert from either of the lower two
 * carries a selector the MANAGER's ABI has never heard of — and viem names a
 * custom error only when its fragment is in the ABI passed to that specific call.
 *
 * So `mintSingleSided` reverting `ZeroLiquidity()` reached the LP as the literal
 * string *"The contract function \"mintSingleSided\" reverted with the following
 * signature: 0x10074548"*, which names neither the problem nor anything the
 * person could do about it. Measured on Arc, pool `0x8a7cCE9e…`: an amount that
 * rounds to nothing in a band reverts exactly that way.
 *
 * Error fragments take no part in encoding a call, so appending them changes
 * nothing about how the call is made — it only widens what a revert can be
 * decoded into. `utils/orderErrors.ts` turns the decoded name into a sentence.
 *
 * Same shape, and the same reasoning, as `components/abis/exchange.ts`.
 */
const isError = (f: { type?: string }) => f.type === "error";

/** Keyed by full signature, so two contracts declaring the same error merge. */
const signature = (f: { name?: string; inputs?: readonly { type: string }[] }) =>
  `${f.name}(${(f.inputs ?? []).map((i) => i.type).join(",")})`;

const seen = new Set(BandPositionManagerABI.filter(isError).map(signature));
const extra = [...BandPoolABI, ...BandSwapRouterABI].filter((f) => {
  if (!isError(f)) return false;
  const sig = signature(f);
  if (seen.has(sig)) return false;
  seen.add(sig);
  return true;
});

export const bandDepositAbi = [...BandPositionManagerABI, ...extra];

export default bandDepositAbi;
