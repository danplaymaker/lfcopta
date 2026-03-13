import type { LiverpoolPlayerRecord } from "@/lib/schemas/player.schema";
import type { PercentageStats } from "@/lib/schemas/player.schema";
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
import {
  getOptaAccessToken,
  aggregateFixtures,
  fetchMa2ForMatch,
  getMatchId,
  getFixtureKickoffDate,
  findLatestPlayedFixture,
} from "@/lib/services/opta.service";
import type { OptaFixture } from "@/lib/services/opta.service";
import { extractMatchStats, safePercent } from "@/lib/mappers/opta.mapper";
import type { MatchPlayerStats } from "@/lib/mappers/opta.mapper";

interface PlayerAggregation {
  playerId: string;
  name: string;
  season: MatchPlayerStats & { games: number };
  lastMatch: {
    matchId: string;
    date: string;
    description: string;
    stats: MatchPlayerStats;
  } | null;
  lastMatchDate: Date | null;
}

function computePercentages(s: MatchPlayerStats): PercentageStats {
  return {
    shotAccuracy: safePercent(s.shotsOnTarget, s.shots) || undefined,
    shotConversion: safePercent(s.goals, s.shots) || undefined,
    tackleWinRate: safePercent(s.tacklesWon, s.tackles) || undefined,
    passAccuracy: safePercent(s.passesCompleted, s.passes) || undefined,
    savePercentage:
      safePercent(s.saves, s.shotsOnTargetFaced) || undefined,
  };
}

function getStatValue(
  player: LiverpoolPlayerRecord,
  key: string
): number | undefined {
  const topLevel = player[key as keyof LiverpoolPlayerRecord];
  if (typeof topLevel === "number") return topLevel;
  if (player.detailedStats) {
    const detailed =
      player.detailedStats[key as keyof typeof player.detailedStats];
    if (typeof detailed === "number") return detailed;
  }
  return undefined;
}

/**
 * Stats Perform provider — fetches live data from Opta MA1/MA2 feeds,
 * aggregates season stats, and serves them through the standard provider interface.
 *
 * Required environment variables:
 * - STATSPERFORM_OUTLET_API_KEY
 * - STATSPERFORM_OUTLET_SECRET_KEY
 * - STATSPERFORM_CONTESTANT_ID
 * - STATSPERFORM_TMCL_IDS (comma-separated)
 * - STATSPERFORM_TEAM (optional, defaults to "LFC Men")
 */
