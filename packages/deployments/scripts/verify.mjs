#!/usr/bin/env node
/**
 * Cross-chain preflight for deployments.json.
 *
 * Walks every registered chain and checks, over plain JSON-RPC (no foundry needed, so this
 * runs in CI):
 *
 *   1. the RPC answers and reports the chain id the registry claims
 *   2. every recorded address actually has code
 *   3. the six wiring links agree with the registry, where a swap system is present
 *   4. `previous` generations still have code, since historical indexing depends on them
 *   5. the recorded economic config matches what the chain reports
 *   6. every `missing` entry is still genuinely missing
 *
 * Check 3 is the reason this exists. `MatchingEngine.setSwapRouter` is the one wiring call
 * whose omission is invisible — the chain deploys, lists pairs and accepts liquidity, and
 * every swap reverts NotRouter. Across N chains that is N chances to ship it broken, and
 * only an on-chain read catches it.
 *
 * Usage:  node scripts/verify.mjs [chainIdOrName]
 * Exits non-zero on any failure, so it can gate a deploy.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(HERE, "..", "deployments.json"), "utf8"));

const SELECTOR = {
  swapRouter: "0xc31c9c07",
  poolFactory: "0x4219dc40",
  impl: "0x8abf6077",
  positionManager: "0x791b98bc",
  router: "0xf887ea40",
  orderbookFactory: "0x8a645e45",
  WETH: "0xad5c4648",
  poolFeeShare: "0xa82a239d",
  getStopOrderEngine: "0x818d26e4",
  matchingEngine: "0x1c0edff2",
  assetGenerator: "0x573e3111",
};

let failures = 0;
let warnings = 0;
const ok = (m) => console.log(`    \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { failures++; console.log(`    \x1b[31m✗ ${m}\x1b[0m`); };
const warn = (m) => { warnings++; console.log(`    \x1b[33m! ${m}\x1b[0m`); };

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

const addrFromWord = (word) =>
  word && word !== "0x" ? "0x" + word.slice(-40) : undefined;
const same = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/** First RPC that answers. A dead endpoint should not read as a bad deployment. */
async function pickRpc(urls) {
  for (const url of urls) {
    try {
      const id = await rpc(url, "eth_chainId", []);
      return { url, chainId: Number.parseInt(id, 16) };
    } catch {}
  }
  return undefined;
}

