// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FillRing } from "./FillRing";

afterEach(cleanup);

const arc = () => document.querySelectorAll("circle")[1] as SVGCircleElement | undefined;

describe("FillRing", () => {
  it("draws no arc at 0% and an arc proportional to the fill", () => {
    render(<FillRing progress={{ kind: "exact", percent: 0 }} />);
    expect(arc()).toBeUndefined();
    cleanup();
    render(<FillRing progress={{ kind: "exact", percent: 50 }} />);
    const [len, total] = arc()!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
    expect(len / total).toBeCloseTo(0.5, 5);
  });

  it("never closes on an open order, even at ≈100%", () => {
    render(<FillRing progress={{ kind: "exact", percent: 99.999 }} />);
    const [len, total] = arc()!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
    expect(len / total).toBeLessThanOrEqual(0.9 + 1e-9); // float: 0.9 of the circle reads back as 0.9000000000000001
  });

  it("shows a sliver for a tiny real fill, and a dashed empty ring when unknown", () => {
    render(<FillRing progress={{ kind: "exact", percent: 0.3 }} />);
    expect(arc()).toBeDefined();
    cleanup();
    render(<FillRing progress={{ kind: "unknown" }} />);
    expect(arc()).toBeUndefined();
    expect(document.querySelector("circle")!.getAttribute("stroke-dasharray")).toBe("2 2");
  });
});
