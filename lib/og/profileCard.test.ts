import { describe, expect, it } from "vitest";
import {
  fallbackAvatarUrl,
  fallbackBannerGradient,
  money,
  pct,
  pickTopMovers,
  rankLabel,
  signedMoney,
  sparklinePath,
  tone,
} from "./profileCard";

describe("pickTopMovers", () => {
  it("ranks by ABSOLUTE move, so a large loss outranks a small gain", () => {
    // A card showing a wallet's two biggest losses is as informative as one
    // showing its wins; ranking signed would bury a disaster under a rounding
    // -error gain.
    const out = pickTopMovers(
      [
        { symbol: "WIN", realizedPnlUSD: 12, costUSD: 100 },
        { symbol: "LOSS", realizedPnlUSD: -1949.47, costUSD: 9946 },
      ],
      2,
    );
    expect(out.map((m) => m.symbol)).toEqual(["LOSS", "WIN"]);
  });

  it("drops zero-PnL positions rather than ranking them last", () => {
    // Most rows on this venue are zero — bought and never sold has no realised
    // PnL — and a card listing two of them says nothing about the wallet.
    expect(pickTopMovers([{ symbol: "FLAT", realizedPnlUSD: 0, costUSD: 100 }])).toEqual([]);
  });

  it("reports no percentage when there is no cost basis, never 0%", () => {
    // 0% beside a four-figure dollar swing reads as "it did not move".
    const [m] = pickTopMovers([{ symbol: "X", realizedPnlUSD: -50, costUSD: 0 }]);
    expect(m!.pctChange).toBeNull();
  });

  it("computes the percentage against cost when there is one", () => {
    const [m] = pickTopMovers([{ symbol: "X", realizedPnlUSD: -1949.47, costUSD: 9946.27 }]);
    expect(m!.pctChange).toBeCloseTo(-19.6, 1);
  });

  it("survives missing fields without inventing a symbol", () => {
    const [m] = pickTopMovers([{ realizedPnlUSD: -5 }]);
    expect(m!.symbol).toBe("—");
    expect(m!.logoURI).toBeNull();
  });
});

describe("sparklinePath", () => {
  it("refuses a single reading — one point is not a history", () => {
    // Drawing it as a flat rule would invent a series the wallet does not have.
    expect(sparklinePath([{ usd: 10 }], 100, 40)).toBeNull();
    expect(sparklinePath([], 100, 40)).toBeNull();
  });

  it("draws a FLAT series at the midline instead of dividing by a zero span", () => {
    const p = sparklinePath([{ usd: 5 }, { usd: 5 }, { usd: 5 }], 100, 40);
    expect(p).not.toBeNull();
    expect(p!.line).toContain("20.0");
    expect(p!.line).not.toContain("NaN");
  });

  it("fits the extremes to the box", () => {
    const p = sparklinePath([{ usd: 0 }, { usd: 10 }], 100, 40)!;
    // Lowest value sits at the bottom, highest at the top.
    expect(p.line).toBe("M0.0,40.0 L100.0,0.0");
  });

  it("closes the area down to the baseline so it can be filled", () => {
    const p = sparklinePath([{ usd: 1 }, { usd: 2 }], 100, 40)!;
    expect(p.area.endsWith("L0,40.0 Z")).toBe(true);
  });
});

describe("money and tone", () => {
  it("renders an em-dash for unmeasured, never $0.00", () => {
    // The distinction the whole card turns on: a wallet with no recorded
    // balance is not a wallet worth nothing.
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(Number.NaN)).toBe("—");
    expect(money(0)).toBe("$0.00");
  });

  it("always shows the sign on a change", () => {
    expect(signedMoney(-1046.39)).toBe("-$1,046.39");
    expect(signedMoney(204.1)).toBe("+$204.10");
    expect(signedMoney(null)).toBe("—");
  });

  it("treats zero and unmeasured as flat, so neither paints green", () => {
    expect(tone(0)).toBe("flat");
    expect(tone(null)).toBe("flat");
    expect(tone(-1)).toBe("down");
    expect(tone(1)).toBe("up");
  });

  it("formats a percentage unsigned — the arrow carries the direction", () => {
    expect(pct(-19.6)).toBe("19.60%");
    expect(pct(null)).toBe("—");
  });
});

describe("rankLabel", () => {
  it("formats a standing with a thousands separator", () => {
    expect(rankLabel(475012)).toBe("#475,012");
  });

  it("returns null for an unranked wallet rather than #0 or a last place", () => {
    // The gateway answers `rank: null` for a wallet the fill ledger has never
    // seen. "Unranked" and "last" are different facts, and a card that printed
    // the second would invent a standing for every wallet that never traded.
    expect(rankLabel(null)).toBeNull();
    expect(rankLabel(undefined)).toBeNull();
    expect(rankLabel(0)).toBeNull();
    expect(rankLabel(Number.NaN)).toBeNull();
  });
});

describe("fallbackAvatarUrl", () => {
  it("is stable for one wallet and differs between wallets", () => {
    // A generated avatar only works as identity if the same wallet gets the
    // same mark on every card, forever.
    const a = "0x9E7A01E4514bb56ae642587E0485b606DB46850E";
    const b = "0xB59C24062386C984E829E18Dd96caAAb30D84EaD";
    expect(fallbackAvatarUrl(a)).toBe(fallbackAvatarUrl(a));
    expect(fallbackAvatarUrl(a)).not.toBe(fallbackAvatarUrl(b));
  });

  it("is case-insensitive, so a checksummed and a lowercased address agree", () => {
    const a = "0x9E7A01E4514bb56ae642587E0485b606DB46850E";
    expect(fallbackAvatarUrl(a)).toBe(fallbackAvatarUrl(a.toLowerCase()));
  });

  it("asks for PNG, because satori has no loader for a remote SVG", () => {
    expect(fallbackAvatarUrl("0xabc")).toContain("/png?");
  });
});

describe("fallbackBannerGradient", () => {
  it("is stable per wallet, case-insensitively", () => {
    const a = "0x9E7A01E4514bb56ae642587E0485b606DB46850E";
    expect(fallbackBannerGradient(a)).toBe(fallbackBannerGradient(a.toLowerCase()));
  });

  it("emits HEX stops, never hsl() — satori's gradient parser rejects hsl", () => {
    // An hsl() stop throws mid-stream inside ImageResponse, which no try/catch
    // can recover, and takes the whole card down.
    const out = fallbackBannerGradient("0x9E7A01E4514bb56ae642587E0485b606DB46850E");
    expect(out).toMatch(/^linear-gradient\(120deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/);
  });
});
