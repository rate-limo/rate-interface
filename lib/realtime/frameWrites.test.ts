import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guard that keeps "never older than live" true as the app grows.
 *
 * A live frame written to the react-query cache with a bare `setQueryData`
 * can be overwritten a moment later by a fetch that was already in flight
 * when the frame arrived, and that fetch read the database BEFORE the frame's
 * transaction. `applyFrame` closes that race (cancel in flight → write →
 * refetch); the watermark check in `gatewayFetch` cannot, because the stale
 * answer is not refused, it simply lands after.
 *
 * Nothing about a bare `setQueryData` in a socket handler looks wrong, and
 * nothing fails when one is added. So every `setQueryData` in the app must
 * either BE `applyFrame`, or say on the line above why it is not a frame —
 * `// not-a-frame: <reason>` (a query's own fetch, a user's own edit). The
 * annotation is cheap to write and impossible to write by accident.
 */
const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "components", "contexts", "hooks", "lib", "mutations", "queries", "utils"];
const ALLOWED = new Set(["lib/realtime/applyFrame.ts"]);
const WRITE = /\.(setQueryData|setQueriesData)\s*[<(]/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
  }
}

export function unannotatedWrites(files: Iterable<[string, string]>): string[] {
  const out: string[] = [];
  for (const [file, text] of files) {
    if (ALLOWED.has(file)) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!WRITE.test(line) || /^\s*(\*|\/\/)/.test(line)) return;
      const context = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
      if (!context.includes("not-a-frame:")) out.push(`${file}:${i + 1}`);
    });
  }
  return out;
}

describe("live frames reach the cache only through applyFrame", () => {
  it("every setQueryData is applyFrame or says why it is not a frame", () => {
    const files: [string, string][] = [];
    for (const dir of DIRS) {
      for (const path of sources(join(ROOT, dir))) files.push([relative(ROOT, path), readFileSync(path, "utf8")]);
    }
    expect(files.length).toBeGreaterThan(100);
    expect(unannotatedWrites(files)).toEqual([]);
  });

  it("the scan actually catches a bare write in a socket handler", () => {
    const handler = "socket.on('x', (f) => {\n  queryClient.setQueryData(key, f);\n});";
    expect(unannotatedWrites([["hooks/useX.tsx", handler]])).toEqual(["hooks/useX.tsx:2"]);
    const annotated = "// not-a-frame: the query's own fetch\nqueryClient.setQueryData(key, v);";
    expect(unannotatedWrites([["hooks/useY.tsx", annotated]])).toEqual([]);
  });
});
