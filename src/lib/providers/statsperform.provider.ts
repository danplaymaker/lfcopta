import type { LiverpoolPlayerRecord } from "@/lib/schemas/player.schema";
import type {
  LeaderboardMetric,
  PlayersQuery,
  LeaderboardQuery,
} from "@/lib/schemas/query.schema";
import type {
  DataProvider,
  LeaderboardEntry,
  CompareResult,
} from "./provider.types";

// Placeholder provider for future Stats Perform integration.
// When access is granted, this will handle authentication,
// data fetching, and mapping to the normalised player model.
export class StatsPerformProvider implements DataProvider {
  name = "statsperform";

  async getPlayers(
    _query: PlayersQuery
  ): Promise<{ players: LiverpoolPlayerRecord[]; total: number }> {
    throw new Error(
      "Stats Perform provider is not yet configured. Set DATA_PROVIDER=mock to use mock data."
    );
  }

  async getPlayerBySlug(_slug: string): Promise<LiverpoolPlayerRecord | null> {
    throw new Error("Stats Perform provider is not yet configured.");
  }

  async getPlayerById(_id: string): Promise<LiverpoolPlayerRecord | null> {
    throw new Error("Stats Perform provider is not yet configured.");
  }

  async getLeaderboard(
    _metric: LeaderboardMetric,
    _query: LeaderboardQuery
  ): Promise<LeaderboardEntry[]> {
    throw new Error("Stats Perform provider is not yet configured.");
  }

  async comparePlayers(_slugs: string[]): Promise<CompareResult> {
    throw new Error("Stats Perform provider is not yet configured.");
  }
}
