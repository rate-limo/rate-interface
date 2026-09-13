import { describe, expect, it } from "vitest";
import {
  SUPPORT_KEY,
  browserStorage,
  clearSession,
  readSession,
  writeSession,
  type SupportStorage,
} from "./store";

const TOKEN = "a".repeat(64);

function memory(initial: Record<string, string> = {}): SupportStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** Storage that throws on every call — Safari private mode, or storage
 * disabled by policy. */
const hostile: SupportStorage = {
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

describe("readSession", () => {
  it("round-trips a written session", () => {
    const s = memory();
    expect(writeSession(s, { token: TOKEN, reference: "T-7QK2M9" })).toBe(true);
    expect(readSession(s)).toEqual({ token: TOKEN, reference: "T-7QK2M9" });
  });

  it("is null when nothing has been stored", () => {
    expect(readSession(memory())).toBeNull();
    expect(readSession(null)).toBeNull();
    expect(readSession(undefined)).toBeNull();
  });

  it("refuses a token that is not exactly a token", () => {
    // It reaches a request header and then a WHERE clause. A hand-edited or
    // legacy value is no session, never a value passed along.
    for (const token of ["", "abc", "A".repeat(64), "a".repeat(63), `${TOKEN}'--`, 42, null]) {
      const s = memory({ [SUPPORT_KEY]: JSON.stringify({ token, reference: "T-1" }) });
      expect(readSession(s), String(token)).toBeNull();
    }
  });

  it("refuses a session with no reference", () => {
    const s = memory({ [SUPPORT_KEY]: JSON.stringify({ token: TOKEN }) });
    expect(readSession(s)).toBeNull();
    const empty = memory({ [SUPPORT_KEY]: JSON.stringify({ token: TOKEN, reference: "" }) });
    expect(readSession(empty)).toBeNull();
  });

  it("treats unparseable storage as no session rather than throwing", () => {
    expect(readSession(memory({ [SUPPORT_KEY]: "{not json" }))).toBeNull();
    expect(readSession(memory({ [SUPPORT_KEY]: "null" }))).toBeNull();
  });

  it("survives storage that throws", () => {
    expect(readSession(hostile)).toBeNull();
    expect(writeSession(hostile, { token: TOKEN, reference: "T-1" })).toBe(false);
    expect(() => clearSession(hostile)).not.toThrow();
  });
});

describe("writeSession", () => {
  it("reports failure instead of promising persistence it did not get", () => {
    // The widget tells the visitor their thread won't survive a reload; a
    // silent false success would lose someone's conversation without warning.
    expect(writeSession(hostile, { token: TOKEN, reference: "T-1" })).toBe(false);
    expect(writeSession(null, { token: TOKEN, reference: "T-1" })).toBe(false);
  });

  it("will not store a malformed token", () => {
    const s = memory();
    expect(writeSession(s, { token: "nope", reference: "T-1" })).toBe(false);
    expect(s.data[SUPPORT_KEY]).toBeUndefined();
  });
});

describe("clearSession", () => {
  it("removes the stored session", () => {
    const s = memory();
    writeSession(s, { token: TOKEN, reference: "T-1" });
    clearSession(s);
    expect(readSession(s)).toBeNull();
  });
});

describe("browserStorage", () => {
  it("is null on the server, where there is no window", () => {
    // vitest runs this file in node, so `window` is genuinely undefined —
    // the same condition as a server render.
    expect(browserStorage()).toBeNull();
  });
});
