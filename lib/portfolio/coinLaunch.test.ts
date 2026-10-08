import { describe, expect, it } from "vitest";
import { canReleaseVested, controlBlockedBy, graduationStatus, stepsSoldCount, vestedBps, VEST_DURATION_SEC } from "./coinLaunch";

const sold = (n: number) => Array.from({ length: 5 }, (_, i) => i < n);

describe("graduation, as AssetGenerator.graduate decides it", () => {
  it("cannot be armed until every step has sold", () => {
    expect(graduationStatus({ graduated: false, stepsSold: sold(4), readyAt: 0 }, 0)).toBe("selling");
    expect(graduationStatus({ graduated: false, stepsSold: sold(5), readyAt: 0 }, 0)).toBe("armable");
    expect(stepsSoldCount({ stepsSold: sold(3) })).toBe(3);
  });

  it("finishes from readyAt on, as the contract's `<` check allows", () => {
    expect(graduationStatus({ graduated: false, stepsSold: sold(5), readyAt: 1_300 }, 1_299)).toBe("armed");
    expect(graduationStatus({ graduated: false, stepsSold: sold(5), readyAt: 1_300 }, 1_300)).toBe("ready");
  });

  it("latches", () => {
    expect(graduationStatus({ graduated: true, stepsSold: sold(5), readyAt: 1 }, 0)).toBe("graduated");
  });
});

describe("creator control", () => {
  it("names the reason it is closed", () => {
    expect(controlBlockedBy({ graduated: false, creatorFeeLocked: true })).toBe("not-graduated");
    expect(controlBlockedBy({ graduated: true, creatorFeeLocked: true })).toBe("locked");
    expect(controlBlockedBy({ graduated: true, creatorFeeLocked: false })).toBeNull();
  });
});

describe("12-month vesting, as AssetLaunchLib.releaseVested computes it", () => {
  it("vests linearly from graduation, fully at 365 days", () => {
    expect(vestedBps(1_000, 1_000)).toBe(0);
    expect(vestedBps(1_000, 1_000 + VEST_DURATION_SEC / 2)).toBe(5_000);
    expect(vestedBps(1_000, 1_000 + VEST_DURATION_SEC * 2)).toBe(10_000);
  });

  it("allows a release only when more has vested than was released, and never for fees-only", () => {
    const base = { graduated: true, graduatedAt: 1_000, releasedBps: 5_000 };
    const half = 1_000 + VEST_DURATION_SEC / 2;
    expect(canReleaseVested({ ...base, lockMode: "vest12Months" }, half)).toBe(false);
    expect(canReleaseVested({ ...base, lockMode: "vest12Months" }, half + 86_400)).toBe(true);
    expect(canReleaseVested({ ...base, lockMode: "feesOnly", releasedBps: 0 }, half)).toBe(false);
  });
});
