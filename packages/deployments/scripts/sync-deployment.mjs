#!/usr/bin/env node
/**
 * Post-deploy sync: forge broadcast -> deployments.json + packages/abis.
 *
 * A forge script leaves its result in `contracts/broadcast/<Script>.s.sol/<chainId>/`
 * and nowhere else. Three things then have to be copied out of it by hand, and each one
 * fails differently when it is forgotten:
 *
 *   * ADDRESS      -- ponder.config resolves contracts through this registry, so a
 *                     missing entry means the contract is simply never watched.
 *   * START BLOCK  -- recorded PER CONTRACT. A contract deployed long after the exchange
 *                     (which is what happened with the swap system on RISE) either
 *                     re-scans history it did not exist for, or, if someone sets one
 *                     chain-wide block instead, silently skips the exchange's own history.
 *   * ABI          -- the indexer builds its eth_getLogs topic filter from it. A stale ABI
 *                     after an event's parameter types changed produces a different
 *                     topic0, and the event is silently never matched. No error, ever.
 *
 * This does all three, and is deliberately boring about it: a minimal textual edit to
 * deployments.json (so the diff is one contract entry rather than a reformatted file),
 * and a regenerated ABI module with the event signatures printed so a topic0-changing
 * edit is visible in the log.
 *
 * Usage:
 *   node scripts/sync-deployment.mjs --script AssetGeneratorDeploy --chain 11155931 \
 *     --contract AssetGenerator=assetGenerator [--contract Other=otherName] [--dry-run]
 *
 * `--contract <SolidityName>=<registryKey>` maps the deployed contract to its
 * `ContractName` in src/index.ts. Add the key to that union first; this script refuses
 * to invent one.
 *
 * Requires `cast` (foundry) on PATH for EIP-55 checksumming — the registry stores
 * checksummed addresses and this package has no crypto dependency. You just ran a forge
 * script, so it is there.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const REPO = join(PKG, "..", "..");
const REGISTRY = join(PKG, "deployments.json");
const ABIS_SRC = join(REPO, "packages", "abis", "src");

const die = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const note = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

/* ------------------------------------ args ------------------------------------ */

function parseArgs(argv) {
  const args = { contracts: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--script") args.script = argv[++i];
    else if (a === "--chain") args.chain = argv[++i];
    else if (a === "--contract") {
      const [solidity, registryKey] = String(argv[++i]).split("=");
      if (!solidity || !registryKey) die(`--contract wants <SolidityName>=<registryKey>, got "${argv[i]}"`);
      args.contracts.push({ solidity, registryKey });
    } else die(`unknown argument: ${a}`);
  }
  if (!args.script) die("--script is required (the forge script contract's file name, without .s.sol)");
  if (!args.chain) die("--chain is required");
  if (args.contracts.length === 0) die("at least one --contract <SolidityName>=<registryKey> is required");
  return args;
}

/* --------------------------------- broadcast ---------------------------------- */

/** Forge writes block numbers as hex strings in receipts, decimal in some versions. */
const toNumber = (v) => {
  if (typeof v === "number") return v;
  const s = String(v);
  return s.startsWith("0x") ? Number.parseInt(s, 16) : Number.parseInt(s, 10);
};

function readBroadcast(script, chain) {
  const path = join(REPO, "contracts", "broadcast", `${script}.s.sol`, String(chain), "run-latest.json");
  if (!existsSync(path)) {
    die(
      `no broadcast at ${path}\n` +
        `  Deploy first, WITH --broadcast: forge script script/.../${script}.s.sol:<Contract> --rpc-url $RPC --broadcast`,
    );
  }
  return { path, run: JSON.parse(readFileSync(path, "utf8")) };
}

/**
 * Fill in receipts the broadcast is missing, from the chain.
 *
 * A `forge script --broadcast` that aborts part way — Arc rejects a whole batch
 * with `txpool is full`, and a retry then aborts on a nonce that moved under it —
 * saves its transactions WITH hashes but with no receipts. The contracts are
 * deployed and correct; only the record is short. `findDeployment` then refuses,
 * and the registry cannot be written for a deployment that actually exists.
 *
 * Refetching by hash is exact: the receipt names the block the contract was
 * created in, which is precisely what the registry's `startBlock` has to be.
 * The alternative people reach for is editing `deployments.json` by hand, and a
 * start block guessed too early makes the indexer backfill from nothing while
 * one guessed too late means it never sees the deployment's own events.
 *
 * Only CREATEs are repaired, and only ones still missing — a complete record
 * costs nothing here. A hash that has no receipt on chain is left alone so the
 * existing refusal still fires: that one really was never mined.
 */
