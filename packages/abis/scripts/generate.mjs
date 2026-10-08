#!/usr/bin/env node
/**
 * Regenerates src/*.ts from the forge build output.
 *
 * These files were hand-maintained, and that is precisely how they went stale: the
 * shipped `OrderMatched` was the old flat signature while `contracts/src` had moved
 * to a nested `orderMatch` tuple, with a different topic0. An indexer decoding with
 * the stale ABI matches nothing and stops seeing fills — silently, because a
 * non-matching topic0 is not an error, just an absence.
 *
 * Run after any contract change:
 *   cd contracts && forge build
 *   node packages/abis/scripts/generate.mjs
 *
 * It rewrites only the ABI arrays. Anything a consumer needs beyond the ABI (the
 * queue schemas in packages/queue, the broker's decoders) is NOT generated and must
 * be updated in the same change — see apps/broker/CLAUDE.md.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const out = join(root, "contracts", "out");
const srcDir = join(here, "..", "src");

/**
 * exported const name -> [output file, forge artifact, ...extra EVENT sources]
 *
 * The extra sources exist because of a Solidity rule with an expensive
 * consequence: **an event declared in a LIBRARY is emitted from the calling
 * contract's address but does NOT appear in that contract's ABI.** forge puts it
 * on the library's own artifact, which nothing here used to read, so the event
 * was invisible to every consumer while being perfectly present on chain.
 *
 * That is not hypothetical. `MatchingHaltedForGas` is declared in MatchingLib
 * and fired 20 times in one 5,000-block window on RISE while no part of this
 * platform could decode it -- the indexer's topic filter is built from these
 * files, so a missing entry is not a decode error, it is an absence. The
 * contract's own NatSpec says the event is "the only channel that can carry it
 * to an indexer or a UI", and the indexer could not see it at all.
 *
 * Merging is by canonical signature, so an event the contract ALSO declares
 * (MatchingLib declares six, five of which the engine re-declares) is not
 * duplicated, and the merge is a no-op for every one of those.
 */
const TARGETS = {
  MatchingEngineABI: [
    "matchingEngine.ts",
    "MatchingEngine.sol/MatchingEngine.json",
    "MatchingLib.sol/MatchingLib.json",
  ],
  ERC20ABI: ["erc20.ts", "MockToken.sol/MockToken.json"],
  PerpEngineABI: ["perpEngine.ts", "PerpEngine.sol/PerpEngine.json"],
  PerpPoolABI: ["perpPool.ts", "PerpPool.sol/PerpPool.json"],
  // LadderStep is declared and emitted in AssetLaunchLib (delegatecall), so it comes
  // from the generator's address but is absent from its own artifact.
  AssetGeneratorABI: ["assetGenerator.ts", "AssetGenerator.sol/AssetGenerator.json", "AssetLaunchLib.sol/AssetLaunchLib.json"],
  // Tempo's copy (contracts/src/tempo). Same ABI as AssetGenerator -- the indexer and app
  // read Tempo through AssetGeneratorABI -- and generated so the registry sync can record
  // it and a drift between the two shows up as a diff here.
  TempoAssetGeneratorABI: [
    "tempoAssetGenerator.ts",
    "TempoAssetGenerator.sol/TempoAssetGenerator.json",
    "TempoAssetLaunchLib.sol/TempoAssetLaunchLib.json",
  ],
  LadderBuyerABI: ["ladderBuyer.ts", "LadderBuyer.sol/LadderBuyer.json"],
  WrappedNativeABI: ["wrappedNative.ts", "WrappedNative.sol/WrappedNative.json"],
  // The band pool generation. These were hand-maintained and went stale within a
  // day: widening reserves and shares to uint256 changed BandLiquidityAdded's
  // signature, and the shipped copy still said uint128 -- a different topic0, which
  // the indexer matches against nothing. That is the exact failure this script was
  // written to stop, so they are generated now.
  BandPoolABI: ["bandPool.ts", "BandPool.sol/BandPool.json"],
  BandPoolFactoryABI: ["bandPoolFactory.ts", "BandPoolFactory.sol/BandPoolFactory.json"],
  BandPositionManagerABI: ["bandPositionManager.ts", "BandPositionManager.sol/BandPositionManager.json"],
  BandSwapRouterABI: ["bandSwapRouter.ts", "BandSwapRouter.sol/BandSwapRouter.json"],
  // Season ITER payouts: the indexer records `Dispersed` / `DispersedBatch`, so
  // the event signatures must track the contract like the band pool's do.
  DisperseABI: ["disperse.ts", "Disperse.sol/Disperse.json"],
};

/**
 * Contracts the app DEPLOYS, which need creation bytecode as well as an ABI.
 *
 * Kept separate from TARGETS because the two emit different files and carry
 * different staleness risks. A stale ABI silently matches no logs; stale
 * BYTECODE silently deploys the wrong contract — the address comes back, the
 * receipt succeeds, and what is at that address is last month's implementation.
 * So these files record the artifact's own `metadata.compiler` and source hash,
 * which is the only thing that makes such a mismatch checkable after the fact.
 */
const DEPLOYABLE = {
  MockToken: ["mockToken.ts", "MockToken.sol/MockToken.json"],
};

