import { describe, expect, it } from "vitest";
import { AggregatorLink, PonderLinks, PonderWssLinks } from "../../consts";
import { appConnectOrigins } from "./connectOrigins";

describe("appConnectOrigins", () => {
  const origins = appConnectOrigins();

  it("allows the aggregator the app actually calls, with or without the env override", () => {
    // AggregatorLink falls back to the production URL when NEXT_PUBLIC_AGGREGATOR_URL
    // is unset. The policy read only the variable, so production's aggregator was missing.
    expect(origins).toContain(new URL(AggregatorLink).origin);
  });

  it("allows every chain gateway, REST and websocket", () => {
    for (const url of [...Object.values(PonderLinks), ...Object.values(PonderWssLinks)]) {
      expect(origins).toContain(new URL(url).origin);
    }
  });

  it("lists origins only, once each", () => {
    for (const o of origins) expect(o).toBe(new URL(o).origin);
    expect(new Set(origins).size).toBe(origins.length);
  });
});
