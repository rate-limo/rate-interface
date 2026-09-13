import { describe, expect, it } from "vitest";
import { isAddressQuery, isSameAddress, toChecksumAddress, truncateAddress } from "./address";

// A real, checksummed address and its lowercased form.
const CHECKSUMMED = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const LOWER = CHECKSUMMED.toLowerCase();

describe("isAddressQuery", () => {
    it("accepts a checksummed address", () => {
        expect(isAddressQuery(CHECKSUMMED)).toBe(true);
    });

    // The whole point of strict:false — a paste from a terminal or an explorer is
    // lowercase, and refusing it would make the Wallets tab useless for the most
    // common way an address reaches a search box.
    it("accepts a lowercased address", () => {
        expect(isAddressQuery(LOWER)).toBe(true);
    });

    it("accepts surrounding whitespace, which a paste often carries", () => {
        expect(isAddressQuery(`  ${CHECKSUMMED}\n`)).toBe(true);
    });

    it("rejects a short hex string, a long one, and a non-hex one", () => {
        expect(isAddressQuery(CHECKSUMMED.slice(0, -1))).toBe(false);
        expect(isAddressQuery(`${CHECKSUMMED}00`)).toBe(false);
        expect(isAddressQuery(`0x${"z".repeat(40)}`)).toBe(false);
    });

    it("rejects the token symbols that make up nearly every real query", () => {
        expect(isAddressQuery("eth")).toBe(false);
        expect(isAddressQuery("usdc")).toBe(false);
        expect(isAddressQuery("")).toBe(false);
        expect(isAddressQuery("0x")).toBe(false);
    });
});

describe("toChecksumAddress", () => {
    it("checksums a lowercased address rather than echoing the input back", () => {
        expect(toChecksumAddress(LOWER)).toBe(CHECKSUMMED);
    });

    it("leaves an already-checksummed address alone", () => {
        expect(toChecksumAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
    });

    it("returns null for a non-address instead of throwing", () => {
        expect(toChecksumAddress("eth")).toBeNull();
        expect(toChecksumAddress("")).toBeNull();
    });
});

describe("truncateAddress", () => {
    it("keeps the lead and tail an explorer would show", () => {
        expect(truncateAddress(CHECKSUMMED)).toBe("0xA0b8…eB48");
    });

    it("returns short strings untouched rather than producing a longer output", () => {
        expect(truncateAddress("0xA0b8")).toBe("0xA0b8");
    });
});

describe("isSameAddress", () => {
    // wagmi hands back a checksummed address; the modal's copy is whatever was
    // typed. A === here fails to recognise the user's own wallet.
    it("matches across casing", () => {
        expect(isSameAddress(LOWER, CHECKSUMMED)).toBe(true);
    });

    it("does not match different addresses", () => {
        expect(isSameAddress(CHECKSUMMED, `0x${"1".repeat(40)}`)).toBe(false);
    });

    it("is false when either side is missing, never accidentally true", () => {
        expect(isSameAddress(undefined, CHECKSUMMED)).toBe(false);
        expect(isSameAddress(CHECKSUMMED, undefined)).toBe(false);
        expect(isSameAddress(undefined, undefined)).toBe(false);
    });
});
