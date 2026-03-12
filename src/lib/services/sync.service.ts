/**
 * Sync orchestration: Opta → Webflow pipeline.
 *
 * Coordinates fetching from Opta MA1/MA2, aggregating season stats,
 * and pushing to Webflow CMS.
 */

import type { SideEnv, SyncMode } from "@/lib/schemas/opta.schema";
import {
  getOptaAccessToken,
  aggregateFixtures,
  fetchMa2ForMatch,
  getMatchId,
  getFixtureKickoffDate,
  findLatestPlayedFixture,
} from "./opta.service";
import type { OptaFixture } from "./opta.service";
import {
  fetchAllWebflowItems,
  updateWebflowItem,
  publishWebflowSite,
  buildWebflowIndex,
} from "./webflow.service";
import {
  extractMatchStats,
  safePercent,
  SEASON_TOTAL_FIELDS,
  SEASON_PERCENT_FIELDS,
  LAST_MATCH_PERCENT_FIELDS,
} from "@/lib/mappers/opta.mapper";
import type { MatchPlayerStats } from "@/lib/mappers/opta.mapper";

// ── Types ──

interface PlayerSeasonAgg {
  name: string;
  season: MatchPlayerStats & { games: number };
  lastMatch: {
    name: string;
    matchId: string;
    date: string;
    stats: MatchPlayerStats;
  };
  lastMatchDate: Date | null;
}

interface SyncResult {
  label: string;
  skipped?: boolean;
  reason?: string;
  mode?: string;
  season?: {
    seasonPlayers: number;
    updatedPlayers: number;
    unmatched: Array<{ playerId: string; name: string }>;
  };
  ma2?: {
    updatedPlayers: number;
    unmatched: Array<{ playerId: string; name: string }>;
  };
  latest?: {
    matchId: string;
    fixture: OptaFixture;
    ma2: unknown;
  };
  siteId?: string;
}

export type { SyncResult };

// ── Season aggregation from MA2 ──

/**
 * BUG FIX: Per-match error handling — one failed MA2 doesn't kill the pipeline.
 * BUG FIX: lastMatch is tracked by date, not by iteration order.
 */
async function aggregateMa2Season(
  env: SideEnv,
  token: string,
  label: string
): Promise<Map<string, PlayerSeasonAgg>> {
  const fixtures = await aggregateFixtures(
    env.OUTLET_API_KEY,
    env.OPTA_CONTESTANT_ID,
    env.TMCL_IDS,
    token,
    label
  );

  const seasonMap = new Map<string, PlayerSeasonAgg>();
  let fetchErrors = 0;

  for (const fx of fixtures) {
    const matchId = getMatchId(fx);
    if (!matchId) continue;

    const kickoffDate = getFixtureKickoffDate(fx);
    const dateStr = kickoffDate ? kickoffDate.toISOString().slice(0, 10) : "";

    let ma2;
    try {
      ma2 = await fetchMa2ForMatch(env.OUTLET_API_KEY, matchId, token, label);
    } catch (err) {
      fetchErrors++;
      console.warn(
        `[${label}] MA2 fetch failed for match ${matchId}, skipping: ${err}`
      );
      continue;
    }

    const lineups = ma2?.liveData?.lineUp || [];
    const matchName = ma2?.matchInfo?.description || "";

    for (const team of lineups) {
      if (team?.contestantId !== env.OPTA_CONTESTANT_ID) continue;

      const players = team.player || [];

      for (const pl of players) {
        const pid = pl.playerId;
        if (!pid) continue;

        const statsArray = pl.stat || [];
        const stats = extractMatchStats(statsArray);

        if (!seasonMap.has(pid)) {
          const emptyStats: MatchPlayerStats & { games: number } = {
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
          };

          seasonMap.set(pid, {
            name:
              pl.matchName ||
              pl.knownName ||
              `${pl.firstName || ""} ${pl.lastName || ""}`.trim(),
            season: { ...emptyStats },
            lastMatch: {
              name: "",
              matchId: "",
              date: "",
              stats: { ...emptyStats },
            },
            lastMatchDate: null,
          });
        }

        const agg = seasonMap.get(pid)!;

        // Accumulate season totals
        if (stats.minutes > 0) agg.season.games += 1;
        agg.season.minutes += stats.minutes;
        agg.season.shots += stats.shots;
        agg.season.headedShots += stats.headedShots;
        agg.season.goals += stats.goals;
        agg.season.shotsOnTarget += stats.shotsOnTarget;
        agg.season.assists += stats.assists;
        agg.season.interceptions += stats.interceptions;
        agg.season.tackles += stats.tackles;
        agg.season.tacklesWon += stats.tacklesWon;
        agg.season.blocks += stats.blocks;
        agg.season.shotsFaced += stats.shotsFaced;
        agg.season.shotsOnTargetFaced += stats.shotsOnTargetFaced;
        agg.season.passes += stats.passes;
        agg.season.passesCompleted += stats.passesCompleted;
        agg.season.saves += stats.saves;
        agg.season.goalKicks += stats.goalKicks;

        // BUG FIX: Only update lastMatch if this fixture is newer
        if (
          !agg.lastMatchDate ||
          (kickoffDate && kickoffDate > agg.lastMatchDate)
        ) {
          agg.lastMatchDate = kickoffDate;
          agg.lastMatch = {
            name: matchName,
            matchId,
            date: dateStr,
            stats,
          };
        }
      }
    }
  }

  if (fetchErrors > 0) {
    console.warn(
      `[${label}] ${fetchErrors} MA2 fetches failed during season aggregation`
    );
  }

  return seasonMap;
}

