# `@iter/token-list`

The token, pair and group list the app, broker and gateway all read.

## Why it is vendored

It was `@standardweb3/default-token-list@0.0.86` on npm — same data, published
from `github.com/standardweb3/default-token-list` by the same author. Depending
on it meant the predecessor name appeared in four `package.json` files, a dozen
imports and three `tsup` configs, and the group keys it defines (`stnd_native`,
`stnd_stablecoin`, …) spread that name through the broker's pricing, the
gateway's default-pair lookup and the web app's market context.

Vendoring is what let those be renamed. Publishing `@iter/token-list` to npm and
depending on that would work equally well; nothing here depends on it being
local.

**The GPL-3.0-or-later licence travels with the data** — `LICENSE` is the
upstream file, unmodified.

## What changed from upstream

- Every `stnd_*` group key is `iter_*` (1,728 occurrences).
- The list's `name` is `ITER Default`, was `Standard Labs Default`.

Nothing else. Addresses, decimals, pairs and logo URLs are byte-identical, so a
diff against upstream shows only the rename.

## Known gap

Three `logoURI` values still point at
`raw.githubusercontent.com/standardweb3/default-token-list` — the HAIFU, Story
`IP` and Monad `gMon` icons. They are live URLs serving real images, and none of
those tokens is on a supported chain. Re-hosting them needs the image files
moved somewhere under iter-cx first; repointing the URLs before that would
replace three working icons with three 404s.
