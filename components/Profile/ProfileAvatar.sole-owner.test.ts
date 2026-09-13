import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `ProfileAvatar` is the ONLY thing that may paint a wallet's disc.
 *
 * ## Why this is a test and not a comment
 *
 * It has been reported three times, in three different words, and fixed twice
 * without holding:
 *
 *  1. `IdentityCard` painted the avatar with `addressGradient` — the BANNER's
 *     palette — so the disc read as a circular crop of the banner above it.
 *     Fixed by creating this component.
 *  2. Four more surfaces were found doing the same. Fixed by swapping the
 *     palette on each — `addressGradient` to `addressAvatarGradient`.
 *  3. "again profile image and top pnl profile image is not matching."
 *     Because step 2 copied ONE of the component's three decisions. The hues
 *     matched after it; the picture still did not, because `ProfileAvatar`
 *     paints a RADIAL gradient carrying the name's first letter and every copy
 *     painted a LINEAR one carrying nothing. Same wallet, blank pink smear in
 *     the leaderboard, lettered purple disc in the callout beside it.
 *
 * The lesson each fix missed is that the failure is not any one wrong value. It
 * is a second implementation existing at all: three decisions (palette,
 * geometry, initial) reproduced by hand, where getting two right still renders
 * a different person.
 *
 * So the rule this asserts is ownership, not correctness of a colour —
 * `addressAvatarGradient` is the avatar's palette and only its own component may
 * read it. A surface that needs a disc imports the component.
 *
 * `addressGradient` is deliberately NOT covered: that is the banner's, and
 * `ProfileBanner` is its owner by the same argument.
 */

const ROOT = join(__dirname, "..", "..");
const OWNER = join("components", "Profile", "ProfileAvatar.tsx");

/** Where the palette legitimately lives, alongside its own component. */
const ALLOWED = new Set([
  OWNER,
  join("lib", "portfolio", "profile.ts"),
  join("lib", "portfolio", "profile.test.ts"),
  join("components", "Profile", "ProfileAvatar.sole-owner.test.ts"),
]);

/** Source trees a component can hide in. `app/` included: a route file can draw
 *  a disc just as easily as a component can. */
const TREES = ["components", "app", "lib", "hooks"];

const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

describe("ProfileAvatar owns the avatar disc", () => {
  it("nothing else reads addressAvatarGradient", () => {
    const offenders: string[] = [];

    for (const tree of TREES) {
      const dir = join(ROOT, tree);
      try {
        statSync(dir);
      } catch {
        continue; // tree does not exist in this checkout
      }
      for (const file of walk(dir)) {
        const relative = file.slice(ROOT.length + 1);
        if (ALLOWED.has(relative)) continue;
        if (readFileSync(file, "utf8").includes("addressAvatarGradient")) {
          offenders.push(relative);
        }
      }
    }

    expect(
      offenders,
      "These files paint their own avatar disc. Import ProfileAvatar instead — " +
        "matching its palette by hand is what left the leaderboard and the callout " +
        "showing the same wallet two different ways, twice.",
    ).toEqual([]);
  });
});