/** The warning that has to survive regeneration -- it was being stripped by it. */
const header = (name, artifact) => `/**
 * ${name.replace(/ABI$/, "")} ABI, generated by packages/abis/scripts/generate.mjs
 * from the forge artifact for ${artifact.split("/")[0]}. Do not hand-edit.
 *
 * The indexer builds its topic filter from these entries, and an event's topic0 is
 * keccak256 of the canonical signature using the EXACT Solidity types -- so a stale
 * copy here means the deployed contract's logs carry a topic0 nothing ever matches.
 * Run \`pnpm --filter @iter/abis generate\` after any contract change.
 */
`;

/**
 * The canonical signature, which is what topic0 hashes. Dedupe has to key on
 * this rather than on the name: an overloaded or restructured event keeps its
 * name and changes its topic0, and collapsing those by name would drop the one
 * the chain is actually emitting.
 */
function canonicalSignature(event) {
  const typeOf = (input) =>
    input.type.startsWith("tuple")
      ? `(${(input.components ?? []).map(typeOf).join(",")})${input.type.slice(5)}`
      : input.type;
  return `${event.name}(${(event.inputs ?? []).map(typeOf).join(",")})`;
}

/** Events from `extra` artifacts that `abi` does not already declare. */
function mergeLibraryEvents(abi, extraPaths) {
  const have = new Set(
    abi.filter((f) => f.type === "event").map((f) => canonicalSignature(f)),
  );
  const merged = [];
  for (const rel of extraPaths) {
    const path = join(out, rel);
    if (!existsSync(path)) continue;
    for (const f of JSON.parse(readFileSync(path, "utf8")).abi) {
      if (f.type !== "event") continue;
      const sig = canonicalSignature(f);
      if (have.has(sig)) continue;
      have.add(sig);
      merged.push(f);
    }
  }
  return merged;
}

const only = process.argv.slice(2);
let wrote = 0;
let skipped = [];

for (const [name, [file, artifact, ...extra]] of Object.entries(TARGETS)) {
  if (only.length > 0 && !only.includes(name)) continue;
  const path = join(out, artifact);
  if (!existsSync(path)) {
    // Not every artifact exists in every checkout; leaving the previous file in
    // place beats emitting an empty ABI that would silently match nothing.
    skipped.push(`${name} (no ${artifact})`);
    continue;
  }
  const { abi } = JSON.parse(readFileSync(path, "utf8"));
  // Appended, never interleaved, so regenerating an unchanged contract produces
  // a byte-identical file and the diff stays reviewable.
  const libEvents = mergeLibraryEvents(abi, extra);
  const full = [...abi, ...libEvents];
  const body = header(name, artifact) + `export const ${name} = ${JSON.stringify(full, null, 2)} as const;\n`;
  writeFileSync(join(srcDir, file), body);
  const events = full.filter((e) => e.type === "event").length;
  const note = libEvents.length > 0 ? ` (+${libEvents.length} from ${extra.join(", ")})` : "";
  console.log(`  ${name.padEnd(22)} ${String(full.length).padStart(4)} fragments, ${events} events${note}`);
  wrote++;
}

for (const [name, [file, artifact]] of Object.entries(DEPLOYABLE)) {
  if (only.length > 0 && !only.includes(name)) continue;
  const path = join(out, artifact);
  if (!existsSync(path)) {
    skipped.push(`${name} (no ${artifact})`);
    continue;
  }
  const art = JSON.parse(readFileSync(path, "utf8"));
  const bytecode = art.bytecode?.object;
  if (!bytecode || !/^0x[0-9a-fA-F]*$/.test(bytecode) || bytecode.length < 4) {
    // An artifact with no bytecode is an interface or an abstract contract, and
    // emitting "0x" here would produce a deploy that succeeds and leaves an
    // empty account behind.
    skipped.push(`${name} (artifact has no deployable bytecode)`);
    continue;
  }
  const compiler = art.metadata?.compiler?.version ?? "unknown";
  const body = `/**
 * ${name} ABI and creation bytecode, generated by packages/abis/scripts/generate.mjs
 * from the forge artifact for ${artifact.split("/")[0]}. Do not hand-edit.
 *
 * Bytecode is here because \`contracts/out\` is build output and is not committed,
 * so nothing that deploys this contract could otherwise reach it. That makes this
 * file the deployable artifact of record — and a stale copy is worse than a stale
 * ABI: the deploy succeeds, the receipt is fine, and the address holds last
 * month's implementation. Regenerate with \`pnpm --filter @iter/abis generate\`
 * after any change to ${artifact.split("/")[0]}.
 *
 * Compiled with solc ${compiler}.
 */
export const ${name}ABI = ${JSON.stringify(art.abi, null, 2)} as const;

/** Creation bytecode — constructor args are appended by the deployer. */
export const ${name}Bytecode = "${bytecode}" as const;

/** solc version the bytecode above was produced by, for provenance. */
export const ${name}Compiler = "${compiler}" as const;
`;
  writeFileSync(join(srcDir, file), body);
  console.log(`  ${(name + " (deployable)").padEnd(22)} ${String(art.abi.length).padStart(4)} fragments, ${(bytecode.length / 2 - 1).toLocaleString()} bytes`);
  wrote++;
}

console.log(`\n${wrote} written` + (skipped.length ? `, skipped: ${skipped.join(", ")}` : ""));
