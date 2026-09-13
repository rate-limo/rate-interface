import { describe, expect, it } from "vitest";
import { MAX_RECORDS, forChain, parseLog, parseRecord, record, type TransferRecord } from "./history";

const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const PEER = "0x1111111111111111111111111111111111111111";
const base: TransferRecord = {
  hash: H(1), kind: "deposit", chainId: 5042002, symbol: "USDC", amount: "0.05", peer: PEER, at: 10,
};

describe("parseRecord", () => {
  it("keeps a well-formed record", () => {
    expect(parseRecord(base)).toEqual(base);
  });

  it("rejects a row that cannot be verified on chain", () => {
    // hash and chainId are the two fatal fields: without both, the row cannot
    // be linked to an explorer, and an unverifiable row is worse than an absent
    // one on a surface whose job is to account for money.
    expect(parseRecord({ ...base, hash: "0xshort" })).toBeNull();
    expect(parseRecord({ ...base, hash: undefined })).toBeNull();
    expect(parseRecord({ ...base, chainId: 0 })).toBeNull();
    expect(parseRecord({ ...base, chainId: "arc" })).toBeNull();
    expect(parseRecord(null)).toBeNull();
  });

  it("repairs display fields rather than dropping a verifiable row", () => {
    const r = parseRecord({ ...base, symbol: "", amount: 5, peer: "nope", at: -1 });
    expect(r).toMatchObject({ symbol: "—", amount: "—", peer: null, at: 0 });
    expect(r?.hash).toBe(base.hash);
  });

  it("defaults an unknown kind to deposit rather than inventing a withdrawal", () => {
    // A mislabelled incoming transfer is a cosmetic error; a mislabelled
    // OUTGOING one tells the user money left when it did not.
    expect(parseRecord({ ...base, kind: "nonsense" })?.kind).toBe("deposit");
    expect(parseRecord({ ...base, kind: "withdraw" })?.kind).toBe("withdraw");
  });
});

describe("parseLog", () => {
  it("treats unreadable storage as empty", () => {
    for (const bad of [null, "", "{oops", '{"a":1}']) expect(parseLog(bad)).toEqual([]);
  });

  it("drops bad rows and keeps the rest, newest first", () => {
    const raw = JSON.stringify([
      { ...base, hash: H(1), at: 1 },
      { ...base, hash: "0xbad" },
      { ...base, hash: H(2), at: 9 },
    ]);
    expect(parseLog(raw).map((r) => r.hash)).toEqual([H(2), H(1)]);
  });

  it("deduplicates by hash", () => {
    const raw = JSON.stringify([base, { ...base, symbol: "ETH" }]);
    expect(parseLog(raw)).toHaveLength(1);
  });
});

describe("record", () => {
  it("puts the newest first", () => {
    const log = record(record([], base), { ...base, hash: H(2), at: 20 });
    expect(log.map((r) => r.hash)).toEqual([H(2), H(1)]);
  });

  it("UPDATES rather than duplicating when the same hash comes back", () => {
    // A retry the wallet answered from cache, or a double render, must not
    // list one transfer twice.
    const log = record(record([], base), { ...base, amount: "0.06" });
    expect(log).toHaveLength(1);
    expect(log[0].amount).toBe("0.06");
  });

  it("ignores an unrecordable transfer instead of storing a broken row", () => {
    expect(record([], { ...base, hash: "0xnope" })).toEqual([]);
  });

  it("caps the log", () => {
    let log: TransferRecord[] = [];
    for (let i = 1; i <= MAX_RECORDS + 5; i++) log = record(log, { ...base, hash: H(i), at: i });
    expect(log).toHaveLength(MAX_RECORDS);
    expect(log[0].hash).toBe(H(MAX_RECORDS + 5));
  });
});

describe("forChain", () => {
  it("filters by chain, and returns everything without one", () => {
    const log = record(record([], base), { ...base, hash: H(2), chainId: 11155931 });
    expect(forChain(log, 5042002).map((r) => r.chainId)).toEqual([5042002]);
    expect(forChain(log)).toHaveLength(2);
  });
});
