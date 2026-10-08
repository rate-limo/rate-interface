/**
 * Reading a CSP violation report, in either of the two formats browsers send.
 *
 *  - `report-uri` (the old one, still what most browsers post): one object
 *    under a `csp-report` key, with hyphenated fields.
 *  - `report-to` / Reporting API: an ARRAY of reports, each with a `type` of
 *    `csp-violation` and a `body` with camelCased fields.
 *
 * Both are reduced to one flat shape so the log line is the same whichever
 * arrived. Pure, so the parse has tests; the route handler only logs.
 *
 * Everything in a report is data the browser copied from a page and is
 * capped on the way in: a report is not a place to trust lengths from.
 */

export interface CspViolation {
  documentUrl: string;
  /** The directive that was violated, e.g. `script-src-elem`. */
  directive: string;
  /** What was blocked: a URL, or `inline` / `eval`. */
  blocked: string;
  /** Where the offending resource was referenced from, when the browser says. */
  source: string | null;
  /** A snippet of the inline script or style, when the browser includes one. */
  sample: string | null;
  disposition: "enforce" | "report";
}

const MAX = 512;

function str(value: unknown, max = MAX): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

function fromLegacy(report: Record<string, unknown>): CspViolation {
  const line = typeof report["line-number"] === "number" ? `:${report["line-number"]}` : "";
  return {
    documentUrl: str(report["document-uri"]) ?? "",
    directive: str(report["effective-directive"]) ?? str(report["violated-directive"]) ?? "",
    blocked: str(report["blocked-uri"]) ?? "",
    source: str(report["source-file"]) ? `${str(report["source-file"])}${line}` : null,
    sample: str(report["script-sample"], 120),
    disposition: report.disposition === "enforce" ? "enforce" : "report",
  };
}

function fromReportingApi(body: Record<string, unknown>): CspViolation {
  const line = typeof body.lineNumber === "number" ? `:${body.lineNumber}` : "";
  return {
    documentUrl: str(body.documentURL) ?? "",
    directive: str(body.effectiveDirective) ?? "",
    blocked: str(body.blockedURL) ?? "",
    source: str(body.sourceFile) ? `${str(body.sourceFile)}${line}` : null,
    sample: str(body.sample, 120),
    disposition: body.disposition === "enforce" ? "enforce" : "report",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every violation in a posted body, in either format. Unknown shapes yield none. */
export function parseCspReports(payload: unknown): CspViolation[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((r): r is Record<string, unknown> => isRecord(r) && r.type === "csp-violation" && isRecord(r.body))
      .map((r) => fromReportingApi(r.body as Record<string, unknown>));
  }
  if (isRecord(payload) && isRecord(payload["csp-report"])) {
    return [fromLegacy(payload["csp-report"])];
  }
  return [];
}

/**
 * Is this violation worth a log line?
 *
 * Browser extensions inject scripts and styles into every page, and each one
 * is a violation of a policy that has nothing to do with this site. They
 * arrive as `blocked-uri` of an extension scheme, or as an inline sample from
 * code nobody here shipped. Dropping them is what keeps the log about the
 * app; the policy is not going to be loosened for someone's ad blocker.
 */
export function isActionable(v: CspViolation): boolean {
  if (/^(chrome|moz|safari|ms-browser)-extension:/i.test(v.blocked)) return false;
  if (v.source && /^(chrome|moz|safari|ms-browser)-extension:/i.test(v.source)) return false;
  return true;
}
