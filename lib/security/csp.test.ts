import { describe, expect, it } from "vitest";
import {
  appCsp,
  CSP_REPORT_PATH,
  ENFORCED_DIRECTIVES,
  ENFORCED_META_CSP,
  FRAME_ANCESTORS_HEADER,
  newNonce,
  walletFrameCsp,
} from "./csp";

/**
 * The policy is a string the browser parses; a typo is a directive that
 * silently does nothing. These pin the shape, not the browser's behaviour.
 */

const NONCE = "dGVzdA==";

describe("appCsp", () => {
  const csp = appCsp({
    nonce: NONCE,
    dev: false,
    walletOrigin: "https://wallet.iter.cx",
    connectOrigins: ["https://gateway-api-rise.up.railway.app", "wss://gateway-ws-rise.up.railway.app", ""],
  });

  it("enforces only what nothing on the page can trip, and never under the CSP header name", () => {
    expect(csp.enforced).toBe("frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    for (const directive of ENFORCED_DIRECTIVES) expect(csp.reportOnly).toContain(directive);
    // The meta carrier holds exactly what meta supports; frame-ancestors is
    // ignored in meta by spec and rides X-Frame-Options instead.
    expect(ENFORCED_META_CSP).toBe("object-src 'none'; base-uri 'self'");
    expect(ENFORCED_META_CSP).not.toContain("frame-ancestors");
    expect(FRAME_ANCESTORS_HEADER).toEqual({ key: "X-Frame-Options", value: "SAMEORIGIN" });
  });

  it("carries the nonce and strict-dynamic in script-src", () => {
    expect(csp.reportOnly).toMatch(/script-src 'self' 'nonce-dGVzdA==' 'strict-dynamic' https:\/\/va\.vercel-scripts\.com;/);
    expect(csp.reportOnly).not.toContain("unsafe-eval");
  });

  it("allows the wallet frame to be embedded, and nothing else cross-origin", () => {
    expect(csp.reportOnly).toContain("frame-src 'self' https://wallet.iter.cx;");
  });

  it("lists the connect origins once, drops empties, and adds the analytics beacons", () => {
    const connect = csp.reportOnly.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).toBe(
      "connect-src 'self' https://gateway-api-rise.up.railway.app wss://gateway-ws-rise.up.railway.app https://va.vercel-scripts.com https://vitals.vercel-insights.com",
    );
  });

  it("reports to the endpoint by both mechanisms", () => {
    expect(csp.reportOnly).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(csp.reportOnly).toContain("report-to csp");
    expect(csp.reportingEndpoints).toBe(`csp="${CSP_REPORT_PATH}"`);
  });

  it("relaxes for development only", () => {
    const dev = appCsp({ nonce: NONCE, dev: true, walletOrigin: "http://localhost:3000", connectOrigins: [] });
    expect(dev.reportOnly).toContain("'unsafe-eval'");
    expect(dev.reportOnly).toMatch(/connect-src [^;]* ws: wss:/);
  });
});

describe("walletFrameCsp", () => {
  it("embeds only from the app origins and connects only to the RPCs", () => {
    const csp = walletFrameCsp({
      nonce: NONCE,
      dev: false,
      appOrigins: ["https://www.iter.cx", "https://iter.cx", "https://www.iter.cx"],
      rpcOrigins: ["https://testnet.riselabs.xyz", "https://rpc.testnet.arc.network"],
    });
    expect(csp).toContain("frame-ancestors https://www.iter.cx https://iter.cx;");
    expect(csp).toContain("connect-src 'self' https://testnet.riselabs.xyz https://rpc.testnet.arc.network;");
    expect(csp.startsWith("default-src 'none'; ")).toBe(true);
    expect(csp).toContain(`'nonce-${NONCE}'`);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("falls back to 'self' with no app origins rather than an empty directive", () => {
    expect(walletFrameCsp({ nonce: NONCE, dev: false, appOrigins: [], rpcOrigins: [] })).toContain("frame-ancestors 'self'");
  });
});

describe("newNonce", () => {
  it("is base64 of 16 bytes and differs per call", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});