async function verifyChain(key, chain) {
  console.log(`\n\x1b[1m${chain.name}\x1b[0m (chainId ${chain.chainId})`);

  const live = await pickRpc(chain.rpcUrls ?? []);
  if (!live) {
    warn(`no RPC answered (${(chain.rpcUrls ?? []).join(", ") || "none configured"}) — skipped, not failed`);
    return;
  }
  if (live.chainId !== chain.chainId) {
    bad(`RPC ${live.url} reports chainId ${live.chainId}, registry says ${chain.chainId}`);
    return;
  }
  if (String(chain.chainId) !== key) {
    bad(`registry key "${key}" does not match chainId ${chain.chainId}`);
  }
  ok(`RPC ${live.url} → chainId ${live.chainId}`);

  // 2. code at every recorded address
  const contracts = chain.contracts ?? {};
  for (const [name, entry] of Object.entries(contracts)) {
    const code = await rpc(live.url, "eth_getCode", [entry.address, "latest"]);
    const size = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    if (size === 0) bad(`${name} ${entry.address} has NO CODE`);
    else ok(`${name} ${entry.address} (${size.toLocaleString()} bytes)`);
    if (typeof entry.startBlock !== "number") bad(`${name} is missing startBlock`);
  }

  // 3. wiring, only meaningful once a swap system exists
  const engine = contracts.matchingEngine?.address;
  const hasSwap = Boolean(contracts.poolFactory?.address && contracts.swapRouter?.address);
  if (engine && hasSwap) {
    const call = async (to, sel) => {
      try {
        return addrFromWord(await rpc(live.url, "eth_call", [{ to, data: sel }, "latest"]));
      } catch {
        return undefined; // pre-swap generations revert on these
      }
    };
    const checks = [
      ["engine.swapRouter", await call(engine, SELECTOR.swapRouter), contracts.swapRouter.address,
       "ALL SWAPS WOULD REVERT NotRouter"],
      ["engine.poolFactory", await call(engine, SELECTOR.poolFactory), contracts.poolFactory.address,
       "addPair would create no pool"],
      ["factory.positionManager", await call(contracts.poolFactory.address, SELECTOR.positionManager),
       contracts.positionManager?.address, "liquidity could not be minted"],
      // `pm.router` was the legacy PositionManager's own cached router getter,
      // wired by a `setRouter` call the old deploy scripts made directly. The
      // BandPositionManager replacing it does not cache a router at all -- it
      // reads `BandPool(pool).engine().swapRouter()` per call, the same single
      // source of truth BandPool's own `onlyRouter` gate reads, specifically so
      // the two can never drift out of wiring with each other. So there is
      // nothing to verify there; what BandPositionManager DOES cache, and what
      // a deploy really can forget, is which factory it accepts pools from.
      ["pm.poolFactory", await call(contracts.positionManager?.address, SELECTOR.poolFactory),
       contracts.poolFactory.address, "the position manager would not recognise pools from this factory"],
      ["factory.impl", await call(contracts.poolFactory.address, SELECTOR.impl),
       contracts.poolImplementation?.address, "pool clones would have no implementation"],
      ["engine.stopOrderEngine", await call(engine, SELECTOR.getStopOrderEngine),
       contracts.stopOrderEngine?.address, "stop books would not be created for new pairs"],
      ["stopOrderEngine.matchingEngine", contracts.stopOrderEngine
        ? await call(contracts.stopOrderEngine.address, SELECTOR.matchingEngine) : undefined,
       engine, "stop orders would target a different matching engine"],
      // Both of these are `immutable` on their contracts, so a new engine or a
      // new generator ORPHANS whatever still points at the old one, and nothing
      // can rewire it afterwards. Not hypothetical: redeploying the exchange on
      // 2026-09-04 left presaleLaunch pointing at a retired engine AND a retired
      // generator, and every check above still passed — the bytecode was there,
      // so "deployed" looked true while auctions were dead. A deployed address
      // is not a wired one.
      ["assetGenerator.matchingEngine", contracts.assetGenerator
        ? await call(contracts.assetGenerator.address, SELECTOR.matchingEngine) : undefined,
       engine, "launches would list pairs on a retired engine"],
      ["presaleLaunch.matchingEngine", contracts.presaleLaunch
        ? await call(contracts.presaleLaunch.address, SELECTOR.matchingEngine) : undefined,
       engine, "auctions would settle against a retired engine"],
      ["presaleLaunch.assetGenerator", contracts.presaleLaunch
        ? await call(contracts.presaleLaunch.address, SELECTOR.assetGenerator) : undefined,
       contracts.assetGenerator?.address, "auction graduation would configure pairs on a retired generator"],
    ];
    for (const [label, got, want, consequence] of checks) {
      if (!want) { warn(`${label}: registry has no expected value`); continue; }
      if (same(got, want)) ok(`${label} → ${got}`);
      else bad(`${label} is ${got ?? "unset/reverting"}, expected ${want} — ${consequence}`);
    }
  } else if (engine) {
    ok("exchange-only deployment (no swap system recorded) — wiring checks skipped");
  }

  // 3b. the engine's WETH, which is the one address `pnpm sync` cannot supply
  //
  // WETH is not created by the deploy script, so it appears in no broadcast record and the
  // sync leaves whatever line is already here. On 2026-08-15 that carried the PREVIOUS
  // generation's WETH forward across a redeploy that changed the engine, and a seed script
  // trusted it — listing the native market against a WETH the engine had never heard of.
  // Nothing on chain objects: both addresses are real WETH9s answering symbol() = "WETH".
  if (engine && contracts.weth?.address) {
    let onChain;
    try {
      onChain = addrFromWord(await rpc(live.url, "eth_call", [{ to: engine, data: SELECTOR.WETH }, "latest"]));
    } catch {
      onChain = undefined;
    }
    if (!onChain) warn("engine.WETH() reverted — cannot compare the registry's weth");
    else if (same(onChain, contracts.weth.address)) ok(`engine.WETH → ${onChain}`);
    else {
      bad(
        `engine.WETH() is ${onChain}, registry says ${contracts.weth.address} — ` +
        "the native market would be listed against a token the engine never wraps into",
      );
    }
  }

  // 4. superseded generations must still be readable
  for (const gen of chain.previous ?? []) {
    for (const [name, entry] of Object.entries(gen.contracts ?? {})) {
      if (name.startsWith("$")) continue;
      const code = await rpc(live.url, "eth_getCode", [entry.address, "latest"]);
      const size = code && code !== "0x" ? (code.length - 2) / 2 : 0;
      if (size === 0) bad(`previous ${name} ${entry.address} has NO CODE — history is unindexable`);
      else ok(`previous ${name} ${entry.address} (${size.toLocaleString()} bytes)`);
    }
  }

  // 5. recorded config vs chain
  if (engine && typeof chain.config?.poolFeeShare === "number") {
    try {
      const raw = await rpc(live.url, "eth_call", [{ to: engine, data: SELECTOR.poolFeeShare }, "latest"]);
      const onChain = Number.parseInt(raw, 16);
      if (onChain === chain.config.poolFeeShare) ok(`poolFeeShare ${onChain} matches registry`);
      else bad(`poolFeeShare on chain is ${onChain}, registry says ${chain.config.poolFeeShare}`);
    } catch {
      warn("poolFeeShare() reverted — pre-swap engine, config not comparable");
    }
  }
}

