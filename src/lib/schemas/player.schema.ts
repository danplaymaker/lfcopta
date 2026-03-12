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

export const SeasonBreakdownSchema = z.object({
  season: z.string(),
  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
  yellowCards: z.number().optional(),
  redCards: z.number().optional(),
  minutesPlayed: z.number().optional(),
});

export const CompetitionBreakdownSchema = z.object({
  competition: z.string(),
  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
});

export const LiverpoolPlayerRecordSchema = z.object({
  playerId: z.string(),
  optaPlayerId: z.string().optional(),
  statsPerformPlayerId: z.string().optional(),
  slug: z.string(),
  fullName: z.string(),
  team: TeamSchema,

  appearances: z.number(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  cleanSheets: z.number().optional(),
  yellowCards: z.number().optional(),
  redCards: z.number().optional(),
  minutesPlayed: z.number().optional(),

  seasonBreakdown: z.array(SeasonBreakdownSchema).optional(),
  competitionBreakdown: z.array(CompetitionBreakdownSchema).optional(),

  metadata: PlayerMetadataSchema.optional(),
});

export type LiverpoolPlayerRecord = z.infer<typeof LiverpoolPlayerRecordSchema>;