export class StatsPerformProvider implements DataProvider {
  name = "statsperform";
  private cachedPlayers: LiverpoolPlayerRecord[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private getConfig() {
    const outletApiKey = process.env.STATSPERFORM_OUTLET_API_KEY;
    const outletSecretKey = process.env.STATSPERFORM_OUTLET_SECRET_KEY;
    const contestantId = process.env.STATSPERFORM_CONTESTANT_ID;
    const tmclIdsRaw = process.env.STATSPERFORM_TMCL_IDS;
    const team = (process.env.STATSPERFORM_TEAM || "LFC Men") as
      | "LFC Men"
      | "LFC Women";
    const season = process.env.STATSPERFORM_SEASON || "2025-26";

    if (!outletApiKey || !outletSecretKey || !contestantId || !tmclIdsRaw) {
      throw new Error(
        "Stats Perform provider requires STATSPERFORM_OUTLET_API_KEY, " +
          "STATSPERFORM_OUTLET_SECRET_KEY, STATSPERFORM_CONTESTANT_ID, " +
          "and STATSPERFORM_TMCL_IDS environment variables."
      );
    }

    const tmclIds = tmclIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return { outletApiKey, outletSecretKey, contestantId, tmclIds, team, season };
  }

  private async fetchAndAggregate(): Promise<LiverpoolPlayerRecord[]> {
    // Return cached data if still fresh
    if (
      this.cachedPlayers &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedPlayers;
    }

    const config = this.getConfig();
    const label = "statsperform";

    const token = await getOptaAccessToken(
      config.outletApiKey,
      config.outletSecretKey
    );

    const fixtures = await aggregateFixtures(
      config.outletApiKey,
      config.contestantId,
      config.tmclIds,
      token,
      label
    );

    const aggregations = new Map<string, PlayerAggregation>();

    for (const fx of fixtures) {
      const matchId = getMatchId(fx);
      if (!matchId) continue;

      const kickoffDate = getFixtureKickoffDate(fx);
      const dateStr = kickoffDate
        ? kickoffDate.toISOString().slice(0, 10)
        : "";

      let ma2;
      try {
        ma2 = await fetchMa2ForMatch(
          config.outletApiKey,
          matchId,
          token,
          label
        );
      } catch (err) {
        console.warn(
          `[${label}] MA2 fetch failed for ${matchId}, skipping: ${err}`
        );
        continue;
      }

      const lineups = ma2?.liveData?.lineUp || [];
      const matchDesc = ma2?.matchInfo?.description || "";

      for (const team of lineups) {
        if (team?.contestantId !== config.contestantId) continue;

        for (const pl of team.player || []) {
          const pid = pl.playerId;
          if (!pid) continue;

          const stats = extractMatchStats(pl.stat || []);

          if (!aggregations.has(pid)) {
            aggregations.set(pid, {
              playerId: pid,
              name:
                pl.matchName ||
                pl.knownName ||
                `${pl.firstName || ""} ${pl.lastName || ""}`.trim(),
              season: {
                games: 0,
                minutes: 0,
                shots: 0,
                headedShots: 0,
                goals: 0,
                shotsOnTarget: 0,
                assists: 0,
                interceptions: 0,
                tackles: 0,
                tacklesWon: 0,
                blocks: 0,
                shotsFaced: 0,
                shotsOnTargetFaced: 0,
                passes: 0,
                passesCompleted: 0,
                saves: 0,
                goalKicks: 0,
              },
              lastMatch: null,
              lastMatchDate: null,
            });
          }

          const agg = aggregations.get(pid)!;

          if (stats.minutes > 0) agg.season.games += 1;
          for (const key of Object.keys(stats) as (keyof MatchPlayerStats)[]) {
            const seasonObj = agg.season as unknown as Record<string, number>;
            seasonObj[key] = (seasonObj[key] ?? 0) + stats[key];
          }

          if (
            !agg.lastMatchDate ||
            (kickoffDate && kickoffDate > agg.lastMatchDate)
          ) {
            agg.lastMatchDate = kickoffDate;
            agg.lastMatch = {
              matchId,
              date: dateStr,
              description: matchDesc,
              stats,
            };
          }
        }
      }
    }

    // Find latest fixture for lastMatch context
    const latestFixture = findLatestPlayedFixture(fixtures);

    // Convert aggregations to player records
    const players: LiverpoolPlayerRecord[] = [];

    for (const [, agg] of aggregations) {
      const slug = agg.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const s = agg.season;
      const pct = computePercentages(s);

      const player: LiverpoolPlayerRecord = {
        playerId: agg.playerId,
        statsPerformPlayerId: agg.playerId,
        slug,
        fullName: agg.name,
        team: config.team,
        appearances: s.games,
        goals: s.goals || undefined,
        assists: s.assists || undefined,
        minutesPlayed: s.minutes || undefined,
        detailedStats: {
          shots: s.shots || undefined,
          shotsOnTarget: s.shotsOnTarget || undefined,
          headedShots: s.headedShots || undefined,
          tackles: s.tackles || undefined,
          tacklesWon: s.tacklesWon || undefined,
          interceptions: s.interceptions || undefined,
          blocks: s.blocks || undefined,
          passes: s.passes || undefined,
          passesCompleted: s.passesCompleted || undefined,
          saves: s.saves || undefined,
          shotsFaced: s.shotsFaced || undefined,
          shotsOnTargetFaced: s.shotsOnTargetFaced || undefined,
          goalKicks: s.goalKicks || undefined,
        },
        percentages: pct,
        currentSeason: {
          season: config.season,
          games: s.games,
          detailedStats: {
            shots: s.shots || undefined,
            shotsOnTarget: s.shotsOnTarget || undefined,
            headedShots: s.headedShots || undefined,
            tackles: s.tackles || undefined,
            tacklesWon: s.tacklesWon || undefined,
            interceptions: s.interceptions || undefined,
            blocks: s.blocks || undefined,
            passes: s.passes || undefined,
            passesCompleted: s.passesCompleted || undefined,
            saves: s.saves || undefined,
            shotsFaced: s.shotsFaced || undefined,
            shotsOnTargetFaced: s.shotsOnTargetFaced || undefined,
            goalKicks: s.goalKicks || undefined,
          },
          percentages: pct,
        },
        metadata: {
          source: "statsperform",
          verified: true,
          lastUpdated: new Date().toISOString(),
        },
      };

      if (agg.lastMatch) {
        const lmPct = computePercentages(agg.lastMatch.stats);
        player.lastMatch = {
          matchId: agg.lastMatch.matchId,
          date: agg.lastMatch.date,
          description: agg.lastMatch.description,
          stats: {
            goals: agg.lastMatch.stats.goals || undefined,
            assists: agg.lastMatch.stats.assists || undefined,
            shots: agg.lastMatch.stats.shots || undefined,
            shotsOnTarget: agg.lastMatch.stats.shotsOnTarget || undefined,
            headedShots: agg.lastMatch.stats.headedShots || undefined,
            tackles: agg.lastMatch.stats.tackles || undefined,
            tacklesWon: agg.lastMatch.stats.tacklesWon || undefined,
            interceptions: agg.lastMatch.stats.interceptions || undefined,
            blocks: agg.lastMatch.stats.blocks || undefined,
            passes: agg.lastMatch.stats.passes || undefined,
            passesCompleted:
              agg.lastMatch.stats.passesCompleted || undefined,
            saves: agg.lastMatch.stats.saves || undefined,
            shotsFaced: agg.lastMatch.stats.shotsFaced || undefined,
            shotsOnTargetFaced:
              agg.lastMatch.stats.shotsOnTargetFaced || undefined,
            goalKicks: agg.lastMatch.stats.goalKicks || undefined,
          },
          percentages: lmPct,
        };
      }

      players.push(player);
    }

    this.cachedPlayers = players;
    this.cacheTimestamp = Date.now();

    return players;
  }

  async getPlayers(
    query: PlayersQuery
  ): Promise<{ players: LiverpoolPlayerRecord[]; total: number }> {
    let results = await this.fetchAndAggregate();

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

  async getPlayerBySlug(slug: string): Promise<LiverpoolPlayerRecord | null> {
    const players = await this.fetchAndAggregate();
    return players.find((p) => p.slug === slug) ?? null;
  }

  async getPlayerById(id: string): Promise<LiverpoolPlayerRecord | null> {
    const players = await this.fetchAndAggregate();
    return (
      players.find(
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
    let players = await this.fetchAndAggregate();

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
      return (getStatValue(b, metric) ?? 0) - (getStatValue(a, metric) ?? 0);
    });

    return players.slice(0, query.limit ?? 20).map((player, index) => ({
      rank: index + 1,
      player,
      value: getStatValue(player, metric) ?? 0,
    }));
  }

  async comparePlayers(slugs: string[]): Promise<CompareResult> {
    const allPlayers = await this.fetchAndAggregate();
    const players = slugs
      .map((slug) => allPlayers.find((p) => p.slug === slug))
      .filter((p): p is LiverpoolPlayerRecord => p != null);

    const compareMetrics = [
      "appearances",
      "goals",
      "assists",
      "minutesPlayed",
      "shots",
      "shotsOnTarget",
      "tackles",
      "tacklesWon",
      "interceptions",
      "blocks",
      "passes",
      "passesCompleted",
      "saves",
    ];

    const metrics = compareMetrics.map((metric) => ({
      metric,
      values: players.map((p) => ({
        slug: p.slug,
        value: getStatValue(p, metric),
      })),
    }));

    return { players, metrics };
  }
}
