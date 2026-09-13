import { defineConfig } from "@playwright/test";

/**
 * On-demand deploy verification. NOT a CI suite and deliberately not wired into
 * `pnpm test`, which runs 798 pure tests in ~2s.
 *
 * retries: 0 is load-bearing. Playwright's retry re-runs the test BODY, and these
 * tests broadcast real transactions — a "flaky" limit test would rest two orders and
 * a retried launch would mint a second coin. Flakiness gets diagnosed, not retried.
 *
 * workers: 1 for the same class of reason: the specs share funded accounts, and
 * parallel workers race the nonce. Nonce races surface as unrelated-looking
 * transaction failures, which is the worst kind of flake to chase.
 */
/**
 * Whether the suite is pointed at something already running elsewhere.
 *
 * Anything that is not a loopback host: a Vercel preview, production, or a
 * tunnel. `localhost` and `127.0.0.1` are the only targets this repo can start
 * itself.
 */
const REMOTE_TARGET =
  Boolean(process.env.E2E_BASE_URL) &&
  !/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(process.env.E2E_BASE_URL ?? "");

export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  /**
   * Started only for a LOCAL target.
   *
   * A remote `E2E_BASE_URL` — a preview, or production — is already serving, and
   * spawning `pnpm dev` beside it is not merely redundant: the dev server reads
   * `broker.landingContent` from Postgres on every request under `app/[locale]`,
   * so on a machine without a reachable database it never answers and this block
   * times out after 180s having never seen a response. The suite then fails for a
   * reason that has nothing to do with the deployment under test.
   *
   * That is not hypothetical — it is what happened the first time these specs
   * were pointed at production.
   */
  webServer: REMOTE_TARGET
    ? undefined
    : {
    command: "pnpm dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // NOT reused. scripts/check-swap-groups.mjs records Turbopack serving stale
    // prerendered responses for minutes after a source change; a false pass here is
    // worse than a slow start.
    reuseExistingServer: false,
    timeout: 180_000,
    // Every page under app/[locale] reads broker.landingContent from Postgres on
    // each request (see the site-rows section of apps/web/CLAUDE.md). With no
    // DATABASE_URL the pg client RETRIES rather than failing fast, so the request
    // hangs and this webServer block times out after 180s having never seen a
    // response — the server logs "Ready" and still answers nothing.
    env: {
      ...process.env,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    },
  },
});
