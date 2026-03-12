import { z } from "zod/v4";

export const LeaderboardMetrics = [
  "appearances",
  "goals",
  "assists",
  "cleanSheets",
  "yellowCards",
  "redCards",
  "minutesPlayed",
  // Detailed stats from Opta
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
] as const;

export const LeaderboardMetricSchema = z.enum(LeaderboardMetrics);
export type LeaderboardMetric = z.infer<typeof LeaderboardMetricSchema>;

export const SortOrder = z.enum(["asc", "desc"]).default("desc");

export const PlayersQuerySchema = z.object({
  team: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().default("appearances"),
  order: SortOrder,
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PlayersQuery = z.infer<typeof PlayersQuerySchema>;

export const LeaderboardQuerySchema = z.object({
  team: z.string().optional(),
  limit: z.coerce.number().int().positive().default(20),
  verifiedOnly: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

export const CompareQuerySchema = z.object({
  players: z.string().min(1),
});
export type CompareQuery = z.infer<typeof CompareQuerySchema>;
