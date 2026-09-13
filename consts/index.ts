interface Enums {
    [key: string]: string
}

interface ChainIds {
    [key: string]: number
}


/**
 * The chain a page shows when nothing says otherwise — no `?chain=`, or a
 * wallet on a network this app does not serve.
 *
 * This is NOT the same default as `wagmiChains[0]` in lib/customChains, which
 * decides what a WALLET connects to. The two were disagreeing: the wallet
 * defaulted to Arc while every unparameterised page still rendered RISE, so the
 * app looked like it was on one chain and traded on another.
 *
 * Keep them pointing at the same network. Changing one without the other is how
 * that split comes back.
 */
export const defaultConnectedChain: string = "Arc Testnet";

export const chainIds: ChainIds = {
    "RISE Testnet": 11155931,
    "Monad Testnet": 10143,
    "Ink Sepolia": 763373,
    "Somnia Testnet": 50312,
    "MegaETH Testnet": 6342,
    "Arc Testnet": 5042002,
}

export const chainIdToNetworkName: Enums = {
    11155931: "RISE Testnet",
    10143: "Monad Testnet",
    763373: "Ink Sepolia",
    50312: "Somnia Testnet",
    6342: "MegaETH Testnet",
    5042002: "Arc Testnet",
}

export const slugToNetworkName: Enums = {
    "rise-testnet": "RISE Testnet",
    "monad-testnet": "Monad Testnet",
    "ink-sepolia": "Ink Sepolia",
    "somnia-testnet": "Somnia Testnet",
    "megaeth-testnet": "MegaETH Testnet",
    "arc-testnet": "Arc Testnet",
}

// The inverse of slugToNetworkName, and it must stay total: a name missing here
// yields `undefined`, and callers that thread a slug into a URL then send an
// empty one. `Ink Sepolia` was absent — harmless while it is out of
// SUPPORTED_CHAINS, and a 400 with a confusing message the day it is not.
export const networkNameToSlug: Enums = {
    "RISE Testnet": "rise-testnet",
    "Monad Testnet": "monad-testnet",
    "Ink Sepolia": "ink-sepolia",
    "Somnia Testnet": "somnia-testnet",
    "MegaETH Testnet": "megaeth-testnet",
    "Arc Testnet": "arc-testnet",
}

// Gateway hosts, per chain. This map is authoritative for any recognized network — see
// lib/realtime/ws-url.ts, where the NEXT_PUBLIC_*_URL env vars are deliberately only an
// escape hatch for networks NOT in this map. Change a host by changing it here.
//
// ONLY RISE is mapped, which matches SUPPORTED_CHAINS. Monad, Somnia and MegaETH had
// entries pointing at `*-v5` hosts on the predecessor Railway project, and those were DEAD
// in the worst way: they still resolved to a Railway IP, but no service claimed the custom
// domain, so the edge answered with its default `*.up.railway.app` certificate. The
// hostname did not match, so TLS failed and the browser refused the request before any
// HTTP status existed to log — nothing reported a 502, the app just never got data.
//
// They are removed rather than repointed. None of those chains is supported, and Monad
// cannot be: per packages/deployments/deployments.json its matching engine has no code on
// chain at all, so a working gateway would not make it tradeable. An unmapped network
// falls through to the NEXT_PUBLIC_* escape hatch in lib/realtime/ws-url.ts, which is what
// a dev bringing a new chain up wants anyway.
//
// RISE points at the stack in the `iter` project's `rise` environment, rebuilt from
// scratch on 2026-08-08 (split chain/broker databases + sync-head). Verified:
// `access-control-allow-origin: *` on both preflight and GET, so browser calls work from
// any app origin.
//
// The host CHANGED with that rebuild — it was `gateway-api-rise-791d` before. Railway
// appends a random suffix only when the plain `<service>-<env>` name is already taken, so
// erasing the environment freed the short name and the new domain has no suffix. Nothing
// derives this at build time, so a rebuilt environment always needs this line edited by
// hand; the old host does not 404, it stops resolving entirely.
// ARC is mapped but NOT yet in SUPPORTED_CHAINS, which is deliberate and not an
// oversight. `supportedNetworkName` (lib/routing/chainParams.ts) resolves a slug only
// when the name is in `supportedChains`, so these two entries are inert until Arc is
// added there -- which is the correct order: a gateway host that answers is a
// PREREQUISITE for serving a chain, not the same claim. Adding the name to
// SUPPORTED_CHAINS while these were missing is the Monad failure described above; adding
// these first cannot fail that way, because nothing reads them yet.
export const PonderLinks: Enums = {
    "RISE Testnet": "https://gateway-api-rise.up.railway.app",
    "Arc Testnet": "https://gateway-api-arc.up.railway.app",
}

