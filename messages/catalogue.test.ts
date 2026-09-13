import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { routing } from "../i18n/routing";
import en from "./en.json";

/**
 * Catalogue health.
 *
 * TypeScript already catches a mistyped key at a `t("…")` call site, because
 * `en.json` is declared as the Messages type. What it cannot catch is the two
 * failures that only show up later:
 *
 *  - a key defined here and used nowhere, which is copy a translator will be
 *    paid to translate and nobody will ever read;
 *  - a locale file that has drifted from `en.json`, which renders as the raw key
 *    path in the UI for the locale nobody on the team reads.
 *
 * Both are silent, so they get a test.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "hooks", "contexts"];

/** Every leaf key path in a nested message object: "shell.nav.explore". */
function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const full = join(abs, e);
    if (statSync(full).isDirectory()) return sourceFiles(join(dir, e));
    return /\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) ? [full] : [];
  });
}

const SOURCES = SCAN_DIRS.flatMap(sourceFiles).map((f) => readFileSync(f, "utf8"));
const HAYSTACK = SOURCES.join("\n");

describe("message catalogue", () => {
  it("has at least one key (the scan is not vacuously passing)", () => {
    expect(leafKeys(en).length).toBeGreaterThan(0);
  });

  it("defines no key that nothing uses", () => {
    // A namespace is bound with useTranslations("shell.nav") and then called as
    // t("explore"), so a key is "used" if its namespace is bound AND its leaf
    // appears. Checking the leaf alone would pass on any common word; checking
    // the full dotted path would fail on every namespaced call.
    const unused = leafKeys(en).filter((path) => {
      const parts = path.split(".");
      const leaf = parts[parts.length - 1]!;
      const namespace = parts.slice(0, -1).join(".");
      const namespaceBound =
        !namespace || HAYSTACK.includes(`useTranslations("${namespace}")`);
      const leafUsed =
        HAYSTACK.includes(`"${leaf}"`) ||
        HAYSTACK.includes(`'${leaf}'`) ||
        HAYSTACK.includes(`t("${path}")`) ||
        // t(l.kind) — the nav resolves its key from the PageKind at runtime, so
        // the literal never appears in source.
        HAYSTACK.includes("t(l.kind)") ||
        HAYSTACK.includes("t(tab.kind)");
      return !(namespaceBound && leafUsed);
    });
    expect(unused, `unused message keys: ${unused.join(", ")}`).toEqual([]);
  });

  it("keeps every locale file in step with en.json", async () => {
    const expected = leafKeys(en).sort();
    for (const locale of routing.locales) {
      if (locale === "en") continue;
      const other = (await import(`./${locale}.json`)).default;
      const actual = leafKeys(other).sort();
      expect(actual, `${locale}.json key set differs from en.json`).toEqual(expected);
    }
  });

  it("uses no ICU plural/select syntax that a translator could silently break", () => {
    // Not a ban on ICU — a note that the moment one appears, this catalogue
    // needs plural-category coverage per locale (ko has one, en has two), and
    // that is a decision to make on purpose rather than discover in production.
    const values = leafKeys(en).map((path) =>
      path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en),
    );
    const withIcu = values.filter(
      (v) => typeof v === "string" && /\{[^}]+,\s*(plural|select|selectordinal)/.test(v),
    );
    expect(withIcu).toEqual([]);
  });
});
