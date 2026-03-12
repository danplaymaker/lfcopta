import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSideEnv } from "@/lib/services/sync.service";

describe("buildSideEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns invalid when Opta credentials missing", () => {
    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Opta credentials");
    }
  });

  it("returns invalid when TMCL IDs missing", () => {
    process.env.MEN_OUTLET_API_KEY = "key";
    process.env.MEN_OUTLET_SECRET_KEY = "secret";
    process.env.MEN_OPTA_CONTESTANT_ID = "ctst123";

    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("TMCL");
    }
  });

  it("returns invalid when Webflow config missing", () => {
    process.env.MEN_OUTLET_API_KEY = "key";
    process.env.MEN_OUTLET_SECRET_KEY = "secret";
    process.env.MEN_OPTA_CONTESTANT_ID = "ctst123";
    process.env.MEN_OPTA_TOURNAMENT_CALENDAR_IDS = "tmcl1,tmcl2";

    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Webflow");
    }
  });

  it("builds valid env with all required vars", () => {
    process.env.MEN_OUTLET_API_KEY = "key";
    process.env.MEN_OUTLET_SECRET_KEY = "secret";
    process.env.MEN_OPTA_CONTESTANT_ID = "ctst123";
    process.env.MEN_OPTA_TOURNAMENT_CALENDAR_IDS = "tmcl1,tmcl2";
    process.env.MEN_WEBFLOW_COLLECTION_ID = "col123";
    process.env.WEBFLOW_API_TOKEN = "wf-token";

    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.env.TMCL_IDS).toEqual(["tmcl1", "tmcl2"]);
      expect(result.env.OPTA_CONTESTANT_ID).toBe("ctst123");
      expect(result.env.SIDE_LABEL).toBe("men");
    }
  });

  it("MEN side falls back to unprefixed env vars", () => {
    process.env.OUTLET_API_KEY = "fallback-key";
    process.env.OUTLET_SECRET_KEY = "fallback-secret";
    process.env.OPTA_CONTESTANT_ID = "fallback-ctst";
    process.env.OPTA_TOURNAMENT_CALENDAR_IDS = "tmcl-fallback";
    process.env.WEBFLOW_COLLECTION_ID = "col-fallback";
    process.env.WEBFLOW_API_TOKEN = "wf-token";

    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.env.OUTLET_API_KEY).toBe("fallback-key");
    }
  });

  it("WOMEN side does NOT fall back to unprefixed env vars for Opta", () => {
    process.env.OUTLET_API_KEY = "fallback-key";
    process.env.OUTLET_SECRET_KEY = "fallback-secret";

    const result = buildSideEnv("WOMEN", "women");
    expect(result.valid).toBe(false);
  });

  it("trims contestant ID", () => {
    process.env.MEN_OUTLET_API_KEY = "key";
    process.env.MEN_OUTLET_SECRET_KEY = "secret";
    process.env.MEN_OPTA_CONTESTANT_ID = "  ctst123  ";
    process.env.MEN_OPTA_TOURNAMENT_CALENDAR_IDS = "tmcl1";
    process.env.MEN_WEBFLOW_COLLECTION_ID = "col123";
    process.env.WEBFLOW_API_TOKEN = "wf-token";

    const result = buildSideEnv("MEN", "men");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.env.OPTA_CONTESTANT_ID).toBe("ctst123");
    }
  });
});
