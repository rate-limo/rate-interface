// @vitest-environment jsdom
/**
 * Flipping the pair retires the amount it was denominated in.
 *
 * `lib/swap/wrap.test.ts` pins the RULE — `payChangeClearsAmount` — but a rule
 * nothing calls is still a bug, and the four pay-side paths that call it were
 * covered by typecheck and build alone. This mounts the real card and presses
 * the real button, which is the only thing that proves the wire exists.
 *
 * `variant="preview"` because that is the configuration in which the card needs
 * nothing standing behind it: the live token query, both balance reads and the
 * route quote are all disabled, and it opens with BOTH legs chosen and a
 * non-zero amount — which is precisely the state this bug needs. The one thing
 * still required is `Providers`, for wagmi's hooks.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The card reads the router to re-home itself on a cross-chain pick. Nothing
// here navigates; this exists so the hooks resolve outside an app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/trade",
  useSearchParams: () => new URLSearchParams(),
}));

import Providers from "@/lib/providers";
import { SwapCard } from "./SwapCard";

afterEach(cleanup);

function mountCard() {
  return render(
    <Providers>
      <SwapCard networkName="RISE Testnet" networkSlug="rise" variant="preview" />
    </Providers>,
  );
}

const amountField = () => screen.getByTestId("swap-pay-amount") as HTMLInputElement;
const slider = () => screen.getByLabelText("Amount to pay") as HTMLInputElement;
const flipButton = () => screen.getByLabelText("Flip pay and receive");

describe("flipping the pair", () => {
  it("opens with an amount, so the test below is about a real transition", () => {
    mountCard();
    expect(Number(amountField().value)).toBeGreaterThan(0);
  });

  it("clears the typed amount", () => {
    mountCard();
    fireEvent.click(flipButton());
    // The number was a quantity of the OLD pay token. Keeping it left the
    // slider re-scaled against a balance it was never sized against.
    expect(amountField().value).toBe("");
  });

  it("returns the slider to the bottom of its track", () => {
    mountCard();
    const before = Number(slider().value);
    expect(before).toBeGreaterThan(0);

    fireEvent.click(flipButton());

    // This is the visible half of the bug: the thumb used to re-scale against
    // the new token's balance and commonly pin at 100% while the field above it
    // went on showing the old number.
    expect(Number(slider().value)).toBe(Number(slider().min));
  });

  it("still clears an amount the user typed rather than only the seeded one", () => {
    mountCard();
    fireEvent.change(amountField(), { target: { value: "0.42" } });
    expect(amountField().value).toBe("0.42");

    fireEvent.click(flipButton());

    expect(amountField().value).toBe("");
  });

  it("actually swaps the legs, so the reset is not the only thing that happened", () => {
    mountCard();
    // The two balance rows name their own leg's token — the pay row first. In
    // preview the FIGURES are positional constants, so only the symbols move,
    // which is exactly the signal wanted here.
    const symbols = () =>
      screen
        .getAllByText(/^Balance /)
        .map((node) => node.textContent?.trim().split(/\s+/).at(-1));

    const before = symbols();
    expect(before).toHaveLength(2);
    expect(before[0]).not.toBe(before[1]);

    fireEvent.click(flipButton());

    expect(symbols()).toEqual([before[1], before[0]]);
  });
});
