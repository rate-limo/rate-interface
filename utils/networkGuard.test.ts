import { describe, expect, it } from "vitest";
import { needsNetworkSwitch } from "./networkGuard";

describe("needsNetworkSwitch", () => {
  it("is false when the viewing chain and wallet chain agree", () => {
    expect(needsNetworkSwitch(10143, 10143)).toBe(false);
  });

  it("is true when the ChainSwitcher moves the viewing chain away from the wallet's chain mid-session", () => {
    // Simulates useChainSwitch().switchTo: displayChainId changes to the target
    // chain immediately, while the wallet (connectedChainId) hasn't moved.
    const walletChainId = 10143; // Monad Testnet, wallet stays put
    const viewingChainIdAfterSwitch = 11155931; // RISE Testnet, user just browsed here
    expect(needsNetworkSwitch(viewingChainIdAfterSwitch, walletChainId)).toBe(true);
  });

  it("is true when the wallet connects on a different chain than the one being viewed", () => {
    expect(needsNetworkSwitch(10143, 11155931)).toBe(true);
  });

  it("is false when neither chain id is known yet (both undefined)", () => {
    expect(needsNetworkSwitch(undefined, undefined)).toBe(false);
  });

  it("is true when only one side has resolved a chain id", () => {
    expect(needsNetworkSwitch(10143, undefined)).toBe(true);
    expect(needsNetworkSwitch(undefined, 10143)).toBe(true);
  });
});
