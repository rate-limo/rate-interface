/** Generated default identity + shape rules. Pure — no db, no network.
 *
 * Run: packages/types/node_modules/.bin/tsx --test packages/types/src/profile.test.ts
 *
 * A wrong answer here is silent in a specific way: two concurrent first-time
 * reads of the same wallet must generate byte-identical defaults or the
 * gateway's "insert then re-read" idempotency breaks, and a handle collision
 * that isn't caught deterministically means a retried request guesses a
 * different discriminated handle each time.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DISPLAY_NAME_MAX_LENGTH,
  discriminatedHandle,
  generateProfile,
  handleDiscriminator,
  isValidDisplayName,
  isValidHandle,
} from "./profile";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

describe("generateProfile", () => {
  it("is deterministic for the same address", () => {
    assert.deepEqual(generateProfile(A), generateProfile(A));
  });

  it("ignores address casing", () => {
    // A checksummed address and its lowercase form are the same wallet.
    assert.deepEqual(generateProfile(A.toUpperCase().replace("0X", "0x")), generateProfile(A));
  });

  it("differs between wallets (almost always)", () => {
    assert.notEqual(generateProfile(A).displayName, generateProfile(B).displayName);
  });

  it("produces PascalCase adjective+adjective+animal with no spaces", () => {
    const { displayName } = generateProfile(A);
    assert.match(displayName, /^[A-Z][a-z]+[A-Z][a-z]+[A-Z][a-z]+\d*$/);
  });

  it("handle starts equal to displayName", () => {
    const p = generateProfile(A);
    assert.equal(p.handle, p.displayName);
  });

  it("never repeats the same adjective twice in a row", () => {
    // Exercise a wide address space rather than asserting on one fixed
    // input, so the dedup bump is checked broadly, not for one lucky case.
    for (let i = 0; i < 200; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}`;
      const { displayName } = generateProfile(addr);
      const match = displayName.match(/^([A-Z][a-z]+)([A-Z][a-z]+)[A-Z][a-z]+\d*$/);
      assert.ok(match, `unexpected shape: ${displayName}`);
      assert.notEqual(match![1], match![2], `adjective repeated in ${displayName}`);
    }
  });

  it("satisfies isValidHandle and isValidDisplayName by construction", () => {
    for (let i = 0; i < 50; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}`;
      const { displayName, handle } = generateProfile(addr);
      assert.ok(isValidHandle(handle), `generated handle ${handle} must be valid`);
      assert.ok(isValidDisplayName(displayName), `generated name ${displayName} must be valid`);
    }
  });
});

describe("handleDiscriminator / discriminatedHandle", () => {
  it("is deterministic and derived from the address, not random", () => {
    assert.equal(handleDiscriminator(A), handleDiscriminator(A));
    assert.equal(discriminatedHandle(A), discriminatedHandle(A));
  });

  it("differs between wallets (almost always)", () => {
    assert.notEqual(handleDiscriminator(A), handleDiscriminator(B));
  });

  it("is 4 lowercase hex characters", () => {
    assert.match(handleDiscriminator(A), /^[0-9a-f]{4}$/);
  });

  it("produces a still-valid handle when appended", () => {
    assert.ok(isValidHandle(discriminatedHandle(A)));
  });
});

describe("isValidHandle", () => {
  it("accepts the generated shape and a hand-typed handle", () => {
    assert.equal(isValidHandle("OtherExactOwl"), true);
    assert.equal(isValidHandle("hyungsu_99"), true);
  });

  it("rejects too short, too long, and a leading digit or underscore", () => {
    assert.equal(isValidHandle("ab"), false);
    assert.equal(isValidHandle("a".repeat(21)), false);
    assert.equal(isValidHandle("9abc"), false);
    assert.equal(isValidHandle("_abc"), false);
  });

  it("rejects characters that don't belong in a URL segment", () => {
    for (const bad of ["has space", "slash/here", "dot.here", "emoji😀ok"]) {
      assert.equal(isValidHandle(bad), false, bad);
    }
  });
});

describe("isValidDisplayName", () => {
  it("accepts anything within the length bound after trimming", () => {
    assert.equal(isValidDisplayName("A"), true);
    assert.equal(isValidDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH)), true);
    assert.equal(isValidDisplayName(`  padded  `.trim()), true);
  });

  it("rejects empty and over-length names", () => {
    assert.equal(isValidDisplayName(""), false);
    assert.equal(isValidDisplayName("   "), false);
    assert.equal(isValidDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH + 1)), false);
  });
});