async function repairMissingReceipts(run, chainId, registryText) {
  const creates = (run.transactions ?? []).filter(
    (t) => String(t.transactionType).toUpperCase().startsWith("CREATE") && t.hash,
  );
  const have = new Set((run.receipts ?? []).map((r) => r.transactionHash));
  const missing = creates.filter((t) => !have.has(t.hash));
  if (missing.length === 0) return false;

  const urls = rpcUrlsFor(registryText, chainId);
  if (urls.length === 0) {
    note(`${missing.length} receipt(s) missing and chain ${chainId} has no rpcUrls to refetch them from`);
    return false;
  }

  note(`${missing.length} CREATE receipt(s) missing from the broadcast — refetching from chain`);
  run.receipts = run.receipts ?? [];
  let repaired = 0;
  for (const tx of missing) {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [tx.hash],
          }),
          signal: AbortSignal.timeout(20_000),
        });
        const receipt = (await res.json())?.result;
        if (!receipt?.blockNumber) continue;
        run.receipts.push(receipt);
        repaired++;
        ok(`recovered ${tx.contractName ?? "CREATE"} @ block ${toNumber(receipt.blockNumber)}`);
        break;
      } catch {
        /* try the next endpoint */
      }
    }
  }
  return repaired > 0;
}

/** The CREATE transaction for a contract, joined to its receipt for the block number. */
function findDeployment(run, solidityName) {
  let tx = run.transactions?.find(
    (t) => t.contractName === solidityName && String(t.transactionType).toUpperCase().startsWith("CREATE"),
  );
  // Foundry may omit contractName from broadcast records produced with `--via-ir`.
  // A single CREATE is still unambiguous; refuse the fallback when more than one exists.
  if (!tx) {
    const creates = (run.transactions ?? []).filter((t) =>
      String(t.transactionType).toUpperCase().startsWith("CREATE"),
    );
    if (creates.length === 1 && !creates[0].contractName) {
      tx = creates[0];
      note(`broadcast omitted contractName; using its sole CREATE for ${solidityName}`);
    }
  }
  if (!tx) {
    const seen = [...new Set((run.transactions ?? []).map((t) => t.contractName).filter(Boolean))];
    die(`no CREATE for ${solidityName} in the broadcast. Contracts deployed there: ${seen.join(", ") || "(none)"}`);
  }
  const receipt = run.receipts?.find((r) => r.transactionHash === tx.hash);
  if (!receipt) die(`${solidityName} was created in ${tx.hash} but that receipt is missing from the broadcast`);
  return { address: tx.contractAddress, startBlock: toNumber(receipt.blockNumber), txHash: tx.hash };
}

function checksum(address) {
  try {
    return execFileSync("cast", ["to-check-sum-address", address], { encoding: "utf8" }).trim();
  } catch {
    die("`cast` not found on PATH — needed to checksum the address (the registry stores EIP-55)");
  }
}

/* ------------------------------ registry editing ------------------------------ */

/** Index just past the `{` that opens the object following `"<key>":` from `from`. */
function openBraceAfterKey(text, key, from) {
  const at = text.indexOf(`"${key}":`, from);
  if (at === -1) return -1;
  return text.indexOf("{", at);
}

