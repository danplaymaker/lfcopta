import { describe, expect, it } from "vitest";
import { isNewerPlayedMatch } from "@/lib/services/sync.service";

const oct18 = new Date("2026-10-18T14:00:00Z");
const oct25 = new Date("2026-10-25T14:00:00Z");

describe("isNewerPlayedMatch", () => {
  it("ignores matches where the player was an unused substitute", () => {
    expect(isNewerPlayedMatch(0, oct25, oct18)).toBe(false);
    expect(isNewerPlayedMatch(0, oct25, null)).toBe(false);
  });

  it("takes the first played match when none is set yet", () => {
    expect(isNewerPlayedMatch(12, oct18, null)).toBe(true);
  });

  it("only replaces the last match with a later one", () => {
    expect(isNewerPlayedMatch(90, oct25, oct18)).toBe(true);
    expect(isNewerPlayedMatch(90, oct18, oct25)).toBe(false);
  });
});
