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
  it("accepts valid metrics", () => {
    const validMetrics = [
      "appearances",
      "goals",
      "assists",
      "cleanSheets",
      "yellowCards",
      "redCards",
      "minutesPlayed",
    ];
    validMetrics.forEach((metric) => {
      expect(LeaderboardMetricSchema.safeParse(metric).success).toBe(true);
    });
  });

  it("rejects invalid metrics", () => {
    expect(LeaderboardMetricSchema.safeParse("invalid").success).toBe(false);
  });
});
