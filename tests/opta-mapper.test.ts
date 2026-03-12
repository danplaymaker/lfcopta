import { describe, it, expect } from "vitest";
import {
  extractMatchStats,
  safePercent,
  SEASON_PERCENT_FIELDS,
  LAST_MATCH_PERCENT_FIELDS,
} from "@/lib/mappers/opta.mapper";

describe("extractMatchStats", () => {
  it("extracts stats from Opta stat array", () => {
    const statsArray = [
      { type: "minsPlayed", value: "90" },
      { type: "totalScoringAtt", value: "5" },
      { type: "ontargetScoringAtt", value: "3" },
      { type: "goals", value: "1" },
      { type: "goalAssist", value: "2" },
      { type: "totalTackle", value: "4" },
      { type: "wonTackle", value: "3" },
      { type: "totalPass", value: "50" },
      { type: "accuratePass", value: "42" },
    ];

    const result = extractMatchStats(statsArray);

    expect(result.minutes).toBe(90);
    expect(result.shots).toBe(5);
    expect(result.shotsOnTarget).toBe(3);
    expect(result.goals).toBe(1);
    expect(result.assists).toBe(2);
    expect(result.tackles).toBe(4);
    expect(result.tacklesWon).toBe(3);
    expect(result.passes).toBe(50);
    expect(result.passesCompleted).toBe(42);
  });

  it("handles missing stats gracefully", () => {
    const result = extractMatchStats([]);
    expect(result.minutes).toBe(0);
    expect(result.goals).toBe(0);
    expect(result.blocks).toBe(0);
  });

  it("handles null/undefined entries in stat array", () => {
    const statsArray = [
      null as unknown as { type: string; value: string },
      { type: undefined as unknown as string, value: "5" },
      { type: "goals", value: "2" },
    ];

    const result = extractMatchStats(statsArray);
    expect(result.goals).toBe(2);
  });

  it("BUG FIX: blocks adds both outfielder and scoring att blocks", () => {
    const statsArray = [
      { type: "outfielderBlock", value: "0" },
      { type: "blockedScoringAtt", value: "3" },
    ];

    const result = extractMatchStats(statsArray);
    // Old code: 0 || 3 || 0 = 3 (correct by accident)
    // But if outfielderBlock was 2: 2 || 3 || 0 = 2 (wrong, should be 5)
    expect(result.blocks).toBe(3);

    const statsArray2 = [
      { type: "outfielderBlock", value: "2" },
      { type: "blockedScoringAtt", value: "3" },
    ];

    const result2 = extractMatchStats(statsArray2);
    // New code: 2 + 3 = 5
    expect(result2.blocks).toBe(5);
  });

  it("combines inside and outside box shots faced", () => {
    const statsArray = [
      { type: "attemptsConcededIbox", value: "4" },
      { type: "attemptsConcededObox", value: "6" },
    ];

    const result = extractMatchStats(statsArray);
    expect(result.shotsFaced).toBe(10);
  });
});

describe("safePercent", () => {
  it("calculates percentage correctly", () => {
    expect(safePercent(3, 10)).toBe(30);
    expect(safePercent(1, 3)).toBe(33);
  });

  it("returns 0 for zero denominator", () => {
    expect(safePercent(5, 0)).toBe(0);
  });

  it("returns 0 for negative denominator", () => {
    expect(safePercent(5, -1)).toBe(0);
  });

  it("returns 0 for NaN inputs", () => {
    expect(safePercent(NaN, 10)).toBe(0);
    expect(safePercent(5, NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(safePercent(Infinity, 10)).toBe(0);
  });
});

describe("Webflow field mappings", () => {
  it("BUG FIX: savePercent season field is not the pass accuracy field", () => {
    expect(SEASON_PERCENT_FIELDS.savePercent).toBe("saves---season");
    expect(SEASON_PERCENT_FIELDS.savePercent).not.toBe(
      "pass-accuracy---season"
    );
  });

  it("season and last-match percent fields don't overlap", () => {
    const seasonValues = Object.values(SEASON_PERCENT_FIELDS);
    const lastMatchValues = Object.values(LAST_MATCH_PERCENT_FIELDS);

    for (const v of seasonValues) {
      expect(lastMatchValues).not.toContain(v);
    }
  });
});