// ── Season update → Webflow ──

async function runSeasonUpdate(
  env: SideEnv,
  token: string,
  label: string
): Promise<SyncResult["season"]> {
  const playersAgg = await aggregateMa2Season(env, token, label);
  const webflowItems = await fetchAllWebflowItems(
    env.WEBFLOW_COLLECTION_ID,
    env.WEBFLOW_API_TOKEN
  );
  const webflowIndex = buildWebflowIndex(webflowItems);

  let updated = 0;
  const unmatched: Array<{ playerId: string; name: string }> = [];

  for (const [playerId, agg] of playersAgg.entries()) {
    const wfItem = webflowIndex.get(playerId);
    if (!wfItem) {
      unmatched.push({ playerId, name: agg.name });
      continue;
    }

    const s = agg.season;
    const fd: Record<string, unknown> = {};

    // Raw season totals
    fd[SEASON_TOTAL_FIELDS.games] = s.games;
    fd[SEASON_TOTAL_FIELDS.shots] = s.shots;
    fd[SEASON_TOTAL_FIELDS.headedShots] = s.headedShots;
    fd[SEASON_TOTAL_FIELDS.assists] = s.assists;
    fd[SEASON_TOTAL_FIELDS.interceptions] = s.interceptions;
    fd[SEASON_TOTAL_FIELDS.tackles] = s.tackles;
    fd[SEASON_TOTAL_FIELDS.blocks] = s.blocks;
    fd[SEASON_TOTAL_FIELDS.shotsFaced] = s.shotsFaced;
    fd[SEASON_TOTAL_FIELDS.passes] = s.passes;
    fd[SEASON_TOTAL_FIELDS.saves] = s.saves;
    fd[SEASON_TOTAL_FIELDS.goalKicks] = s.goalKicks;
    fd[SEASON_TOTAL_FIELDS.goals] = s.goals;

    // Season percentages
    fd[SEASON_PERCENT_FIELDS.shotAccuracy] = safePercent(
      s.shotsOnTarget,
      s.shots
    );
    fd[SEASON_PERCENT_FIELDS.shotConversion] = safePercent(s.goals, s.shots);
    fd[SEASON_PERCENT_FIELDS.tackleWin] = safePercent(s.tacklesWon, s.tackles);
    fd[SEASON_PERCENT_FIELDS.passAccuracy] = safePercent(
      s.passesCompleted,
      s.passes
    );
    fd[SEASON_PERCENT_FIELDS.savePercent] = safePercent(
      s.saves,
      s.shotsOnTargetFaced
    );

    await updateWebflowItem(
      env.WEBFLOW_COLLECTION_ID,
      env.WEBFLOW_API_TOKEN,
      wfItem.id,
      fd
    );

    updated++;
  }

  console.info(
    `[${label}] Season update: ${updated} updated, ${unmatched.length} unmatched`
  );

  return {
    seasonPlayers: playersAgg.size,
    updatedPlayers: updated,
    unmatched,
  };
}

// ── Last match update → Webflow ──

async function runLastMatchUpdate(
  env: SideEnv,
  token: string,
  label: string
): Promise<SyncResult["ma2"]> {
  const playersAgg = await aggregateMa2Season(env, token, label);
  const webflowItems = await fetchAllWebflowItems(
    env.WEBFLOW_COLLECTION_ID,
    env.WEBFLOW_API_TOKEN
  );
  const webflowIndex = buildWebflowIndex(webflowItems);

  let updated = 0;
  const unmatched: Array<{ playerId: string; name: string }> = [];

  for (const [playerId, agg] of playersAgg.entries()) {
    const wfItem = webflowIndex.get(playerId);
    if (!wfItem) {
      unmatched.push({ playerId, name: agg.name });
      continue;
    }

    const lm = agg.lastMatch;
    const fd: Record<string, unknown> = {
      "last-match-fixture-uuid": lm.matchId || "",
      "last-match-date": lm.date || "",
    };

    fd[LAST_MATCH_PERCENT_FIELDS.shotAccuracy] = safePercent(
      lm.stats.shotsOnTarget,
      lm.stats.shots
    );
    fd[LAST_MATCH_PERCENT_FIELDS.shotConversion] = safePercent(
      lm.stats.goals,
      lm.stats.shots
    );
    fd[LAST_MATCH_PERCENT_FIELDS.tackleWin] = safePercent(
      lm.stats.tacklesWon,
      lm.stats.tackles
    );
    fd[LAST_MATCH_PERCENT_FIELDS.passAccuracy] = safePercent(
      lm.stats.passesCompleted,
      lm.stats.passes
    );
    fd[LAST_MATCH_PERCENT_FIELDS.savePercent] = safePercent(
      lm.stats.saves,
      lm.stats.shotsOnTargetFaced
    );

    await updateWebflowItem(
      env.WEBFLOW_COLLECTION_ID,
      env.WEBFLOW_API_TOKEN,
      wfItem.id,
      fd
    );

    updated++;
  }

  console.info(
    `[${label}] Last-match update: ${updated} updated, ${unmatched.length} unmatched`
  );

  return { updatedPlayers: updated, unmatched };
}

