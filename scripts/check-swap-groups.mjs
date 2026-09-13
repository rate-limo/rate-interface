/**
 * Checks that the swap card's three section groups are still contiguous and in
 * order in the rendered HTML.
 *
 * This exists because the desktop layout is a CSS Grid that places group A and
 * C in the left column and B in the right. If a new section is added BETWEEN
 * two groups rather than inside one, the grid silently puts it in the wrong
 * place — nothing throws, nothing fails to build, and the page just quietly
 * reads wrong.
 *
 * apps/web has no component test framework (no .test.tsx anywhere, vitest runs
 * environment: "node"), so this is a script against a running dev server
 * rather than a unit test. Run it after touching SwapCard, naming the port
 * your dev server actually printed (`pnpm dev` often lands on 3001, 3002, ...
 * when 3000 is taken):
 *
 *   pnpm check:swap-groups http://localhost:3002/trade
 *
 * The default below (:3000) is ONLY correct if you are certain what's
 * serving that port on this machine right now — an unrelated process there
 * (a stale instance of this same app, Docker, anything) will still return
 * plausible HTML and produce a confident, wrong pass/fail. When in doubt,
 * pass the URL explicitly.
 *
 * IMPORTANT — restart the dev server (or `rm -rf .next`) before trusting a
 * result. Turbopack has been observed serving a stale prerendered response
 * (x-nextjs-cache: HIT) for a few seconds to minutes after SwapCard.tsx
 * changes, which would read as a false pass on genuinely broken markup. This
 * script appends a cache-busting query param to make that less likely, but it
 * is not a substitute for a fresh server when the result actually matters.
 *
 * HOW IT WORKS — a generic element-depth walk, not a full HTML parser:
 *
 * `data-swap-grid=""` marks the grid wrapper in SwapCard.tsx. From there this
 * walks forward matching ANY tag by name (not just div), tracking element
 * depth, to find the wrapper's DIRECT element children — whatever tag they
 * are. That closes the primary threat model: a brand-new section spliced
 * between two group wrappers becomes a 4th direct child with no
 * `data-swap-group` attribute, regardless of what tag it's built from, and
 * this fails on it by name. (An earlier version of this check only tracked
 * `<div>` depth, which would have missed a `<section>` interloper — same
 * blind spot as the landmark-only version before it, just narrower.) Each of
 * the three children found this way is then required to carry
 * `data-swap-group="a" | "b" | "c"` in that order, and each of the three
 * landmark strings is required to sit inside ITS OWN group's element span
 * (not merely somewhere after the previous landmark) — that catches a
 * landmark migrating into an adjacent group even when overall left-to-right
 * order across the three landmarks is preserved.
 *
 * Void elements (img, br, input, hr, meta, link, source, and the rest of the
 * HTML5 list) never get a closing tag and would corrupt the depth count if
 * treated like any other open tag, so they're excluded from depth tracking.
 * Any tag written self-closed (`<foo />`) is treated the same way, whatever
 * its name — covers inline SVG (`<path d="…" />` etc.) without hardcoding
 * SVG tag names. `<!-- … -->` comments are skipped whole, never scanned for
 * tags inside them.
 *
 * Deliberately still not a full parser: attribute values are matched as
 * quoted strings or plain characters, so a literal ">" INSIDE a quoted
 * attribute (e.g. a Tailwind arbitrary variant like `[&>svg]`) is handled,
 * but an unquoted attribute value containing ">" is not — React/Next always
 * quotes attribute values in its SSR output, so that's not a real gap against
 * this app's markup.
 */

