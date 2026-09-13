/**
 * The signed session. Moved here from apps/waitlist with the code it covers —
 * three deployments now sign or verify with this, so the tests belong beside
 * the one implementation rather than in whichever app happened to own it first.
 *
 * Run: packages/types/node_modules/.bin/tsx --test packages/types/src/session.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_WAITLIST_COOKIE,
  SESSION_COOKIE,
  signSession,
  verifySession,
  verifySessionWithLegacy,
} from "./session";

const SECRET = "test-secret-value-at-least-32-chars-long";
const LEGACY_SECRET = "the-old-waitlist-secret-32-chars-ok";

describe("session cookie", () => {
  it("round-trips the x user id", () => {
    const token = signSession("1234567890", SECRET);
    assert.equal(verifySession(token, SECRET), "1234567890");
  });

  it("rejects a tampered payload", () => {
    const token = signSession("1234567890", SECRET);
    const [, sig] = token.split(".");
    assert.equal(verifySession(`9999999999.${sig}`, SECRET), null);
  });

  it("rejects a signature made with a different secret", () => {
    const token = signSession("1234567890", "some-other-secret-entirely-ok-32");
    assert.equal(verifySession(token, SECRET), null);
  });

  it("treats missing, empty and malformed values as no session", () => {
    assert.equal(verifySession(undefined, SECRET), null);
    assert.equal(verifySession("", SECRET), null);
    assert.equal(verifySession("no-dot-here", SECRET), null);
    assert.equal(verifySession("a.b.c", SECRET), null);
  });

  it("names the cookies without a leading dot or spaces", () => {
    assert.equal(SESSION_COOKIE, "iter.sid");
    assert.equal(LEGACY_WAITLIST_COOKIE, "iter.waitlist");
  });

  it("changed name at the cutover, which is why the legacy one still exists", () => {
    // If these ever match, the fallback below is verifying the same cookie
    // twice and the transition has quietly stopped working.
    assert.notEqual(SESSION_COOKIE, LEGACY_WAITLIST_COOKIE);
  });
});

describe("verifySessionWithLegacy", () => {
  const shared = signSession("111", SECRET);
  const legacy = signSession("222", LEGACY_SECRET);

  it("prefers the shared cookie when both are present", () => {
    // A browser mid-cutover holds both. The shared one is the newer proof.
    assert.equal(
      verifySessionWithLegacy({ shared, legacy }, { secret: SECRET, legacySecret: LEGACY_SECRET }),
      "111",
    );
  });

  it("falls back to the legacy cookie, so existing signups are not signed out", () => {
    assert.equal(
      verifySessionWithLegacy(
        { shared: undefined, legacy },
        { secret: SECRET, legacySecret: LEGACY_SECRET },
      ),
      "222",
    );
  });

  it("ignores the legacy cookie once its secret is removed", () => {
    // This is the cleanup step: drop WAITLIST_SESSION_SECRET and the old
    // cookie stops being honoured, with no code change.
    assert.equal(verifySessionWithLegacy({ shared: undefined, legacy }, { secret: SECRET }), null);
  });

  it("NEVER verifies against an empty secret", () => {
    // createHmac accepts an empty key, so verifying with "" would authenticate
    // anything an attacker computed against the empty key. An unset secret must
    // mean "cannot verify", never "verify with nothing".
    const forged = signSession("999", "");
    assert.equal(verifySessionWithLegacy({ shared: forged }, { secret: "" }), null);
    assert.equal(verifySessionWithLegacy({ shared: forged }, {}), null);
    assert.equal(
      verifySessionWithLegacy({ shared: undefined, legacy: forged }, { legacySecret: "" }),
      null,
    );
  });

  it("returns null when neither cookie verifies", () => {
    assert.equal(
      verifySessionWithLegacy(
        { shared: "junk", legacy: "junk" },
        { secret: SECRET, legacySecret: LEGACY_SECRET },
      ),
      null,
    );
  });

  it("does not accept a legacy cookie under the shared secret, or vice versa", () => {
    // The two were signed by different deployments. Crossing them would mean
    // one secret's compromise forged both.
    assert.equal(verifySessionWithLegacy({ shared: legacy }, { secret: SECRET }), null);
    assert.equal(
      verifySessionWithLegacy({ shared: undefined, legacy: shared }, { legacySecret: LEGACY_SECRET }),
      null,
    );
  });
});
