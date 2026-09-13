import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  /**
   * Nothing generated, nothing vendored.
   *
   * Flat config ignores only `**​/node_modules/` and `.git/` by default, and this file
   * declared no others — so `eslint .` linted `.next/`, i.e. Turbopack's bundled output
   * with every dependency inlined. That is 893 errors and 948 warnings of other people's
   * minified code, and `pnpm lint` failed on it for anyone who had ever run `next dev`
   * or `next build`. Excluding these leaves 0 errors and 3 warnings, all real.
   *
   * `public/tradingview/` is the vendored TradingView datafeed. Its files carry
   * eslint-disable comments naming rules this config does not load, which report as
   * "Definition for rule ... was not found" — errors about a config mismatch in code we
   * do not own and would not change.
   */
  {
    ignores: [
      ".next/**",
      "out/**",
      "next-env.d.ts",
      "public/tradingview/**",
    ],
  },
  // ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
