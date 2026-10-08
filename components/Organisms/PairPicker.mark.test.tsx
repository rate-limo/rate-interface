// @vitest-environment jsdom
/**
 * Pro's market list draws the PAIR, not one leg of it.
 *
 * `Row` rendered a single `TokenImageIcon` for the base token beside a label
 * naming the full `BASE/QUOTE`, which is least useful exactly where it is most
 * needed: this list is what a reader scans to tell two markets apart, and the
 * ones that share a base differ only in what they are quoted against. It also
 * hardcoded `logoURI={undefined}`, so every row rendered as hued initials while
 * the artwork sat on the `SpotPair` two functions upstream.
 *
 * `lib/markets/pickerRow.test.ts` pins that `toPickerRow` carries the logos.
 * This pins that the row actually draws them.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Row } from "./PairPicker";
import type { PickerRow } from "@/lib/markets/pickerRow";

afterEach(cleanup);

const row = (over: Partial<PickerRow> = {}): PickerRow => ({
  id: "0xpair",
  symbol: "TITER/USDC",
  baseSymbol: "TITER",
  quoteSymbol: "USDC",
  baseLogoURI: "https://cdn.example/titer.png",
  quoteLogoURI: "https://cdn.example/usdc.png",
  price: 1.0210236,
  changePct: 0.02,
  volumeUsd: 1_000,
  quoteTvlUsd: 500,
  unlisted: false,
  ...over,
});

function renderRow(over: Partial<PickerRow> = {}) {
  return render(
    <Row row={row(over)} href="/trade/pro" chainName="Arc Testnet" />,
  );
}

describe("a market row's mark", () => {
  it("names BOTH tokens, so two markets sharing a base are distinguishable", () => {
    renderRow();
    // `PairImageIcon` labels itself with the pair; a single-token mark would
    // carry one symbol and no slash.
    expect(screen.getByRole("img", { name: "TITER/USDC" })).toBeTruthy();
  });

  it("draws the artwork the row carries, rather than hued initials", () => {
    const { container } = renderRow();
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toContain("https://cdn.example/titer.png");
    expect(sources).toContain("https://cdn.example/usdc.png");
  });

  it("falls back without artwork instead of rendering a broken image", () => {
    const { container } = renderRow({ baseLogoURI: undefined, quoteLogoURI: undefined });
    // No `<img src="">` — that request resolves to the PAGE, which succeeds, so
    // `onError` never fires and no fallback mark can win against it.
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources.some((src) => !src)).toBe(false);
    // The mark is still there, still naming both legs.
    expect(screen.getByRole("img", { name: "TITER/USDC" })).toBeTruthy();
  });

  it("carries the network chip every other market mark carries", () => {
    renderRow();
    expect(screen.getByText("AT")).toBeTruthy();
  });

  it("still flags an unlisted market", () => {
    renderRow({ unlisted: true });
    expect(screen.getByText("Unlisted")).toBeTruthy();
  });
});
