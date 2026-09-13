import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * There was no vitest config at all until component tests arrived — the suite was
 * pure logic, ran in the default `node` environment, and never resolved a `@/`
 * import. Two things it needs now:
 *
 *   * the `@/` alias, because a component pulls half the app in through it;
 *   * a DOM, which is opted into PER FILE with `// @vitest-environment jsdom`
 *     rather than set here. The 801 existing tests are pure and are meaningfully
 *     faster without one, and a component test that forgets the docblock should
 *     fail loudly on `document is not defined` rather than quietly pass in a DOM
 *     it did not ask for.
 *
 * JSX needs no plugin: tsconfig sets `jsx: react-jsx`, and esbuild honours it.
 */
export default defineConfig({
  resolve: {
    alias: {
      // `@lib` BEFORE `@`, because vite matches these in order and `@` would
      // otherwise swallow `@lib/utils` into `./lib/utils` -> `.//lib/utils`.
      //
      // Both are real: tsconfig defines `@lib/*` alongside `@/*`, and five files
      // — including the shadcn `components/ui/*` set — use the short form. Until
      // a test imported one of those, vitest never had to resolve it.
      "@lib": fileURLToPath(new URL("./lib", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Playwright specs live in e2e/ and call Playwright's `test()`, which throws
    // when vitest collects it. Vitest's default glob would otherwise pick them up
    // and turn the fast unit suite red. The e2e suite runs via `pnpm test:e2e`
    // and is deliberately never part of `pnpm test`.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", "packages/**"],
  },
});
