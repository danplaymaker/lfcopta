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

const COMPARE_METRICS = [
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
] as const;

/** Detailed stats live on player.detailedStats — this helper resolves them. */
function getStatValue(
  player: LiverpoolPlayerRecord,
  key: string
): number | undefined {
  // Check top-level first
  const topLevel = player[key as keyof LiverpoolPlayerRecord];
  if (typeof topLevel === "number") return topLevel;

  // Check detailedStats
  if (player.detailedStats) {
    const detailed =
      player.detailedStats[key as keyof typeof player.detailedStats];
    if (typeof detailed === "number") return detailed;
  }

  return undefined;
}

export function nullsToUndefined(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      result[k] = nullsToUndefined(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function parsePlayerRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData: any[]
): LiverpoolPlayerRecord[] {
  return rawData.map((p) => {
    const cleaned = nullsToUndefined(p as unknown as Record<string, unknown>);
    return {
      ...cleaned,
      team: p.team as LiverpoolPlayerRecord["team"],
      metadata: p.metadata
        ? {
            ...p.metadata,
            source: p.metadata.source as "mock" | "static" | "statsperform",
          }
        : undefined,
    } as LiverpoolPlayerRecord;
  });
}

export abstract class BaseJsonProvider implements DataProvider {
  abstract name: string;
  protected players: LiverpoolPlayerRecord[];

  constructor(players: LiverpoolPlayerRecord[]) {
    this.players = players;
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

    results.sort((a, b) => {
      const aVal = getStatValue(a, query.sort) ?? 0;
      const bVal = getStatValue(b, query.sort) ?? 0;
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

    players = players.filter((p) => getStatValue(p, metric) != null);

    players.sort((a, b) => {
      const aVal = getStatValue(a, metric) ?? 0;
      const bVal = getStatValue(b, metric) ?? 0;
      return bVal - aVal;
    });

    const limited = players.slice(0, query.limit ?? 20);

    return limited.map((player, index) => ({
      rank: index + 1,
      player,
      value: getStatValue(player, metric) ?? 0,
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
        value: getStatValue(p, metric),
      })),
    }));

    return { players, metrics };
  }
}
