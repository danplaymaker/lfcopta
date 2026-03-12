import { z } from "zod/v4";

export const TeamSchema = z.enum(["LFC Men", "LFC Women"]);
export type Team = z.infer<typeof TeamSchema>;

export const DataSourceSchema = z.enum(["mock", "static", "statsperform"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const PlayerMetadataSchema = z.object({
  source: DataSourceSchema,
  verified: z.boolean(),
  lastUpdated: z.string().optional(),
});

// ── Detailed match/season stats (from Opta MA2) ──

export const DetailedStatsSchema = z.object({
  shots: z.number().optional(),
  shotsOnTarget: z.number().optional(),
  headedShots: z.number().optional(),
  tackles: z.number().optional(),
  tacklesWon: z.number().optional(),
  interceptions: z.number().optional(),
  blocks: z.number().optional(),
  passes: z.number().optional(),
  passesCompleted: z.number().optional(),
  saves: z.number().optional(),
  shotsFaced: z.number().optional(),
  shotsOnTargetFaced: z.number().optional(),
  goalKicks: z.number().optional(),
});

export type DetailedStats = z.infer<typeof DetailedStatsSchema>;

// ── Calculated percentages ──

export const PercentageStatsSchema = z.object({
  shotAccuracy: z.number().optional(),
  shotConversion: z.number().optional(),
  tackleWinRate: z.number().optional(),
  passAccuracy: z.number().optional(),
  savePercentage: z.number().optional(),
});

export type PercentageStats = z.infer<typeof PercentageStatsSchema>;

// ── Last match snapshot ──

export const LastMatchSchema = z.object({
  matchId: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  stats: DetailedStatsSchema.extend({
    goals: z.number().optional(),
    assists: z.number().optional(),
  }).optional(),
  percentages: PercentageStatsSchema.optional(),
});

export type LastMatch = z.infer<typeof LastMatchSchema>;

// ── Season breakdown ──

export const SeasonBreakdownSchema = z.object({
  season: z.string(),
  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
  yellowCards: z.number().optional(),
  redCards: z.number().optional(),
  minutesPlayed: z.number().optional(),
  detailedStats: DetailedStatsSchema.optional(),
});

export const CompetitionBreakdownSchema = z.object({
  competition: z.string(),
  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
});

// ── Main player record ──

export const LiverpoolPlayerRecordSchema = z.object({
  playerId: z.string(),
  optaPlayerId: z.string().optional(),
  statsPerformPlayerId: z.string().optional(),
  slug: z.string(),
  fullName: z.string(),
  team: TeamSchema,

  // Core career stats
  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
  yellowCards: z.number().optional(),
  redCards: z.number().optional(),
  minutesPlayed: z.number().optional(),

  // Detailed stats (from Opta MA2 aggregation)
  detailedStats: DetailedStatsSchema.optional(),

  // Calculated percentages
  percentages: PercentageStatsSchema.optional(),

  // Current season stats
  currentSeason: z
    .object({
      season: z.string(),
      games: z.number(),
      detailedStats: DetailedStatsSchema.optional(),
      percentages: PercentageStatsSchema.optional(),
    })
    .optional(),

  // Last match snapshot
  lastMatch: LastMatchSchema.optional(),

  // Historical breakdowns
  seasonBreakdown: z.array(SeasonBreakdownSchema).optional(),
  competitionBreakdown: z.array(CompetitionBreakdownSchema).optional(),

  metadata: PlayerMetadataSchema.optional(),
});

export type LiverpoolPlayerRecord = z.infer<typeof LiverpoolPlayerRecordSchema>;