const rawUrl = process.argv[2] ?? "http://localhost:3000/trade";
const url = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}_swapCheck=${Date.now()}`;

let res;
try {
  res = await fetch(url);
} catch {
  console.error(`✗ could not reach ${url} — is the dev server running on that port?`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`✗ ${url} returned ${res.status}`);
  process.exit(1);
}

const html = await res.text();

const gridMarker = html.indexOf('data-swap-grid=""');
if (gridMarker === -1) {
  console.error("✗ could not find the swap grid wrapper (data-swap-grid marker missing)");
  console.error("  Was the wrapper div in SwapCard.tsx renamed or removed?");
  process.exit(1);
}

// The wrapper's own opening tag ends at the next ">" — safe here because its
// className carries no literal ">".
const wrapperOpenEnd = html.indexOf(">", gridMarker) + 1;

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// Matches, in order of first applicability: an HTML comment (consumed whole
// and ignored below); a closing tag `</name>`; or an opening tag `<name ...>`
// or `<name ... />`, whose attribute portion is quoted strings or any
// character but a bare quote/">" — so a `>` inside a quoted attribute value
// doesn't end the tag early.
const TAG_RE = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/)?>/g;
TAG_RE.lastIndex = wrapperOpenEnd;

// depth === 1 means "inside the wrapper, not inside any child yet". A
// non-void opening tag at depth 1 starts a pending direct child; depth
// returns to 1 on its matching close, which finalizes it. A void or
// self-closed tag at depth 1 is recorded as a direct child immediately —
// it never nests, so there's nothing to wait for.
let depth = 1;
let pending = null;
let wrapperEnd = -1;
const children = [];
let m;
while ((m = TAG_RE.exec(html))) {
  if (m[0].startsWith("<!--")) continue; // comments are opaque — no tags inside count

  if (m[1]) {
    // closing tag
    depth--;
    if (depth === 1 && pending) {
      children.push({ start: pending.start, end: TAG_RE.lastIndex, openTag: pending.openTag });
      pending = null;
    }
    if (depth === 0) {
      wrapperEnd = TAG_RE.lastIndex;
      break;
    }
    continue;
  }

  const tagName = m[2].toLowerCase();
  const selfClosing = Boolean(m[4]) || VOID_ELEMENTS.has(tagName);

  if (selfClosing) {
    if (depth === 1) children.push({ start: m.index, end: TAG_RE.lastIndex, openTag: m[0] });
  } else if (depth === 1) {
    pending = { start: m.index, openTag: m[0] };
    depth++;
  } else {
    depth++;
  }
}

if (wrapperEnd === -1) {
  console.error("✗ the swap grid wrapper's closing tag was never found — markup may be malformed");
  process.exit(1);
}

if (children.length !== 3) {
  console.error(`✗ expected 3 direct children of the grid wrapper — found ${children.length}`);
  console.error("  A section was likely spliced between two group wrappers instead of inside one.");
  process.exit(1);
}

const groups = children.map(({ start, end, openTag }) => {
  const match = openTag.match(/data-swap-group="([^"]*)"/);
  return { group: match?.[1] ?? null, start, end };
});

if (groups.map((g) => g.group).join(",") !== "a,b,c") {
  console.error(`✗ expected groups a,b,c — found: ${groups.map((g) => g.group ?? "(none)").join(",")}`);
  console.error("  A direct child of the grid wrapper has no data-swap-group, or the groups are");
  console.error("  duplicated, reordered, or misnamed.");
  process.exit(1);
}

// Contiguity: one landmark from each group, each required inside its OWN
// group's element span [start, end). Checking the landmarks only against
// each other (offsets[0] < offsets[1] < offsets[2]) is not enough: a
// landmark that migrated into an adjacent group but stayed between its
// neighbours would still pass that. Anchoring each landmark to its own
// group's element span catches that.
const landmarks = [
  { text: "You pay", group: groups[0] },
  { text: "Unmatched remainder", group: groups[1] },
  { text: "Expected out", group: groups[2] },
];

for (const { text, group } of landmarks) {
  const offset = html.indexOf(text);
  if (offset === -1) {
    console.error(`✗ a landmark is missing: ${text}`);
    process.exit(1);
  }
  if (offset < group.start || offset >= group.end) {
    console.error(`✗ "${text}" is outside group ${group.group}'s element — it may have migrated to another group`);
    process.exit(1);
  }
}

console.log("✓ swap card groups are contiguous and in order (a, b, c)");
