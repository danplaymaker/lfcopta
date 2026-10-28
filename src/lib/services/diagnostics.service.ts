/**
 * Read-only diagnostics: raw Opta MA2 season totals per player, so the
 * values the sync writes to Webflow can be checked against the source.
 */

import type { SideEnv } from "@/lib/schemas/opta.schema";
import {
  aggregateFixtures,
  fetchMa2ForMatch,
  getMatchId,
  getFixtureKickoffDate,
} from "./opta.service";

export interface RawPlayerSeason {
  playerId: string;
  name: string;
  matchesInLineup: number;
  matchesWithMinutes: number;
  stats: Record<string, number>;
}

export interface RawSeasonReport {
  fixturesFound: number;
  matchesWithData: number;
  matchErrors: number;
  teamCleanSheets: number;
  matches: Array<{ matchId: string; date: string; description: string }>;
  players: RawPlayerSeason[];
}

export async function buildRawSeasonReport(
  env: SideEnv,
  token: string
): Promise<RawSeasonReport> {
  const fixtures = await aggregateFixtures(
    env.OUTLET_API_KEY,
    env.OPTA_CONTESTANT_ID,
    env.TMCL_IDS,
    token,
    env.SIDE_LABEL
  );

  const players = new Map<string, RawPlayerSeason>();
  const matches: RawSeasonReport["matches"] = [];
  let matchErrors = 0;
  let teamCleanSheets = 0;

  for (const fx of fixtures) {
    const matchId = getMatchId(fx);
    const kickoff = getFixtureKickoffDate(fx);
    if (!matchId || !kickoff || kickoff > new Date()) continue;

    let ma2;
    try {
      ma2 = await fetchMa2ForMatch(env.OUTLET_API_KEY, matchId, token, env.SIDE_LABEL);
    } catch {
      matchErrors++;
      continue;
    }

    const team = (ma2.liveData?.lineUp ?? []).find(
      (t) => t.contestantId === env.OPTA_CONTESTANT_ID
    );
    if (!team) continue;

    matches.push({
      matchId,
      date: kickoff.toISOString().slice(0, 10),
      description: ma2.matchInfo?.description ?? "",
    });

    let teamConceded = 0;
    for (const pl of team.player ?? []) {
      if (!pl.playerId) continue;
      const stats: Record<string, number> = {};
      for (const s of pl.stat ?? []) {
        if (!s.type) continue;
        const v = Number(s.value);
        stats[s.type] = Number.isNaN(v) ? 0 : v;
      }
      if ((stats.goalsConceded ?? 0) > teamConceded) {
        teamConceded = stats.goalsConceded ?? 0;
      }

      const entry =
        players.get(pl.playerId) ??
        ({
          playerId: pl.playerId,
          name:
            pl.matchName ||
            pl.knownName ||
            `${pl.firstName ?? ""} ${pl.lastName ?? ""}`.trim(),
          matchesInLineup: 0,
          matchesWithMinutes: 0,
          stats: {},
        } satisfies RawPlayerSeason);

      entry.matchesInLineup++;
      if ((stats.minsPlayed ?? 0) > 0) entry.matchesWithMinutes++;
      for (const [k, v] of Object.entries(stats)) {
        entry.stats[k] = (entry.stats[k] ?? 0) + v;
      }
      players.set(pl.playerId, entry);
    }
    if (teamConceded === 0) teamCleanSheets++;
  }

  return {
    fixturesFound: fixtures.length,
    matchesWithData: matches.length,
    matchErrors,
    teamCleanSheets,
    matches: matches.sort((a, b) => a.date.localeCompare(b.date)),
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