async function verifyMissing(entry) {
  console.log(`\n\x1b[1m${entry.name}\x1b[0m (chainId ${entry.chainId}) — recorded as MISSING`);
  const claimed = entry.tokenListClaims?.matchingEngine;
  if (!claimed) { warn("no claimed address recorded"); return; }
  // Re-check against the web app's chain list rather than the registry (it has no rpcUrls).
  const urls = {
    10143: ["https://testnet-rpc.monad.xyz"],
    6343: ["https://carrot.megaeth.com/rpc"],
  }[entry.chainId];
  const live = urls ? await pickRpc(urls) : undefined;
  if (!live) { warn("no RPC to re-check against — claim not re-verified"); return; }
  const code = await rpc(live.url, "eth_getCode", [claimed, "latest"]);
  const size = code && code !== "0x" ? (code.length - 2) / 2 : 0;
  if (size === 0) ok(`still absent: ${claimed} has no code (${entry.severity} severity)`);
  else bad(`${claimed} NOW HAS ${size} bytes of code — it was deployed; move this chain into "chains"`);
}

/** Config drift across chains is invisible otherwise. */
function reportConfigDrift(chains) {
  const entries = Object.entries(chains).filter(([k]) => !k.startsWith("$"));
  if (entries.length < 2) return;
  console.log(`\n\x1b[1mconfig across chains\x1b[0m`);
  const fields = ["marketSpread", "limitSpread", "matchedPriceReporting", "blockTimeSeconds"];
  for (const f of fields) {
    const seen = new Map();
    for (const [, c] of entries) {
      const v = c.config?.[f];
      if (v === undefined) continue;
      if (!seen.has(String(v))) seen.set(String(v), []);
      seen.get(String(v)).push(c.name);
    }
    if (seen.size === 0) continue;
    const parts = [...seen.entries()].map(([v, names]) => `${v} (${names.join(", ")})`);
    if (seen.size === 1) ok(`${f}: ${parts[0]}`);
    else warn(`${f} differs: ${parts.join(" | ")}`);
  }
}

const only = process.argv[2];
const chains = registry.chains ?? {};
const selected = Object.entries(chains).filter(
  ([k, c]) =>
    !k.startsWith("$") &&
    (!only || k === only || c.name?.toLowerCase() === only.toLowerCase()),
);

if (selected.length === 0) {
  console.error(`no registered chain matches "${only}"`);
  process.exit(1);
}

for (const [k, c] of selected) await verifyChain(k, c);
if (!only) {
  for (const [k, m] of Object.entries(registry.missing ?? {})) {
    if (!k.startsWith("$")) await verifyMissing(m);
  }
  reportConfigDrift(chains);
}

console.log(
  `\n${failures === 0 ? "\x1b[32mall checks passed\x1b[0m" : `\x1b[31m${failures} failure(s)\x1b[0m`}` +
    (warnings ? `, \x1b[33m${warnings} warning(s)\x1b[0m` : ""),
);
process.exit(failures === 0 ? 0 : 1);
