import { describe, expect, it } from "vitest";
import { EMPTY_POINTS, type PublicPoints } from "./rewards";
import { toReferralSummary } from "./referrals";

const points = (over: Partial<PublicPoints> = {}): PublicPoints => ({
    ...EMPTY_POINTS,
    refereeCount: 8,
    attestedRefereeCount: 5,
    bySource: { trading: 1200, referral: 2300 },
    referral: { cutPct: 5, boostPct: 3, maxBoostPct: 30 },
    ...over,
});

const ORIGIN = "https://iter.cx";

describe("toReferralSummary", () => {
    it("carries the counts and the referral points through", () => {
        const s = toReferralSummary(points(), "HYUNGSU", ORIGIN);
        expect(s.referred).toBe(8);
        expect(s.active).toBe(5);
        expect(s.earnedPts).toBe(2300);
    });

    it("publishes the rates the service served, not a frontend constant", () => {
        const s = toReferralSummary(points(), "HYUNGSU", ORIGIN);
        expect(s.cutPct).toBe(5);
        expect(s.boostPct).toBe(3);
        expect(s.maxBoostPct).toBe(30);
    });

    it("reflects an operator's change rather than a hardcoded default", () => {
        const changed = points({ referral: { cutPct: 7.5, boostPct: 1, maxBoostPct: 12 } });
        const s = toReferralSummary(changed, "HYUNGSU", ORIGIN);
        expect(s.cutPct).toBe(7.5);
        expect(s.maxBoostPct).toBe(12);
    });

    it("builds the share link against the origin it was given", () => {
        expect(toReferralSummary(points(), "HYUNGSU", ORIGIN).link).toBe("https://iter.cx/r/HYUNGSU");
    });

    it("does not double the slash when the origin carries a trailing one", () => {
        expect(toReferralSummary(points(), "ABC123", "https://iter.cx/").link).toBe(
            "https://iter.cx/r/ABC123",
        );
    });

    /*
     * No code means no link — not a link to `/r/` that resolves to nobody.
     *
     * The code lookup registers on first ask and can fail; a referral panel that
     * hands out a dead link is worse than one that hands out none, because the
     * sharer finds out from the person who followed it.
     */
    it("renders no link at all when there is no code yet", () => {
        const s = toReferralSummary(points(), null, ORIGIN);
        expect(s.code).toBe("");
        expect(s.link).toBe("");
    });

    it("survives a points payload from an older service with no referral terms", () => {
        const older = points({ referral: undefined });
        const s = toReferralSummary(older, "HYUNGSU", ORIGIN);
        expect(s.cutPct).toBe(0);
        expect(s.boostPct).toBe(0);
        expect(s.maxBoostPct).toBe(0);
    });

    it("reports zero referral points for a wallet that has earned none", () => {
        const none = points({ bySource: { trading: 10 } });
        expect(toReferralSummary(none, "HYUNGSU", ORIGIN).earnedPts).toBe(0);
    });

    it("is all zeros for a wallet with nothing at all", () => {
        const s = toReferralSummary(EMPTY_POINTS, null, ORIGIN);
        expect(s).toEqual({
            code: "",
            link: "",
            referred: 0,
            active: 0,
            earnedPts: 0,
            cutPct: 0,
            boostPct: 0,
            maxBoostPct: 0,
        });
    });

    it("never throws on a malformed payload", () => {
        expect(() => toReferralSummary({} as PublicPoints, "X", ORIGIN)).not.toThrow();
    });
});
