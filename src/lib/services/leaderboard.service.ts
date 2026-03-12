import { getProvider } from "@/lib/providers/provider.factory";
import type {
  LeaderboardMetric,
  LeaderboardQuery,
} from "@/lib/schemas/query.schema";

export async function getLeaderboard(
  metric: LeaderboardMetric,
  query: LeaderboardQuery
) {
  const provider = getProvider();
  return provider.getLeaderboard(metric, query);
}
