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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  return { text: `${head},\n${indent}"${registryKey}": ${body}\n${closeIndent}${tail}`, previous: null };
}

/* --------------------------------- abi output --------------------------------- */

const camel = (name) => name.charAt(0).toLowerCase() + name.slice(1);

function writeAbi(solidityName, dryRun) {
  const artifact = join(REPO, "contracts", "out", `${solidityName}.sol`, `${solidityName}.json`);
  if (!existsSync(artifact)) die(`no forge artifact at ${artifact} — run \`forge build\` in contracts/`);
  const { abi } = JSON.parse(readFileSync(artifact, "utf8"));

  const events = abi.filter((e) => e.type === "event");
  for (const e of events) {
    const sig = `${e.name}(${e.inputs.map((i) => i.type).join(",")})`;
    const indexed = e.inputs.filter((i) => i.indexed).map((i) => i.name);
    console.log(`      ${sig}${indexed.length ? `  indexed: ${indexed.join(", ")}` : ""}`);
  }

  const file = join(ABIS_SRC, `${camel(solidityName)}.ts`);
  // NB: no glob in this header. `src/**/` contains `*/`, which closes the block comment
  // early and leaves the file unparseable — which is exactly how this was found.
  const header =
    `/**\n * ${solidityName} ABI, generated by packages/deployments/scripts/sync-deployment.mjs\n` +
    ` * from the forge artifact for ${solidityName}.sol. Do not hand-edit.\n *\n` +
    ` * The indexer builds its topic filter from these entries, and an event's topic0 is\n` +
    ` * keccak256 of the canonical signature using the EXACT Solidity types — so a stale\n` +
    ` * copy here means the deployed contract's logs carry a topic0 nothing ever matches.\n */\n`;
  const body = `${header}export const ${solidityName}ABI = ${JSON.stringify(abi, null, 2)} as const;\n`;

  const unchanged = existsSync(file) && readFileSync(file, "utf8") === body;
  if (dryRun) {
    console.log(`      would ${unchanged ? "leave unchanged" : existsSync(file) ? "rewrite" : "create"} ${file}`);
    return { events: events.length, unchanged };
  }
  mkdirSync(ABIS_SRC, { recursive: true });
  writeFileSync(file, body);

  // Export it, if it is not exported already.
  const indexPath = join(ABIS_SRC, "index.ts");
  const exportLine = `export { ${solidityName}ABI } from "./${camel(solidityName)}.js";`;
  const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  if (!index.includes(exportLine)) {
    writeFileSync(indexPath, `${index.replace(/\s*$/, "")}\n${exportLine}\n`);
    console.log(`      + ${exportLine}`);
  }
  return { events: events.length, unchanged };
}

/* ------------------------------------ main ------------------------------------ */

const args = parseArgs(process.argv.slice(2));
const { path: broadcastPath, run } = readBroadcast(args.script, args.chain);

if (run.chain !== undefined && String(run.chain) !== String(args.chain)) {
  die(`broadcast is for chain ${run.chain}, not ${args.chain}`);
}
console.log(`\n${args.script} → chain ${args.chain}\n  ${broadcastPath}\n`);

let registryText = readFileSync(REGISTRY, "utf8");
// Read the names out of CONTRACT_NAMES, the array ContractName is derived from.
// This used to match a hand-written `| "name"` union; when that was replaced by
// the array the regex silently matched NOTHING, so every --contract was
// rejected as "not in the union" — a script that exists to stop a silent
// omission, failing silently itself. The union form is still accepted so an
// older checkout keeps working.
const indexSource = readFileSync(join(PKG, "src", "index.ts"), "utf8");
const arrayBlock = indexSource.match(/CONTRACT_NAMES\s*=\s*\[([\s\S]*?)\]/);
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
}

if (args.dryRun) {
  console.log("\n--dry-run: nothing written.\n");
} else {
  writeFileSync(REGISTRY, registryText);
  console.log(`\nWrote ${REGISTRY}`);
  console.log("Next: pnpm --filter @iter/abis build && pnpm --filter @iter/deployments build");
  console.log("      node scripts/verify.mjs " + args.chain + "   # confirms the address has code on chain\n");
}
