import { describe, expect, it } from "vitest";
import { flowUrl, modeFromParam } from "./flowUrl";

const at = (path: string) => `https://rate.limo${path}`;

describe("flowUrl", () => {
  it("writes the pair the flow is showing over the one the link named", () => {
    // The flow swaps in the chain's default pair for a symbol its list does not
    // carry. The address bar has to follow, or it names a market the form is
    // not on — and a reload, or a shared link, reopens the dead one.
    expect(
      flowUrl(at("/pool/deposit?chain=arc-testnet&base=GONE&quote=USDC"), {
        base: "TITER",
        quote: "USDC",
        mode: "provide",
      }),
    ).toBe(at("/pool/deposit?chain=arc-testnet&base=TITER&quote=USDC"));
  });

  it("marks launch mode, and only launch mode", () => {
    expect(
      flowUrl(at("/pool/new?chain=arc-testnet"), { base: "AAA", quote: "BBB", mode: "launch" }),
    ).toBe(at("/pool/new?chain=arc-testnet&base=AAA&quote=BBB&mode=launch"));
    // Provide is the default; a param that says so is noise in every link.
    expect(
      flowUrl(at("/pool/new?chain=arc-testnet&base=AAA&quote=BBB&mode=launch"), {
        base: "AAA",
        quote: "BBB",
        mode: "provide",
      }),
    ).toBe(at("/pool/new?chain=arc-testnet&base=AAA&quote=BBB"));
  });

  it("keeps the path, the locale prefix, the chain and anything it does not own", () => {
    expect(
      flowUrl(at("/ko/pool/new?chain=rise-testnet&ref=CODE"), { base: "A", quote: "B", mode: "provide" }),
    ).toBe(at("/ko/pool/new?chain=rise-testnet&ref=CODE&base=A&quote=B"));
  });

  it("answers null while either side is still unknown", () => {
    // First paint, before the token list lands. Writing then would put
    // `base=&quote=` in the bar.
    expect(flowUrl(at("/pool/new?chain=s"), { base: "", quote: "USDC", mode: "provide" })).toBeNull();
  });

  it("answers null when there is nothing to change", () => {
    expect(
      flowUrl(at("/pool/deposit?chain=s&base=A&quote=B"), { base: "A", quote: "B", mode: "provide" }),
    ).toBeNull();
  });
});

describe("modeFromParam", () => {
  it("reads launch and treats everything else as provide", () => {
    expect(modeFromParam("launch")).toBe("launch");
    expect(modeFromParam(undefined)).toBe("provide");
    expect(modeFromParam("LAUNCH")).toBe("provide");
    expect(modeFromParam("anything")).toBe("provide");
  });
});
