import { describe, expect, it } from "vitest";
import { graduationPanelAction } from "./graduationPanel";

describe("graduationPanelAction", () => {
  it("selling: no button, names the current step", () => {
    const a = graduationPanelAction("selling", 0, 100, { stepsSold: 2 });
    expect(a.kind).toBe("selling");
    expect(a.title).toBe("Step 3 of 5");
    expect("button" in a).toBe(false);
  });

  it("all steps sold and not armed: offers Arm graduation", () => {
    const a = graduationPanelAction("armable", 0, 100, { stepsSold: 5 });
    expect(a).toMatchObject({ kind: "arm", button: "Arm graduation" });
  });

  it("armed before readyAt: a countdown, no button", () => {
    const a = graduationPanelAction("armed", 400, 208, { stepsSold: 5 });
    expect(a).toMatchObject({ kind: "wait", secondsLeft: 192, title: "Graduating in 3:12" });
    expect("button" in a).toBe(false);
  });

  it("at or after readyAt: offers Graduate", () => {
    expect(graduationPanelAction("ready", 400, 400, { stepsSold: 5 })).toMatchObject({ kind: "graduate", button: "Graduate" });
  });

  it("graduated: done, with the pool value when known", () => {
    expect(graduationPanelAction("graduated", 0, 1, { stepsSold: 5, poolValue: "$3.1K" }).title).toBe("Graduated · pool $3.1K");
    expect(graduationPanelAction("graduated", 0, 1, { stepsSold: 5 }).title).toBe("Graduated");
  });
});