// ── Latest match (read-only, no Webflow push) ──

async function getLatestMatchStats(
  env: SideEnv,
  token: string,
  label: string
): Promise<SyncResult["latest"]> {
  const fixtures = await aggregateFixtures(
    env.OUTLET_API_KEY,
    env.OPTA_CONTESTANT_ID,
    env.TMCL_IDS,
    token,
    label
  );

  const latestFixture = findLatestPlayedFixture(fixtures);

  if (!latestFixture) {
    throw new Error(`[${label}] No played fixtures found.`);
  }

  const matchId = getMatchId(latestFixture);
  if (!matchId) {
    throw new Error(`[${label}] Latest fixture is missing matchId`);
  }

  const ma2 = await fetchMa2ForMatch(
    env.OUTLET_API_KEY,
    matchId,
    token,
    label
  );

  return { matchId, fixture: latestFixture, ma2 };
}

// ── Side runner ──

export async function runForSide(
  env: SideEnv,
  mode: SyncMode
): Promise<SyncResult> {
  const label = env.SIDE_LABEL;

  const token = await getOptaAccessToken(
    env.OUTLET_API_KEY,
    env.OUTLET_SECRET_KEY
  );

  if (mode === "season") {
    const season = await runSeasonUpdate(env, token, label);
    return { label, mode, season, siteId: env.WEBFLOW_SITE_ID };
  }

  if (mode === "ma2") {
    const ma2 = await runLastMatchUpdate(env, token, label);
    return { label, mode, ma2, siteId: env.WEBFLOW_SITE_ID };
  }

  if (mode === "latest") {
    const latest = await getLatestMatchStats(env, token, label);
    return { label, mode, latest };
  }

  // Default: both season + last-match
  const season = await runSeasonUpdate(env, token, label);
  const ma2 = await runLastMatchUpdate(env, token, label);
  return { label, mode: "both", season, ma2, siteId: env.WEBFLOW_SITE_ID };
}

// ── Environment builder ──

export function buildSideEnv(
  prefix: "MEN" | "WOMEN",
  label: string
):
  | { valid: true; env: SideEnv }
  | { valid: false; reason: string } {
  const get = (name: string, allowFallback = false): string | undefined => {
    const prefixed = process.env[`${prefix}_${name}`];
    if (prefixed) return prefixed;
    if (allowFallback) return process.env[name];
    return undefined;
  };

  const outletApiKey = get("OUTLET_API_KEY", prefix === "MEN");
  const outletSecretKey = get("OUTLET_SECRET_KEY", prefix === "MEN");
  const contestantId = get("OPTA_CONTESTANT_ID", prefix === "MEN");
  const tmclRaw =
    get("OPTA_TOURNAMENT_CALENDAR_IDS", prefix === "MEN") ||
    get("OPTA_TOURNAMENT_CALENDAR_ID", prefix === "MEN");
  const collectionId = get("WEBFLOW_COLLECTION_ID", true);
  const siteId = get("WEBFLOW_SITE_ID", true);
  const webflowToken = process.env.WEBFLOW_API_TOKEN;

  if (!outletApiKey || !outletSecretKey) {
    return { valid: false, reason: "Missing Opta credentials" };
  }
  if (!contestantId) {
    return { valid: false, reason: "Missing contestant ID" };
  }
  if (!tmclRaw) {
    return { valid: false, reason: "Missing TMCL IDs" };
  }
  if (!collectionId || !webflowToken) {
    return { valid: false, reason: "Missing Webflow config" };
  }

  const tmclIds = tmclRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (tmclIds.length === 0) {
    return { valid: false, reason: "Empty TMCL IDs" };
  }

  return {
    valid: true,
    env: {
      SIDE_LABEL: label,
      OUTLET_API_KEY: outletApiKey,
      OUTLET_SECRET_KEY: outletSecretKey,
      OPTA_CONTESTANT_ID: contestantId.trim(),
      TMCL_IDS: tmclIds,
      WEBFLOW_COLLECTION_ID: collectionId,
      WEBFLOW_SITE_ID: siteId,
      WEBFLOW_API_TOKEN: webflowToken,
    },
  };
}

/**
 * Publish Webflow sites for sides that were updated.
 */
export async function publishSites(
  results: SyncResult[],
  mode: SyncMode
): Promise<void> {
  if (mode !== "both") return;

  const siteIds = new Set<string>();
  for (const r of results) {
    if (!r.skipped && r.siteId) siteIds.add(r.siteId);
  }

  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) return;

  for (const siteId of siteIds) {
    await publishWebflowSite(siteId, token);
  }
}
