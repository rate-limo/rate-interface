import { describe, expect, it } from "vitest";
import { CHAIN_APPLICATION_HEADING, chainApplicationMessage, chainIdProblem } from "./application";

const base = {
  chainName: "Example Chain",
  chainId: "12345",
  stage: "Mainnet" as const,
  evm: true,
  stablecoin: "USDC (native)",
  assets: "",
  offers: [],
  contactName: "Ada",
  contactRole: "",
  social: "",
  notes: "",
};

describe("chain application ticket", () => {
  it("leads with the fixed heading the support queue sorts on", () => {
    expect(chainApplicationMessage(base).split("\n")[0]).toBe(CHAIN_APPLICATION_HEADING);
  });

  it("labels every field and marks blanks with an em-dash, never an empty value", () => {
    const m = chainApplicationMessage(base);
    expect(m).toContain("Chain: Example Chain");
    expect(m).toContain("They can bring: —");
    expect(m).toContain("X / Telegram: —");
    expect(m).not.toContain("Assets to list");
  });

  it("includes assets, offers and notes when given, clipped", () => {
    const m = chainApplicationMessage({
      ...base,
      offers: ["Liquidity commitment", "Co-marketing"],
      assets: "Tokenized T-bills; gold",
      notes: "x".repeat(5000),
    });
    expect(m).toContain("They can bring: Liquidity commitment, Co-marketing");
    expect(m).toContain("Assets to list (incl. RWAs):\nTokenized T-bills; gold");
    expect(m.length).toBeLessThan(2000);
  });
});

describe("chain id", () => {
  it("accepts whole numbers and blanks, refuses the rest", () => {
    expect(chainIdProblem("")).toBeNull();
    expect(chainIdProblem("8453")).toBeNull();
    expect(chainIdProblem("0")).not.toBeNull();
    expect(chainIdProblem("0x2105")).not.toBeNull();
    expect(chainIdProblem("base")).not.toBeNull();
  });
});
