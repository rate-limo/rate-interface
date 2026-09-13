/**
 * The rule this file exists to hold: **once any chain has its own admin-service
 * configured, an unconfigured one is REFUSED, never served from a neighbour.**
 *
 * That is the whole safety property. The bug being fixed was one chain's
 * database answering for another with a 200 at every hop, and a silent fallback
 * would reproduce it exactly — the caller would see a plausible answer about the
 * wrong chain and nothing anywhere would say so. Every other case here is easy
 * to notice; this one is not, so it is the one that gets pinned.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chainIdForSlug, missingUpstreams, resolveAdminUpstream } from "./upstreams";

const RISE = "https://admin-service-rise.example";
const ARC = "https://admin-service-arc.example";

/** Real ids, from `@iter/deployments` via the slug maps. */
const RISE_ID = 11155931;
const ARC_ID = 5042002;

const KEYS = ["ADMIN_SERVICE_URL", `ADMIN_SERVICE_URL_${RISE_ID}`, `ADMIN_SERVICE_URL_${ARC_ID}`];

function setEnv(vars: Record<string, string | undefined>): void {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

afterEach(() => setEnv({}));

describe("chainIdForSlug", () => {
  it("resolves a supported slug through the registry", () => {
    expect(chainIdForSlug("rise-testnet")).toBe(RISE_ID);
    expect(chainIdForSlug("arc-testnet")).toBe(ARC_ID);
  });

  it("is case- and whitespace-tolerant, because it comes off a URL", () => {
    expect(chainIdForSlug(" RISE-Testnet ")).toBe(RISE_ID);
  });

  it("returns null for an unknown slug rather than guessing", () => {
    expect(chainIdForSlug("not-a-chain")).toBeNull();
    expect(chainIdForSlug("")).toBeNull();
    expect(chainIdForSlug(null)).toBeNull();
  });
});

describe("resolveAdminUpstream", () => {
  it("serves the unsuffixed variable when NO chain is configured", () => {
    // A single-chain deployment, and local development. The one origin is the
    // right answer for every chain because there is only one.
    setEnv({ ADMIN_SERVICE_URL: RISE });
    const out = resolveAdminUpstream("arc-testnet");
    expect(out).toEqual({ ok: true, upstream: { chainId: null, url: RISE } });
  });

  it("does not require a slug in that single-chain case", () => {
    setEnv({ ADMIN_SERVICE_URL: RISE });
    expect(resolveAdminUpstream(null)).toMatchObject({ ok: true });
  });

  it("503s when nothing at all is configured", () => {
    setEnv({});
    const out = resolveAdminUpstream("rise-testnet");
    expect(out).toMatchObject({ ok: false, status: 503 });
  });

  it("routes each slug to its OWN chain's service", () => {
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE, [`ADMIN_SERVICE_URL_${ARC_ID}`]: ARC });
    expect(resolveAdminUpstream("rise-testnet")).toEqual({
      ok: true,
      upstream: { chainId: RISE_ID, url: RISE },
    });
    expect(resolveAdminUpstream("arc-testnet")).toEqual({
      ok: true,
      upstream: { chainId: ARC_ID, url: ARC },
    });
  });

  it("REFUSES a configured-elsewhere chain rather than serving a neighbour", () => {
    // The property the whole module exists for. Somnia has no service here, and
    // answering from RISE's would be the original bug wearing a new shape:
    // a confident answer about a database that knows nothing of this chain.
    setEnv({
      ADMIN_SERVICE_URL: RISE,
      [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE,
      [`ADMIN_SERVICE_URL_${ARC_ID}`]: ARC,
    });
    const out = resolveAdminUpstream("somnia-testnet");
    expect(out).toMatchObject({ ok: false, status: 503 });
    // Even with the unsuffixed variable set. Its presence must not become a
    // silent catch-all the moment a second chain is configured.
    expect(out.ok === false && out.error).toMatch(/50312/);
  });

  it("refuses a missing slug once several chains are served", () => {
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE, [`ADMIN_SERVICE_URL_${ARC_ID}`]: ARC });
    // There is no honest default here, so a caller that forgot the parameter is
    // told rather than answered.
    expect(resolveAdminUpstream(null)).toMatchObject({ ok: false, status: 400 });
    expect(resolveAdminUpstream("")).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an unknown slug with a 400, not a 503", () => {
    // A typo in a link and a chain nobody deployed a service for are different
    // problems, and the status is what tells them apart.
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE });
    expect(resolveAdminUpstream("not-a-chain")).toMatchObject({ ok: false, status: 400 });
  });

  it("ignores a non-numeric suffix rather than inventing a chain", () => {
    setEnv({ ADMIN_SERVICE_URL: RISE });
    process.env.ADMIN_SERVICE_URL_STAGING = ARC;
    try {
      // Only the unsuffixed one is configured, so this is still the single-chain
      // branch — a differently-named variable that happens to share the prefix
      // must not register as a chain and flip the whole module into refusing.
      expect(resolveAdminUpstream("arc-testnet")).toEqual({
        ok: true,
        upstream: { chainId: null, url: RISE },
      });
    } finally {
      delete process.env.ADMIN_SERVICE_URL_STAGING;
    }
  });

  it("strips a trailing slash so paths are not doubled", () => {
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: `${RISE}/` });
    expect(resolveAdminUpstream("rise-testnet")).toMatchObject({
      ok: true,
      upstream: { url: RISE },
    });
  });
});

describe("missingUpstreams", () => {
  it("reports BOTH served chains when nothing is configured", () => {
    // The state the admin panel actually lived in: two served chains, zero
    // suffixed variables, one silent fallback. A rule that only flagged PARTIAL
    // configuration would have said nothing through the entire outage, so this
    // case is the one that matters most.
    setEnv({ ADMIN_SERVICE_URL: RISE });
    expect(missingUpstreams().map((m) => m.chainId).sort()).toEqual([ARC_ID, RISE_ID].sort());
  });

  it("names the variable to set, not just the chain", () => {
    setEnv({});
    const arc = missingUpstreams().find((m) => m.chainId === ARC_ID);
    expect(arc?.variable).toBe(`ADMIN_SERVICE_URL_${ARC_ID}`);
    expect(arc?.label).toBe("Arc Testnet");
  });

  it("reports the half that is missing when one is configured", () => {
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE });
    expect(missingUpstreams().map((m) => m.chainId)).toEqual([ARC_ID]);
  });

  it("is empty once every served chain has its own", () => {
    setEnv({ [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE, [`ADMIN_SERVICE_URL_${ARC_ID}`]: ARC });
    expect(missingUpstreams()).toEqual([]);
  });

  it("ignores a configured chain that is not served", () => {
    // Somnia has a service here but is out of SUPPORTED_CHAINS. Extra reach is
    // not a gap, and reporting it would train an operator to ignore the list.
    setEnv({
      [`ADMIN_SERVICE_URL_${RISE_ID}`]: RISE,
      [`ADMIN_SERVICE_URL_${ARC_ID}`]: ARC,
    });
    process.env.ADMIN_SERVICE_URL_50312 = "https://somnia.example";
    try {
      expect(missingUpstreams()).toEqual([]);
    } finally {
      delete process.env.ADMIN_SERVICE_URL_50312;
    }
  });
});
