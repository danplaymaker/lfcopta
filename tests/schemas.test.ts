import { describe, it, expect } from "vitest";
import { LiverpoolPlayerRecordSchema } from "@/lib/schemas/player.schema";
import { PlayersQuerySchema, LeaderboardMetricSchema } from "@/lib/schemas/query.schema";

describe("Player Schema", () => {
  it("validates a complete player record", () => {
    const player = {
      playerId: "lfc-001",
      slug: "steven-gerrard",
      fullName: "Steven Gerrard",
      team: "LFC Men",
      appearances: 710,
      goals: 186,
      assists: 145,
      metadata: {
        source: "mock",
        verified: true,
        lastUpdated: "2024-01-01",
      },
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(true);
  });

  it("rejects invalid team", () => {
    const player = {
      playerId: "lfc-001",
      slug: "test",
      fullName: "Test",
      team: "Invalid Team",
      appearances: 0,
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(false);
  });

  it("accepts minimal player record", () => {
    const player = {
      playerId: "lfc-001",
      slug: "test",
      fullName: "Test Player",
      team: "LFC Women",
      appearances: 10,
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(true);
  });

  it("validates player with detailedStats", () => {
    const player = {
      playerId: "lfc-001",
      slug: "test",
      fullName: "Test Player",
      team: "LFC Men",
      appearances: 100,
      detailedStats: {
        shots: 200,
        shotsOnTarget: 80,
        tackles: 150,
        passesCompleted: 5000,
        passes: 6000,
      },
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(true);
  });

  it("validates player with percentages", () => {
    const player = {
      playerId: "lfc-001",
      slug: "test",
      fullName: "Test Player",
      team: "LFC Men",
      appearances: 100,
      percentages: {
        shotAccuracy: 42,
        shotConversion: 13,
        tackleWinRate: 72,
        passAccuracy: 81,
        savePercentage: 79,
      },
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(true);
  });

  it("validates player with currentSeason and lastMatch", () => {
    const player = {
      playerId: "lfc-001",
      slug: "test",
      fullName: "Test Player",
      team: "LFC Men",
      appearances: 100,
      currentSeason: {
        season: "2024-25",
        games: 30,
        detailedStats: { shots: 50, tackles: 20 },
        percentages: { shotAccuracy: 40 },
      },
      lastMatch: {
        matchId: "m001",
        date: "2025-03-08",
        description: "Liverpool vs Test",
        stats: {
          goals: 1,
          assists: 0,
          shots: 3,
          shotsOnTarget: 2,
        },
        percentages: {
          shotAccuracy: 67,
          shotConversion: 33,
        },
      },
    };
    const result = LiverpoolPlayerRecordSchema.safeParse(player);
    expect(result.success).toBe(true);
  });
});

describe("PlayersQuery Schema", () => {
  it("uses defaults for empty query", () => {
    const result = PlayersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe("appearances");
      expect(result.data.order).toBe("desc");
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });
});

describe("LeaderboardMetric Schema", () => {
  it("accepts valid metrics including detailed stats", () => {
    const validMetrics = [
      "appearances",
      "goals",
      "assists",
      "cleanSheets",
      "yellowCards",
      "redCards",
      "minutesPlayed",
      "shots",
      "shotsOnTarget",
      "headedShots",
      "tackles",
      "tacklesWon",
      "interceptions",
      "blocks",
      "passes",
      "passesCompleted",
      "saves",
      "goalKicks",
    ];
    validMetrics.forEach((metric) => {
      expect(LeaderboardMetricSchema.safeParse(metric).success).toBe(true);
    });
  });

  it("rejects invalid metrics", () => {
    expect(LeaderboardMetricSchema.safeParse("invalid").success).toBe(false);
  });
});
