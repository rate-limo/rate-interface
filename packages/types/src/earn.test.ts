/** Referral fee → points conversion. No database, no network.
 *
 * packages/types/node_modules/.bin/tsx --test src/earn.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EARN_CONFIG_DEFAULTS,
  REFERRAL_REFERENCE_FEE_BPS,
  referralPointsForFee,
  takerFeeUsd,
  type TakerFeeTrade,
} from "./earn";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} !≈ ${expected}`);

const trade = (over: Partial<TakerFeeTrade> = {}): TakerFeeTrade => ({
  isBid: true,
  baseAmount: 100,
  quoteAmount: 2_000,
  baseFee: 0.1,
  quoteFee: 2,
  valueUSD: 2_000,
  ...over,
});

test("a bid's taker pays baseFee, priced by the base leg's share of valueUSD", () => {
  // 0.1 base of 100 base = 0.1% of a $2,000 leg.
  close(takerFeeUsd(trade({ quoteFee: 999 }))!, 2);
});

test("an ask's taker pays quoteFee, priced by the quote leg", () => {
  // 5 quote of 2,000 quote = 0.25% of $2,000.
  close(takerFeeUsd(trade({ isBid: false, quoteFee: 5, baseFee: 999 }))!, 5);
});

test("a zero fee is a priced zero, not unpriced", () => {
  assert.equal(takerFeeUsd(trade({ baseFee: 0 })), 0);
});

test("anything unpriceable is null, never $0", () => {
  assert.equal(takerFeeUsd(trade({ valueUSD: null })), null);
  assert.equal(takerFeeUsd(trade({ valueUSD: 0 })), null);
  assert.equal(takerFeeUsd(trade({ valueUSD: -1 })), null);
  assert.equal(takerFeeUsd(trade({ baseAmount: null })), null);
  assert.equal(takerFeeUsd(trade({ baseAmount: 0 })), null);
  assert.equal(takerFeeUsd(trade({ isBid: false, quoteAmount: 0 })), null);
  // A band-pool swap records no fee at all.
  assert.equal(takerFeeUsd(trade({ baseFee: null, quoteFee: null })), null);
  assert.equal(takerFeeUsd(trade({ isBid: null })), null);
  assert.equal(takerFeeUsd(trade({ baseFee: -0.1 })), null);
  assert.equal(takerFeeUsd(trade({ baseFee: Number.NaN })), null);
  assert.equal(takerFeeUsd(trade({ valueUSD: Number.NaN })), null);
});

test("the reference fee is 0.1%", () => {
  assert.equal(REFERRAL_REFERENCE_FEE_BPS, 10);
});

test("at the 0.1% reference fee a 50% cut pays half the referee's own trading points", () => {
  for (const [valueUSD, multiplier] of [
    [1_000, 1],
    [2_500, 2],
    [37.5, 1.5],
  ]) {
    const feeUsd = 0.001 * valueUSD;
    // The referee's own trading points for the trade are valueUSD × multiplier.
    close(referralPointsForFee(feeUsd, multiplier, 5_000), 0.5 * valueUSD * multiplier);
  }
});

test("a 1% fee pays ten times that — 5× the referee's own points", () => {
  const valueUSD = 1_000;
  const multiplier = 2;
  close(referralPointsForFee(0.01 * valueUSD, multiplier, 5_000), 5 * valueUSD * multiplier);
});

test("the two compose: a priced fill converts straight to points", () => {
  // 0.1% taker fee on a $2,000 bid.
  const fee = takerFeeUsd(trade())!;
  close(referralPointsForFee(fee, 1, EARN_CONFIG_DEFAULTS.referralCutBps), 500);
});

test("non-finite or non-positive inputs yield 0 points", () => {
  assert.equal(referralPointsForFee(0, 1, 5_000), 0);
  assert.equal(referralPointsForFee(-1, 1, 5_000), 0);
  assert.equal(referralPointsForFee(Number.NaN, 1, 5_000), 0);
  assert.equal(referralPointsForFee(Number.POSITIVE_INFINITY, 1, 5_000), 0);
  assert.equal(referralPointsForFee(1, -1, 5_000), 0);
  assert.equal(referralPointsForFee(1, Number.NaN, 5_000), 0);
  assert.equal(referralPointsForFee(1, 1, 0), 0);
  assert.equal(referralPointsForFee(1, 1, -5_000), 0);
  assert.equal(referralPointsForFee(Number.MAX_VALUE, Number.MAX_VALUE, 5_000), 0);
});

test("at the 25% base a referrer earns a quarter of the referee's points, 2.5x on a 1% fee", () => {
  const valueUSD = 1_000;
  close(referralPointsForFee(0.001 * valueUSD, 1, 2_500), 0.25 * valueUSD);
  close(referralPointsForFee(0.01 * valueUSD, 1, 2_500), 2.5 * valueUSD);
});

test("the shipped default is a quarter of taker fees, with the boost retired", () => {
  assert.equal(EARN_CONFIG_DEFAULTS.referralCutBps, 2_500);
  // Affiliate invitees get a quarter of their own taker fees back as points.
  assert.equal(EARN_CONFIG_DEFAULTS.affiliateInviteeRebateBps, 2_500);
  assert.equal(EARN_CONFIG_DEFAULTS.boostBpsPerAttestedReferee, 0);
  assert.equal(EARN_CONFIG_DEFAULTS.maxBoostBps, 0);
});