/** Index of the `}` matching the `{` at `open`. */
function matchingBrace(text, open) {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Replace or insert one contract entry, touching nothing else.
 *
 * Deliberately textual rather than JSON.parse/stringify: the chain keys are numeric
 * strings, and a round-trip would reorder them numerically (JS orders integer-like keys
 * first, ascending), turning a one-line change into a whole-file diff and moving the
 * `$comment` keys the registry uses for provenance.
 */
function upsertContract(text, chainId, registryKey, entry) {
  const chainsOpen = openBraceAfterKey(text, "chains", 0);
  if (chainsOpen === -1) die("deployments.json has no `chains` object");
  const chainOpen = openBraceAfterKey(text, String(chainId), chainsOpen);
  if (chainOpen === -1) die(`chain ${chainId} is not in deployments.json — add the chain before syncing a contract`);
  const chainEnd = matchingBrace(text, chainOpen);
  const contractsOpen = openBraceAfterKey(text, "contracts", chainOpen);
  if (contractsOpen === -1 || contractsOpen > chainEnd) die(`chain ${chainId} has no \`contracts\` object`);
  const contractsEnd = matchingBrace(text, contractsOpen);

  // Match the file's own indentation rather than assuming a depth: `contracts` sits at a
  // different level in a chain than it would anywhere else, and a hardcoded width turns a
  // clean insert into a visibly ragged one.
  const sibling = /\n([ \t]+)"/.exec(text.slice(contractsOpen, contractsEnd));
  const indent = sibling ? sibling[1] : "      ";
  const closeIndent = indent.slice(0, Math.max(0, indent.length - 2));
  const body =
    `{\n${indent}  "address": "${entry.address}",\n` + `${indent}  "startBlock": ${entry.startBlock}\n${indent}}`;

  const existingOpen = openBraceAfterKey(text.slice(0, contractsEnd), registryKey, contractsOpen);
  if (existingOpen !== -1) {
    const existingEnd = matchingBrace(text, existingOpen);
    const before = JSON.parse(text.slice(existingOpen, existingEnd + 1));
    // A `comment` on the existing entry is provenance someone wrote by hand. Keep it.
    const withComment = before.comment
      ? `{\n${indent}  "address": "${entry.address}",\n${indent}  "startBlock": ${entry.startBlock},\n` +
        `${indent}  "comment": ${JSON.stringify(before.comment)}\n${indent}}`
      : body;
    return {
      text: text.slice(0, existingOpen) + withComment + text.slice(existingEnd + 1),
      previous: before,
    };
  }

  // Insert as the last entry inside `contracts`.
  const head = text.slice(0, contractsEnd).replace(/\s*$/, "");
  const tail = text.slice(contractsEnd);
  // A chain's first contract goes into an empty `{}`: no comma after the brace.
  const sep = head.endsWith("{") ? "" : ",";
  return { text: `${head}${sep}\n${indent}"${registryKey}": ${body}\n${closeIndent}${tail}`, previous: null };
}

/* --------------------------------- abi output --------------------------------- */

const camel = (name) => name.charAt(0).toLowerCase() + name.slice(1);

/**
 * The generator in packages/abis is the ONLY thing that writes an ABI module.
 *
 * This used to build the file here, from `contracts/out/<Name>.sol/<Name>.json`
 * alone — and that artifact does not contain events declared in a LIBRARY. Solidity
 * emits such an event from the CALLING contract's address but files the fragment
 * under the library's own artifact, which is the failure apps/broker/CLAUDE.md
 * records for `MatchingHaltedForGas`: the event fires on chain and nothing
 * downstream can decode it.
 *
 * `packages/abis/scripts/generate.mjs` merges those library artifacts (its `TARGETS`
 * name them) and `abiArtifactDrift.test.ts` expects the merged set. Writing the file
 * a second way here meant two writers disagreeing, and the loser was whichever ran
 * last — so a post-deploy sync silently replaced the merged ABI with an unmerged one.
 *
 * It did, on 2026-09-24: syncing the RISE redeploy dropped `MatchingHaltedForGas`
 * from `matchingEngine.ts`, and ponder refused to boot — "Event name for event
 * 'MatchingHaltedForGas' not found in the contract ABI" — crash-looping the indexer
 * on a venue that had just been redeployed, where every other explanation looks more
 * likely than the ABI having been rewritten by the sync step itself.
 *
 * So this delegates. It regenerates every target rather than one, which is both
 * cheap and the point: the generator owns the merge rules, and a second copy of them
 * here is how they drift apart again.
 */
function writeAbi(solidityName, dryRun) {
  const file = join(ABIS_SRC, `${camel(solidityName)}.ts`);
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;

  if (!dryRun) {
    execFileSync("node", [join(REPO, "packages", "abis", "scripts", "generate.mjs")], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  }

  const artifact = join(REPO, "contracts", "out", `${solidityName}.sol`, `${solidityName}.json`);
  if (!existsSync(artifact)) die(`no forge artifact at ${artifact} — run \`forge build\` in contracts/`);
  const { abi } = JSON.parse(readFileSync(artifact, "utf8"));

  const events = abi.filter((e) => e.type === "event");
  for (const e of events) {
    const sig = `${e.name}(${e.inputs.map((i) => i.type).join(",")})`;
    const indexed = e.inputs.filter((i) => i.indexed).map((i) => i.name);
    console.log(`      ${sig}${indexed.length ? `  indexed: ${indexed.join(", ")}` : ""}`);
  }

  const after = existsSync(file) ? readFileSync(file, "utf8") : null;
  const unchanged = before !== null && before === after;
  if (dryRun) {
    console.log(`      would regenerate ${file} via packages/abis/scripts/generate.mjs`);
    return { events: events.length, unchanged: false };
  }
  if (after === null) die(`the generator wrote no ${file} — is ${solidityName} in its TARGETS?`);

  // Export it, if it is not exported already. The generator writes the module; the
  // barrel is this script's business, because a newly synced contract may be one the
  // generator already emitted but nothing had imported yet.
  const indexPath = join(ABIS_SRC, "index.ts");
  const exportLine = `export { ${solidityName}ABI } from "./${camel(solidityName)}.js";`;
  const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  if (!index.includes(exportLine)) {
    writeFileSync(indexPath, `${index.replace(/\s*$/, "")}\n${exportLine}\n`);
    console.log(`      + ${exportLine}`);
  }
  return { events: events.length, unchanged };
}

/* --------------------------------- derived keys -------------------------------- */

/**
 * Registry keys a deploy produces but no broadcast artifact names.
 *
 * Syncing `BandPoolFactory=bandPoolFactory` used to leave TWO entries describing
 * the previous generation, and both are read in production:
 *
 * - **`poolFactory`** is the same contract under its older name — apps/web's
 *   `poolFactoryAddress`, `ponder.config.ts` and `verify.mjs` all read it, and
 *   `chainAudit.test.ts` asserts the two keys SHARE an address. Nothing derived
 *   it, so a redeploy left it pointing at the retired factory.
 * - **`poolImplementation`** is created INSIDE `BandPoolFactory.initialize`, by
 *   the factory rather than by a transaction of its own, so it appears in no
 *   broadcast at all and could only ever be filled in by hand.
 *
 * Both had to be corrected manually on RISE and Arc during the 2026-09-24
 * redeploy. The engine itself is wired correctly — `setPoolFactory` runs — so
 * `engine.poolFactory()` is right while the registry is wrong, and the only
 * thing that compares them is the seed. On Arc that is loud: `seed-arc.sh`
 * refuses with "registry poolFactory (…) disagrees with the engine (…)". On
 * RISE nothing checks, so it is silent until something reads the dead factory
 * and finds the previous generation's pools.
 *
 * `mirror` copies the entry as-is. `call` reads a zero-argument address getter
 * off the freshly synced contract, over the registry's own RPC — the same plain
 * JSON-RPC `verify.mjs` uses, so this needs no node RPC dependency.
 */
const DERIVED = {
  bandPoolFactory: [
    { key: "poolFactory", from: "mirror" },
    { key: "poolImplementation", from: "call", selector: "0x8abf6077", what: "impl()" },
  ],
};

async function rpcCall(url, to, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "eth_call failed");
  return json.result;
}

/** The chain's configured endpoints, as the registry records them. */
function rpcUrlsFor(registryText, chainId) {
  try {
    const chain = JSON.parse(registryText).chains?.[String(chainId)];
    return chain?.rpcUrls ?? [];
  } catch {
    return [];
  }
}

async function resolveDerived(spec, entry, registryText, chainId) {
  if (spec.from === "mirror") return { ...entry };

  for (const url of rpcUrlsFor(registryText, chainId)) {
    try {
      const word = await rpcCall(url, entry.address, spec.selector);
      if (typeof word !== "string" || word.length < 66) continue;
      const addr = checksum(`0x${word.slice(-40)}`);
      if (/^0x0{40}$/i.test(addr)) continue;
      // The implementation exists from the factory's constructor, so it shares
      // the factory's block — there is no earlier one to scan from.
      return { address: addr, startBlock: entry.startBlock };
    } catch {
      // A dead endpoint is not a bad deployment. Try the next one.
    }
  }
  return null;
}

/* ------------------------------------ main ------------------------------------ */

const args = parseArgs(process.argv.slice(2));
const { path: broadcastPath, run } = readBroadcast(args.script, args.chain);

if (run.chain !== undefined && String(run.chain) !== String(args.chain)) {
  die(`broadcast is for chain ${run.chain}, not ${args.chain}`);
}
console.log(`\n${args.script} → chain ${args.chain}\n  ${broadcastPath}\n`);

let registryText = readFileSync(REGISTRY, "utf8");

// Before anything is resolved: a part-broadcast record is repairable, and a
// refusal here would send the operator to hand-edit start blocks instead.
if (await repairMissingReceipts(run, args.chain, registryText)) {
  writeFileSync(broadcastPath, `${JSON.stringify(run, null, 2)}\n`);
  ok(`broadcast record repaired in place: ${broadcastPath}`);
}
// Read the names out of CONTRACT_NAMES, the array ContractName is derived from.
// This used to match a hand-written `| "name"` union; when that was replaced by
// the array the regex silently matched NOTHING, so every --contract was
// rejected as "not in the union" — a script that exists to stop a silent
// omission, failing silently itself. The union form is still accepted so an
// older checkout keeps working.
const indexSource = readFileSync(join(PKG, "src", "index.ts"), "utf8");
// Up to `] as const`, not the first `]`: the entries carry doc comments, and a
// comment mentioning `recipients[]` ended the match early and silently dropped
// every name after it.
const arrayBlock = indexSource.match(/CONTRACT_NAMES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
const known = new Set(
  [
    ...(arrayBlock ? [...arrayBlock[1].matchAll(/"([a-zA-Z]+)"/g)] : []),
    ...indexSource.matchAll(/^\s*\|\s*"([a-zA-Z]+)"/gm),
  ].map((m) => m[1]),
);

for (const { solidity, registryKey } of args.contracts) {
  console.log(`  ${solidity} → contracts.${registryKey}`);
  if (!known.has(registryKey)) {
    die(`"${registryKey}" is not in the ContractName union in src/index.ts — add it there first`);
  }

  const found = findDeployment(run, solidity);
  const address = checksum(found.address);
  const entry = { address, startBlock: found.startBlock };

  const result = upsertContract(registryText, args.chain, registryKey, entry);
  registryText = result.text;

  if (result.previous) {
    const moved = result.previous.address !== address;
    note(
      moved
        ? `REPLACING a live deployment: ${result.previous.address} @ ${result.previous.startBlock} → ${address} @ ${entry.startBlock}`
        : `address unchanged; startBlock ${result.previous.startBlock} → ${entry.startBlock}`,
    );
    if (moved) {
      note("the old address keeps emitting history — consider a `previous` generation entry so replay still finds it");
    }
  }
  ok(`address    ${address}`);
  ok(`startBlock ${entry.startBlock}  (tx ${found.txHash})`);

  const abi = writeAbi(solidity, args.dryRun);
  ok(`abi        ${abi.events} events${abi.unchanged ? " (unchanged)" : ""}`);

  for (const spec of DERIVED[registryKey] ?? []) {
    if (!known.has(spec.key)) continue;
    const value = await resolveDerived(spec, entry, registryText, args.chain);
    if (!value) {
      note(`could not derive ${spec.key} from ${spec.what ?? "the synced entry"} — set it by hand and re-run verify`);
      continue;
    }
    const before = upsertContract(registryText, args.chain, spec.key, value);
    registryText = before.text;
    const how = spec.from === "mirror" ? `mirrors ${registryKey}` : `read from ${registryKey}.${spec.what}`;
    ok(`derived    ${spec.key} ${value.address}  (${how})`);
  }
}

if (args.dryRun) {
  console.log("\n--dry-run: nothing written.\n");
} else {
  writeFileSync(REGISTRY, registryText);
  console.log(`\nWrote ${REGISTRY}`);

  /*
   * BUILD IT HERE, rather than printing the command.
   *
   * `deployments.json` is the source and nothing reads it at runtime: apps/web
   * and every service import `@iter/deployments`, which tsup INLINES the JSON
   * into — so writing the registry without rebuilding leaves a second, older
   * set of addresses wearing the same import, and every consumer keeps using
   * the old one.
   *
   * That is not hypothetical. On 2026-09-18 the registry held Arc's live
   * band-pool factory while `dist` held the retired generation's, and the swap
   * card reported "No band pool is listed for USDC/TITER yet" — true from where
   * it was looking, and four layers from the cause. The instruction to rebuild
   * was printed right here, in this script, and being printed is not being run.
   *
   * Non-fatal: the registry is already written and correct, so a build failure
   * must not read as a failed sync. It says exactly what to run instead.
   */
  const build = (filter) => {
    process.stdout.write(`Building ${filter}… `);
    try {
      execFileSync("pnpm", ["--filter", filter, "build"], { stdio: ["ignore", "pipe", "pipe"] });
      console.log("ok");
      return true;
    } catch (error) {
      console.log("FAILED");
      console.error(String(error.stderr ?? error.message).trim().split("\n").slice(-3).join("\n"));
      return false;
    }
  };
  const built = [build("@iter/abis"), build("@iter/deployments")].every(Boolean);
  if (!built) {
    console.log("\nThe registry is written and correct. Finish the rebuild by hand:");
    console.log("  pnpm --filter @iter/abis build && pnpm --filter @iter/deployments build");
  }

  console.log("\nNext: node scripts/verify.mjs " + args.chain + "   # confirms the address has code on chain");
  console.log("      node ../../scripts/verify-redeploy.mjs <chainId>   # the five things a redeploy does not carry");
  console.log("\nA dev server started BEFORE this must be restarted — Turbopack caches");
  console.log("node_modules dependencies, so a reload keeps serving the old addresses.\n");
}
