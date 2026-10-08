import { describe, expect, it } from "vitest";
import { explorerUrlForNetwork } from "./explorer";

describe("explorerUrlForNetwork", () => {
    it("resolves an explorer for each chain the app can connect to", () => {
        expect(explorerUrlForNetwork("RISE Testnet")).toMatch(/^https?:\/\//);
    });

    it("does not expose dormant chain explorers", () => {
        for (const name of ["Somnia Testnet", "MegaETH Testnet", "Ink Sepolia"]) {
            expect(explorerUrlForNetwork(name), name).toBeUndefined();
        }
    });

    it("returns undefined for an unknown or empty network name", () => {
        expect(explorerUrlForNetwork("Nonexistent Testnet")).toBeUndefined();
        expect(explorerUrlForNetwork("")).toBeUndefined();
    });
});
