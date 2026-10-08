import { describe, expect, it } from "vitest";
import { referralCardUrl, referralShareText, referralShareUrl } from "./share";

describe("referral share", () => {
  it("links to production's /r/CODE and fetches the card from the origin", () => {
    // Production's host even from localhost: the link is pasted into other chats.
    expect(referralShareUrl(" 919d24 ")).toBe("https://rate.limo/r/919D24");
    expect(referralCardUrl("https://www.rate.limo", "919d24")).toBe("https://www.rate.limo/api/og/referral?code=919D24");
  });

  it("names the code in the post text", () => {
    expect(referralShareText("919d24")).toContain("919D24");
  });
});
