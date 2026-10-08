import { describe, expect, it } from "vitest";
import { pickWalletName } from "./walletName";

describe("pickWalletName", () => {
  it("prefers the name the wallet authored over the generated handle", () => {
    // The direction matters: a derived value outranking a typed one is the bug
    // migration 0002 removed.
    expect(pickWalletName({ displayName: "Lee", username: "lee" }, "CalmKindredHeron")).toBe("Lee");
    expect(pickWalletName({ displayName: null, username: "lee" }, "CalmKindredHeron")).toBe("lee");
  });

  it("falls back to the generated handle, which is what a new wallet has", () => {
    expect(pickWalletName({ displayName: null, username: null }, "CalmKindredHeron")).toBe(
      "CalmKindredHeron",
    );
    expect(pickWalletName(null, "CalmKindredHeron")).toBe("CalmKindredHeron");
  });

  it("answers null when nothing names it, so the caller can draw an address", () => {
    expect(pickWalletName(null, null)).toBeNull();
    expect(pickWalletName({ displayName: null, username: null }, undefined)).toBeNull();
  });

  it("treats a blank field as unset — that is how a cleared form arrives", () => {
    expect(pickWalletName({ displayName: "   ", username: "" }, "CalmKindredHeron")).toBe(
      "CalmKindredHeron",
    );
    expect(pickWalletName({ displayName: "  Lee  " }, null)).toBe("Lee");
  });
});
