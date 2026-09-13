import MatchingEngineABI from "./MatchingEngine.json";
import ExchangeErrorsABI from "./ExchangeErrors.json";

/**
 * The ABI every exchange call should be made with.
 *
 * `MatchingEngine.json` alone cannot decode a revert that originates *below* the
 * engine. viem only names a custom error whose 4-byte selector appears in the ABI
 * passed to that specific call, so a revert thrown by `Orderbook` or
 * `ExchangeLinkedList` — the two contracts the engine delegates matching and price
 * bookkeeping to — reached the UI as a raw hex blob and fell through to
 * `error.message`. The shipped MatchingEngine ABI is also older than the source
 * and is missing three of the engine's own errors (`OrderCancelFailed`,
 * `NotSwapRouter`, `PoolFeeShareExceedsDenom`).
 *
 * `ExchangeErrors.json` carries exactly the error fragments those three sources
 * declare that `MatchingEngine.json` does not, deduped by full signature. Error
 * fragments do not participate in calldata encoding, so appending them changes
 * nothing about how a call is made — it only widens what a revert can be decoded
 * into. `decodeOrderSubmitError` is what turns the decoded name into a sentence.
 *
 * Regenerate `ExchangeErrors.json` from `contracts/out/{MatchingEngine,Orderbook,
 * ExchangeLinkedList}.sol/*.json` after a contract change; `contracts/out` is
 * build output and is not committed, which is why the fragments are checked in
 * here rather than read from it.
 */
export const exchangeAbi = [...MatchingEngineABI, ...ExchangeErrorsABI];

export default exchangeAbi;
