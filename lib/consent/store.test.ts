import { describe, it, expect } from "vitest";
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  type ConsentStorage,
  analyticsAllowed,
  clearConsent,
  readConsent,
  writeConsent,
} from "./store";

/**
 * These tests are the consent guarantee. Every case below is one where getting
 * it wrong means loading a tracking script the user did not agree to — so the
 * assertions are all deliberately biased the same way: anything other than a
 * clear, current "accepted" must read as no.
 */

function fakeStorage(seed?: Record<string, string>): ConsentStorage {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Storage that throws on every access — Safari private mode, blocked cookies. */
const hostileStorage: ConsentStorage = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
  removeItem() {
    throw new Error("denied");
  },
};

describe("readConsent", () => {
  it("returns null when nothing has been stored", () => {
    expect(readConsent(fakeStorage())).toBeNull();
  });

  it("round-trips an accepted decision", () => {
    const storage = fakeStorage();
    writeConsent(storage, "accepted");
    expect(readConsent(storage)?.status).toBe("accepted");
  });

  it("round-trips a rejection", () => {
    const storage = fakeStorage();
    writeConsent(storage, "rejected");
    expect(readConsent(storage)?.status).toBe("rejected");
  });

  it("treats a stale policy version as no answer", () => {
    // Consent is to specific terms. Carrying an old yes forward to new terms is
    // the thing this guards against.
    const storage = fakeStorage({
      [CONSENT_KEY]: JSON.stringify({ status: "accepted", version: CONSENT_VERSION - 1, at: "x" }),
    });
    expect(readConsent(storage)).toBeNull();
  });

  it("treats malformed JSON as no answer", () => {
    expect(readConsent(fakeStorage({ [CONSENT_KEY]: "{not json" }))).toBeNull();
  });

  it("treats an unrecognised status as no answer", () => {
    const storage = fakeStorage({
      [CONSENT_KEY]: JSON.stringify({ status: "maybe", version: CONSENT_VERSION }),
    });
    expect(readConsent(storage)).toBeNull();
  });

  it("survives storage that throws", () => {
    expect(readConsent(hostileStorage)).toBeNull();
  });

  it("survives having no storage at all (SSR)", () => {
    expect(readConsent(null)).toBeNull();
    expect(readConsent(undefined)).toBeNull();
  });
});

describe("writeConsent", () => {
  it("stamps the version and time so the record is evidence, not just a flag", () => {
    const storage = fakeStorage();
    const at = new Date("2026-08-01T10:30:00.000Z");
    const record = writeConsent(storage, "accepted", () => at);

    expect(record).toEqual({
      status: "accepted",
      version: CONSENT_VERSION,
      at: "2026-08-01T10:30:00.000Z",
    });
    expect(JSON.parse(storage.getItem(CONSENT_KEY)!)).toEqual(record);
  });

  it("does not throw when storage is unwritable", () => {
    // Failing to persist means we ask again next visit; throwing here would
    // break the banner entirely and leave the user unable to answer at all.
    expect(() => writeConsent(hostileStorage, "rejected")).not.toThrow();
  });
});

describe("clearConsent", () => {
  it("removes the record so the banner asks again", () => {
    const storage = fakeStorage();
    writeConsent(storage, "accepted");
    clearConsent(storage);
    expect(readConsent(storage)).toBeNull();
  });

  it("does not throw on hostile storage", () => {
    expect(() => clearConsent(hostileStorage)).not.toThrow();
  });
});

describe("analyticsAllowed", () => {
  it("is true ONLY for an explicit current acceptance", () => {
    expect(analyticsAllowed({ status: "accepted", version: CONSENT_VERSION, at: "" })).toBe(true);
  });

  it("is false for rejection, for no answer, and for a stale record", () => {
    expect(analyticsAllowed({ status: "rejected", version: CONSENT_VERSION, at: "" })).toBe(false);
    expect(analyticsAllowed(null)).toBe(false);
    // A stale version never survives readConsent, but assert the end-to-end
    // path too: a v0 "yes" in storage must not enable anything.
    const storage = fakeStorage({
      [CONSENT_KEY]: JSON.stringify({ status: "accepted", version: 0, at: "" }),
    });
    expect(analyticsAllowed(readConsent(storage))).toBe(false);
  });

  it("defaults to off when storage is unreadable", () => {
    expect(analyticsAllowed(readConsent(hostileStorage))).toBe(false);
  });
});
