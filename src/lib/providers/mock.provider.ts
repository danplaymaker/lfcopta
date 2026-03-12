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
import mockData from "@/data/mock-players.json";

const COMPARE_METRICS = [
  "appearances",
  "goals",
  "assists",
  "cleanSheets",
  "yellowCards",
  "redCards",
  "minutesPlayed",
] as const;

function loadPlayers(): LiverpoolPlayerRecord[] {
  return mockData.map((p) => ({
    ...p,
    team: p.team as LiverpoolPlayerRecord["team"],
    cleanSheets: p.cleanSheets ?? undefined,
    metadata: p.metadata
      ? {
          ...p.metadata,
          source: p.metadata.source as "mock" | "static" | "statsperform",
        }
      : undefined,
  }));
}

export class MockProvider implements DataProvider {
  name = "mock";
  private players: LiverpoolPlayerRecord[];

  constructor() {
    this.players = loadPlayers();
  }

  async getPlayers(query: PlayersQuery) {
    let results = [...this.players];

    if (query.team) {
      const teamLower = query.team.toLowerCase();
      results = results.filter((p) => {
        if (teamLower === "men") return p.team === "LFC Men";
        if (teamLower === "women") return p.team === "LFC Women";
        return p.team.toLowerCase().includes(teamLower);
      });
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter((p) =>
        p.fullName.toLowerCase().includes(searchLower)
      );
    }

    const sortKey = query.sort as keyof LiverpoolPlayerRecord;
    results.sort((a, b) => {
      const aVal = (a[sortKey] as number) ?? 0;
      const bVal = (b[sortKey] as number) ?? 0;
      return query.order === "desc" ? bVal - aVal : aVal - bVal;
    });

    const total = results.length;
    const paged = results.slice(query.offset, query.offset + query.limit);

    return { players: paged, total };
  }

  async getPlayerBySlug(slug: string) {
    return this.players.find((p) => p.slug === slug) ?? null;
  }

  async getPlayerById(id: string) {
    return (
      this.players.find(
        (p) =>
          p.playerId === id ||
          p.optaPlayerId === id ||
          p.statsPerformPlayerId === id
      ) ?? null
    );
  }

  async getLeaderboard(
    metric: LeaderboardMetric,
    query: LeaderboardQuery
  ): Promise<LeaderboardEntry[]> {
    let players = [...this.players];

    if (query.team) {
      const teamLower = query.team.toLowerCase();
      players = players.filter((p) => {
        if (teamLower === "men") return p.team === "LFC Men";
        if (teamLower === "women") return p.team === "LFC Women";
        return p.team.toLowerCase().includes(teamLower);
      });
    }

    if (query.verifiedOnly) {
      players = players.filter((p) => p.metadata?.verified === true);
    }

    players = players.filter(
      (p) => (p[metric as keyof LiverpoolPlayerRecord] as number) != null
    );

    players.sort((a, b) => {
      const aVal = (a[metric as keyof LiverpoolPlayerRecord] as number) ?? 0;
      const bVal = (b[metric as keyof LiverpoolPlayerRecord] as number) ?? 0;
      return bVal - aVal;
    });

    const limited = players.slice(0, query.limit ?? 20);

    return limited.map((player, index) => ({
      rank: index + 1,
      player,
      value: (player[metric as keyof LiverpoolPlayerRecord] as number) ?? 0,
    }));
  }

  async comparePlayers(slugs: string[]): Promise<CompareResult> {
    const players = slugs
      .map((slug) => this.players.find((p) => p.slug === slug))
      .filter((p): p is LiverpoolPlayerRecord => p != null);

    const metrics = COMPARE_METRICS.map((metric) => ({
      metric,
      values: players.map((p) => ({
        slug: p.slug,
        value: p[metric as keyof LiverpoolPlayerRecord] as number | undefined,
      })),
    }));

    return { players, metrics };
  }
}