// These values are passed to `new WebSocket(...)` verbatim — no path is appended at the
// call site (MarketPageProvider, OrderPageProvider, TradePageProvider all do
// `new WebSocket(PonderWssLinks[name])`). So the PATH BELONGS HERE.
//
// The legacy `*-websocket-v5` hosts served the upgrade at the root, which is why these
// entries had none. apps/gateway serves it at `/ws` (see src/ws/server.ts), so RISE needs
// the suffix; omitting it fails silently, with the socket simply never opening.
//
// The websocket host is also a SEPARATE service from the REST one, and on RISE the WS
// listener binds the port its generated domain targets — see scripts/railway-setup.sh,
// where gateway-ws deliberately runs WS on 8080 and REST on 8081 for that reason.
export const PonderWssLinks: Enums = {
    "RISE Testnet": "wss://gateway-ws-rise.up.railway.app/ws",
    // Same `/ws` path and same port inversion as RISE -- gateway-ws runs the websocket
    // listener on 8080 and REST on 8081 in the arc environment too (verified in its
    // Railway variables), so the generated domain reaches the listener.
    "Arc Testnet": "wss://gateway-ws-arc.up.railway.app/ws",
}

// Futures gateways are separate services from the spot ones. DELIBERATELY EMPTY: futures
// is not deployed on any chain, and every entry here used to be a `*-v5.standardweb3.com`
// placeholder that never served anything. An empty map sends getFutures* to the
// NEXT_PUBLIC_FUTURES_* escape hatch, so pointing a local build at a futures gateway is
// one env var — and nothing claims a host that does not exist. Add a real host here when
// futures deploys, keyed identically to PonderLinks.
export const PonderFuturesLinks: Enums = {}
export const PonderFuturesWssLinks: Enums = {}

// Which chains the app actively serves — the switcher, preconnect, search fan-out and the
// ticker tape all iterate this.
//
// The list itself now lives in @iter/deployments (SUPPORTED_CHAINS), because it is a
// property of the deployment rather than of this frontend: the admin surfaces need the
// same answer, and a second copy is how a chain ends up served in one place and missing in
// another. Re-exported here so the existing `@/consts` import sites keep working.
//
// It remains an explicit allowlist, NOT `Object.keys(chainIds)` and not everything in the
// registry: chainIds/customChains define more networks than are served, and being in the
// registry only means the addresses are verified — Somnia and Ink Sepolia have a verified
// engine and no gateway, so either source would render dead switcher entries.
export { SUPPORTED_CHAINS as supportedChains } from "@iter/deployments";
// The cross-chain read layer (apps/aggregator), deployed once in the `platform`
// environment beside identity-service — NOT once per chain, which is the whole
// point of it.
//
// Deliberately a single string rather than an `Enums` map keyed by network: a
// per-chain entry would say the opposite of what this service is. It fans out to
// every gateway in `PonderLinks` itself and merges, so asking it a question
// "for a chain" is a category error.
//
// Reads that are RANKED belong here. Page 1 of each chain is not page 1 of the
// union, so a correct global ranking needs over-fetching and re-ranking — logic
// that must exist in exactly one place. Lists a caller merely concatenates can
// stay on the per-chain gateways.
//
// The env var is an escape hatch for local work (point it at a dev aggregator,
// or at a tunnel), matching how lib/realtime/ws-url.ts treats its own.
export const AggregatorLink: string =
  process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? "https://aggregator-platform.up.railway.app";
