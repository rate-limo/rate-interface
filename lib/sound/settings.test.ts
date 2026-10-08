import { describe, expect, it } from "vitest";
import { DEFAULT_SOUND, parseSoundSettings } from "./settings";

describe("parseSoundSettings", () => {
  it("ships on at 40%", () => {
    expect(DEFAULT_SOUND).toEqual({ enabled: true, volume: 0.4 });
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND);
  });

  it("reads a stored choice", () => {
    expect(parseSoundSettings('{"enabled":false,"volume":0.7}')).toEqual({ enabled: false, volume: 0.7 });
  });

  it("treats a hand-edited value as the default, field by field", () => {
    expect(parseSoundSettings("not json")).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('{"enabled":"no","volume":9}')).toEqual({ enabled: true, volume: 1 });
    expect(parseSoundSettings('{"enabled":false,"volume":-2}')).toEqual({ enabled: false, volume: 0 });
    expect(parseSoundSettings("null")).toEqual(DEFAULT_SOUND);
  });
});
