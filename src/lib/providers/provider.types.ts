import type { LiverpoolPlayerRecord } from "@/lib/schemas/player.schema";
import type {
  LeaderboardMetric,
  PlayersQuery,
  LeaderboardQuery,
} from "@/lib/schemas/query.schema";

export interface LeaderboardEntry {
  rank: number;
  player: LiverpoolPlayerRecord;
  value: number;
}

export interface CompareResult {
  players: LiverpoolPlayerRecord[];
  metrics: {
    metric: string;
    values: { slug: string; value: number | undefined }[];
  }[];
}

export interface DataProvider {
  name: string;
  getPlayers(query: PlayersQuery): Promise<{
    players: LiverpoolPlayerRecord[];
    total: number;
  }>;
  getPlayerBySlug(slug: string): Promise<LiverpoolPlayerRecord | null>;
  getPlayerById(id: string): Promise<LiverpoolPlayerRecord | null>;
  getLeaderboard(
    metric: LeaderboardMetric,
    query: LeaderboardQuery
  ): Promise<LeaderboardEntry[]>;
  comparePlayers(slugs: string[]): Promise<CompareResult>;
}
