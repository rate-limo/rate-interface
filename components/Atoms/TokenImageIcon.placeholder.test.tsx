// @vitest-environment jsdom
/**
 * The icon must not render the predecessor token list's placeholder as artwork.
 *
 * `TokenImageIcon` is the choke point — Explore's table and cards, the token
 * page, the portfolio, the launch screens and the swap picker all draw a token
 * through it — so this is the single place that decides whether a coin with no
 * artwork shows the app's own mark or someone else's grey disc.
 *
 * The reason it needs a test at all is that the bad value is INDISTINGUISHABLE
 * from a good one at runtime: `.../placeholder_token.png` is a live URL serving
 * a real image, so the existing `onError` and `naturalWidth === 0` guards — which
 * catch a DEAD url — never fire for it. Nothing was broken from the browser's
 * point of view. It just rendered the wrong project's logo on every launched coin.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TokenImageIcon } from "./TokenImageIcon";
import { tokenColor } from "@/lib/swap/tokens";

afterEach(cleanup);

const LEGACY =
  "https://raw.githubusercontent.com/standardweb3/default-token-list/refs/heads/main/assets/placeholder_token.png";

/** The `<img>`, when one is drawn at all. The fallback renders the symbol's
 *  initials instead — see the component's note on why it is not the Rate mark. */
const image = (symbol: string) => screen.queryByAltText(symbol);

describe("TokenImageIcon with no artwork", () => {
  it("renders no image for the legacy standardweb3 placeholder", () => {
    render(<TokenImageIcon symbol="DOGE" color="#fff" logoURI={LEGACY} />);
    expect(image("DOGE")).toBeNull();
  });

  it("renders no image for the empty logoURI the broker now writes", () => {
    render(<TokenImageIcon symbol="SKHY" color="#fff" logoURI="" />);
    expect(image("SKHY")).toBeNull();
  });

  it("says the image is unavailable, so the state is legible and not just blank", () => {
    render(<TokenImageIcon symbol="DOGE" color="#fff" logoURI={LEGACY} />);
    expect(screen.queryByTitle("DOGE token image unavailable")).not.toBeNull();
  });

  it("still renders real artwork", () => {
    // The guard has to be narrow: this is the case that must keep working, and
    // an over-eager match here would blank every logo in the product.
    render(<TokenImageIcon symbol="SKHY" color="#fff" logoURI="/logo/abc123.webp" />);
    const img = image("SKHY");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/logo/abc123.webp");
  });

  it("falls back to the well-known logo rather than the placeholder", () => {
    // USDC carries no logoURI on the launch quote options. The placeholder used
    // to WIN over this table, because it was a non-empty string — so a token the
    // app has a real mark for still rendered the grey disc.
    render(<TokenImageIcon symbol="USDC" color="#fff" logoURI={LEGACY} />);
    const img = image("USDC");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("USDC");
  });

  it("falls back to the SYMBOL's initials, never the Rate logomark", () => {
    // The mark used to be `LogoMarkV2`, which put this venue's brand on every
    // unbranded third-party coin — the same error as the standardweb3 placeholder
    // it replaced, with our logo instead of theirs.
    render(<TokenImageIcon symbol="SKHY" color="#fff" logoURI="" />);
    expect(screen.queryByText("SK")).not.toBeNull();
    expect(document.querySelector('svg[aria-label="Rate"]')).toBeNull();
  });

  it("tints the initials from the symbol, not from the caller's `color` prop", () => {
    // Several call sites pass a literal like `#fff`, which would be white on white.
    render(<TokenImageIcon symbol="DOGE" color="#ffffff" logoURI="" />);
    const mark = screen.queryByText("DO");
    expect(mark).not.toBeNull();
    // jsdom normalises a hex to `rgb()`, so compare in that space rather than
    // asserting on the literal the component wrote.
    const [, r, g, b] = /^#(..)(..)(..)$/.exec(tokenColor("DOGE")) as RegExpExecArray;
    const expected = `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
    expect(mark?.getAttribute("style")).toContain(expected);
    expect(mark?.getAttribute("style")).not.toContain("255, 255, 255");
  });
});
