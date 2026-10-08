import { describe, expect, it } from "vitest";
import { isActionable, parseCspReports } from "./cspReport";

describe("parseCspReports", () => {
  it("reads the report-uri shape", () => {
    const out = parseCspReports({
      "csp-report": {
        "document-uri": "https://www.rate.limo/trade",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js",
        "source-file": "https://www.rate.limo/_next/static/chunks/app.js",
        "line-number": 42,
        disposition: "report",
      },
    });
    expect(out).toEqual([
      {
        documentUrl: "https://www.rate.limo/trade",
        directive: "script-src-elem",
        blocked: "https://evil.example/x.js",
        source: "https://www.rate.limo/_next/static/chunks/app.js:42",
        sample: null,
        disposition: "report",
      },
    ]);
  });

  it("reads the Reporting API shape, several at once, and ignores other report types", () => {
    const out = parseCspReports([
      { type: "csp-violation", body: { documentURL: "https://www.rate.limo/", effectiveDirective: "img-src", blockedURL: "http://x/y.png", disposition: "enforce" } },
      { type: "deprecation", body: {} },
      { type: "csp-violation", body: { documentURL: "https://www.rate.limo/", effectiveDirective: "style-src-attr", blockedURL: "inline", sample: "color: red" } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].disposition).toBe("enforce");
    expect(out[1]).toMatchObject({ directive: "style-src-attr", blocked: "inline", sample: "color: red", disposition: "report" });
  });

  it("caps every field", () => {
    const long = "x".repeat(5000);
    const [v] = parseCspReports({ "csp-report": { "document-uri": long, "blocked-uri": long, "script-sample": long } });
    expect(v.documentUrl.length).toBe(512);
    expect(v.blocked.length).toBe(512);
    expect(v.sample?.length).toBe(120);
  });

  it("yields nothing for garbage", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports("csp-report")).toEqual([]);
    expect(parseCspReports({ "csp-report": "nope" })).toEqual([]);
    expect(parseCspReports([{ type: "csp-violation" }])).toEqual([]);
  });
});

describe("isActionable", () => {
  const base = { documentUrl: "", directive: "script-src-elem", blocked: "", source: null, sample: null, disposition: "report" as const };
  it("drops extension noise by blocked URL or source", () => {
    expect(isActionable({ ...base, blocked: "chrome-extension://abc/inject.js" })).toBe(false);
    expect(isActionable({ ...base, blocked: "inline", source: "moz-extension://abc/x.js" })).toBe(false);
  });
  it("keeps everything else", () => {
    expect(isActionable({ ...base, blocked: "https://cdn.example/x.js" })).toBe(true);
    expect(isActionable({ ...base, blocked: "inline" })).toBe(true);
  });
});
