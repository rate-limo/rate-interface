import { describe, expect, it } from "vitest";
import { depositHref, withdrawHref } from "./routes";

describe("transfer routes", () => {
  it("names no chain in the path, because the pages are wallet-scoped", () => {
    // A wallet is one address on every chain; the network is a field on the
    // page. `?chain=` here would be the claim SCHEME.deposit exists to avoid.
    expect(depositHref()).toBe("/deposit");
    expect(withdrawHref()).toBe("/withdraw");
  });

  it("takes NO chain, from any caller", () => {
    /*
     * It used to accept one, and the deposit page read it as a chain to deposit
     * on — which is a claim that page does not support: the ASSET decides the
     * network there. Worse, it did not preselect but SUPPRESSED the asset list,
     * so the same intent reached two different screens depending on who linked.
     *
     * A caller that knows the shortfall says so in its own words and sends the
     * user here to choose the asset that names the chain.
     */
    expect(depositHref()).toBe("/deposit");
    expect(depositHref.length).toBe(0);
  });
});
