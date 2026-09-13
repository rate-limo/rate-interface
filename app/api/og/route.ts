import { readFile } from "node:fs/promises";
import path from "node:path";

import { VARIANT_FILES, variantForTime } from "./variant";

/**
 * Serves the Iter share card, picking the light or dark painting by
 * time of day.
 *
 * Link-preview crawlers send no `prefers-color-scheme`, so a share image
 * physically cannot follow the viewer's theme -- one URL, one set of
 * bytes per scrape. What it *can* do is mirror the site's own time-of-day
 * default (see the pre-paint script in app/layout.tsx: light 07:00-19:00,
 * dark otherwise), so a link scraped during the day unfurls to the sunrise
 * card and one scraped at night unfurls to the nocturne.
 *
 * Caveat worth knowing: Slack, X and Facebook cache the first scrape of a
 * URL, often for days. In practice a given link tends to keep whichever
 * variant it was first scraped with -- the variation shows up across links
 * and re-scrapes, not on any single one.
 *
 * Both cards are built by scripts/og/generate-og.py. The files they write
 * are named explicitly in next.config.ts under `outputFileTracingIncludes`
 * so they get bundled with this function; a path built at runtime is
 * invisible to the tracer and would 500 in production while working fine
 * in dev.
 */

// Always re-evaluate the clock; a statically rendered route would freeze
// whichever variant was current at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const variant = variantForTime();
  const file = path.join(
    process.cwd(),
    "public",
    "images",
    VARIANT_FILES[variant],
  );

  const body = await readFile(file);

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.byteLength),
      // Short shared cache so the variant can actually turn over at dawn
      // and dusk instead of being pinned by the CDN for a day.
      "Cache-Control": "public, max-age=0, s-maxage=1800, must-revalidate",
      // Lets a crawler that does conditional requests skip the body when
      // the variant hasn't changed.
      ETag: `"og-${variant}"`,
    },
  });
}
