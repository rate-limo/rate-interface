import { describe, expect, it } from "vitest";
import { ladderCanConvert } from "./wall";

const B = (n: number) => BigInt(n);

describe("ladderCanConvert", () => {
  /*
   * The conversion walks the WHOLE ladder, not the band being deposited into, so
   * one band holding the payout token is enough — and the target band holding
   * none of it is not a refusal.
   */
  it("is true when any band holds the token being converted into", () => {
    expect(
      ladderCanConvert(
        [
          { baseReserve: B(0), quoteReserve: B(0) },
          { baseReserve: B(50), quoteReserve: B(0) },
        ],
        false,
      ),
    ).toBe(true);
  });

  /*
   * The case that reverts `NoLiquidity()`, knowable before an approval is spent:
   * nothing anywhere in the ladder can pay out. This is the ONE state where a
   * single-sided deposit has to take the wall — converting cannot run at all.
   */
  it("is false when no band holds it anywhere", () => {
    expect(
      ladderCanConvert(
        [
          { baseReserve: B(0), quoteReserve: B(90) },
          { baseReserve: B(0), quoteReserve: B(10) },
        ],
        false,
      ),
    ).toBe(false);
  });

  it("reads the other direction off the other reserve", () => {
    const ladder = [{ baseReserve: B(0), quoteReserve: B(90) }];
    expect(ladderCanConvert(ladder, true)).toBe(true); // base in, quote out
    expect(ladderCanConvert(ladder, false)).toBe(false); // quote in, no base to give
  });

  /*
   * A confirmed "yes" outranks an unread band — one payout reserve is all the
   * walk needs, so a missing read cannot turn a possible conversion into an
   * unknown one.
   */
  it("is true on a known payout even when another band is unread", () => {
    expect(ladderCanConvert([{}, { baseReserve: B(5), quoteReserve: B(5) }], false)).toBe(true);
  });

  it("is null when nothing is known and nothing is confirmed", () => {
    expect(ladderCanConvert([{}, {}], true)).toBe(null);
    expect(ladderCanConvert([], true)).toBe(null);
  });

  /* It answers "anywhere to convert into", never "will my whole half fill". */
  it("says nothing about size — one unit of payout is still true", () => {
    expect(ladderCanConvert([{ baseReserve: B(1), quoteReserve: B(0) }], false)).toBe(true);
  });
});
