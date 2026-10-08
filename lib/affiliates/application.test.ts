import { describe, expect, it } from "vitest";
import {
  affiliateApplicationMessage,
  APPLICATION_HEADING,
  isApplicantWallet,
  normaliseXHandle,
  requestedCodeProblem,
} from "./application";

describe("normaliseXHandle", () => {
  it("accepts a handle with or without @, or a profile URL", () => {
    expect(normaliseXHandle("@iter_cx")).toBe("iter_cx");
    expect(normaliseXHandle("https://x.com/iter_cx?s=20")).toBe("iter_cx");
    expect(normaliseXHandle("https://twitter.com/iter_cx")).toBe("iter_cx");
  });

  it("refuses what X would refuse", () => {
    expect(normaliseXHandle("has space")).toBeNull();
    expect(normaliseXHandle("a".repeat(16))).toBeNull();
  });
});

describe("requestedCodeProblem", () => {
  it("accepts the vanity shape admin-service assigns", () => {
    expect(requestedCodeProblem("alice")).toBeNull();
    expect(requestedCodeProblem("TRADER42")).toBeNull();
  });

  it("refuses what an operator could not assign", () => {
    expect(requestedCodeProblem("ab")).not.toBeNull();
    expect(requestedCodeProblem("1ALICE")).not.toBeNull();
    expect(requestedCodeProblem("A".repeat(13))).not.toBeNull();
    expect(requestedCodeProblem("has-dash")).not.toBeNull();
    // An automatic code's shape would collide with some wallet's derived code.
    expect(requestedCodeProblem("ABC123")).not.toBeNull();
  });
});

describe("isApplicantWallet", () => {
  it("wants an address, since a code is assigned to one", () => {
    expect(isApplicantWallet("0xF8FB4672170607C95663f4Cc674dDb1386b7CfE0")).toBe(true);
    expect(isApplicantWallet("0x123")).toBe(false);
    expect(isApplicantWallet("")).toBe(false);
  });
});

describe("affiliateApplicationMessage", () => {
  it("leads with the heading and carries what an operator needs to assign the link", () => {
    const msg = affiliateApplicationMessage({
      wallet: "0xabc",
      requestedCode: " alice ",
      xHandle: "iter_cx",
      audience: " Telegram, 4k ",
    });
    expect(msg.split("\n")[0]).toBe(APPLICATION_HEADING);
    expect(msg).toContain("Wallet: 0xabc");
    expect(msg).toContain("Requested link: rate.limo/r/ALICE");
    expect(msg).toContain("X: @iter_cx");
    expect(msg).toContain("Audience:\nTelegram, 4k");
  });

  it("says what is missing rather than leaving it blank", () => {
    const msg = affiliateApplicationMessage({ wallet: "0xabc", requestedCode: "ALICE", xHandle: null, audience: "" });
    expect(msg).toContain("X: —");
    expect(msg).not.toContain("Audience:");
  });
});
