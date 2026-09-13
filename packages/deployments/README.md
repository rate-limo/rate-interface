# @iter/deployments

Deployed contract addresses and start blocks, one entry per chain. **The single source of
truth** — nothing else in the monorepo should resolve a contract address.

## Why this exists

Addresses used to arrive three different ways: `apps/indexer` resolved the matching engine
through `@iter/token-list` but took the swap-side addresses from loose env
vars, `apps/web` read the token list directly in two places, and nothing recorded a start
block for the swap contracts at all.

Verifying the token list's claims against the live chains found that **three of its five
entries are wrong**:

| chain | token list claims | reality |
|---|---|---|
| RISE Testnet | `0x1D66DF6C…` | a **pre-swap-support** engine; `swapRouter()` reverts |
| Monad Testnet | `0x6A79A317…` | **no code.** nonce 0, balance 0 — never used |
| MegaETH Testnet | `0x8E9e786f…` | **no code.** nonce 0, balance 0 — never used |

Monad is in `apps/web`'s `supportedChains` allowlist, so the app was offering a live trading
route on a chain whose matching engine does not exist.

**There is deliberately no fallback to the token list for addresses.** An unregistered chain
throws, and `getChain` names the specific reason when the chain is a known-absent one. The
token list is still the source for *token* metadata — it is only untrusted for addresses.

## Usage

```ts
import { getAddress, getContract, getChain, hasSwapSystem } from "@iter/deployments";

getAddress(11155931, "swapRouter");        // by chain id
getAddress("RISE Testnet", "poolFactory"); // by name
getAddress("rise-testnet", "weth");        // name matching ignores case and separators

getContract(11155931, "poolFactory").startBlock; // 50267559
hasSwapSystem(11155931);                          // true
getChain(11155931).config.matchedPriceReporting;  // false — see below
```

Server-side code should go through `@iter/config`'s `resolveNetwork()`, which returns the
full chain entry as `.deployment`. `apps/web` uses `lib/deployments.ts`, which adds
`chainIsUnavailable()` so the UI can distinguish "not configured" from "deployed nowhere".

## Verifying

```sh
pnpm verify              # every chain
pnpm verify 11155931     # one chain
```

Plain JSON-RPC, no foundry needed, exits non-zero on failure so it can gate a deploy. It
checks that the RPC reports the claimed chain id, that every recorded address has code, that
the six wiring links agree, that superseded generations are still readable, that the recorded
config matches the chain, and that every `missing` entry is still genuinely missing.

Check 3 is why it exists. **`MatchingEngine.setSwapRouter` is the one wiring call whose
omission is invisible** — the chain deploys, lists pairs, accepts liquidity, and every swap
reverts `NotRouter`. Across N chains that is N chances to ship it broken, and only an
on-chain read catches it.

## Design notes

**Start blocks are per contract.** The swap system can be deployed long after the exchange on
the same chain — which is what happened on RISE. A single chain-wide block either re-scans
history the swap contracts did not exist for, or, if set to the later block, silently skips
exchange history.

**`previous[]` holds superseded generations.** RISE's old engine is still live and its events
are the only record of trading before block 50267559, so historical indexing needs it. Each
generation carries its own block range.

**`config.matchedPriceReporting`** records whether `lmp` actually holds the price a pool swap
traded at. `false` when the chain's `marketSpread` is narrower than the LP slippage tiers in
use, because the rail then clamps every fill and records itself. On RISE the market spread is
0.1% against a typical 5% tier, so a swap fills at 105.00 and the pair records 100.10. Read
this before labelling that number "last trade". Asserted in
`contracts/test/swap/DeploymentWiring.t.sol:testProductionSpreadMeansTheRailNotTheFillIsRecorded`.

**`config.blockTimeSeconds` is not decoration.** The swap spread rail is anchored per *block*,
so the same spread bounds price movement differently depending on block production. RISE's
measured 1.0s blocks let the rail saturate the 5% tier bound in ~49 seconds; on a 12s chain the
same config takes ~586s, close to a full TWAP window. The rail provides materially less
protection on a fast chain than its configuration implies.

## Adding a chain after a deploy

1. Run the deploy script; it prints every address plus the env block the indexer consumes.
2. Read addresses out of `contracts/broadcast/<script>/<chainId>/run-latest.json` —
   `transactions[].contractAddress` with the block from the matching `receipts[]` entry.
   `poolImplementation` is created inside `PoolFactory.initialize` and never appears as a
   `CREATE`; read it from `poolFactory.impl()` on-chain.
3. Add the chain to `deployments.json`, addresses checksummed
   (`cast to-check-sum-address`).
4. `pnpm verify <chainId>` — and do not commit until it passes.

If a chain in `missing` gets a real deployment, `pnpm verify` fails with
*"NOW HAS n bytes of code — move this chain into `chains`"*, which is the prompt to migrate it.

## Adding a contract to an existing chain

Steps 2 and 3 above are the manual version of `pnpm sync`, which reads the same broadcast
file and writes the three things a new contract needs — and each of which fails silently
when it is skipped:

```
node scripts/sync-deployment.mjs --script AssetGeneratorDeploy --chain 11155931 \
  --contract AssetGenerator=assetGenerator [--dry-run]
```

| It writes | Skipping it means |
|---|---|
| `contracts.<key>.address` | `ponder.config` resolves nothing, so the contract is never watched |
| `contracts.<key>.startBlock` | a chain-wide block instead either re-scans history the contract did not exist for, or skips the exchange's own |
| `packages/abis/src/<name>.ts` | a stale ABI is a stale **topic0** — the deployed contract's logs match nothing, with no error |

It prints every event signature it wrote, with the indexed parameters, so a change that
moves a topic0 is visible in the deploy log rather than discovered later as an empty table.

Notes:

- The registry key must already exist in the `ContractName` union in `src/index.ts`. The
  script refuses to invent one, because a key nothing reads is worse than a missing entry.
- The edit is textual, not a JSON round-trip: chain ids are numeric-looking keys, and
  `JSON.stringify` would reorder them and move the `$comment` entries. The diff stays at
  the one contract that changed.
- Re-running is safe. An unchanged address reports as such; a **moved** address warns that
  the old one keeps emitting history and probably wants a `previous` generation entry.
- Needs `cast` on PATH for EIP-55 checksumming.
- Then `pnpm --filter @iter/abis build`, and `pnpm verify <chainId>` before committing.
