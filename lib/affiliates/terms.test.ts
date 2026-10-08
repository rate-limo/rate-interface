import { describe, expect, it } from "vitest";
import { EARN_CONFIG_DEFAULTS } from "@iter/types";
import { EXAMPLE_FEE_USD, EXAMPLE_POINTS, INVITEE_REBATE_PCT, LAUNCH_MULTIPLE, LAUNCH_VS_REFERENCE, REFERRAL_SHARE_PCT } from "./terms";

describe("affiliate page terms", () => {
  it("follow the configured share, whatever it is", () => {
    const share = EARN_CONFIG_DEFAULTS.referralCutBps / 10_000;
    expect(REFERRAL_SHARE_PCT).toBe(share * 100);
    expect(EXAMPLE_FEE_USD).toBe(1);
    // $1 of fee at the trading rate vs 0.1% = 1,000 points, times the share.
    expect(EXAMPLE_POINTS).toBeCloseTo(1_000 * share);
    expect(LAUNCH_MULTIPLE).toBeCloseTo(10 * share);
    expect(LAUNCH_VS_REFERENCE).toBe(10);
    expect(INVITEE_REBATE_PCT).toBe(EARN_CONFIG_DEFAULTS.affiliateInviteeRebateBps / 100);
  });
});
