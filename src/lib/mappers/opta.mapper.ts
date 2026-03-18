/**
 * Maps Opta MA2 stat types to our internal model and Webflow field slugs.
 */

// ── Internal stat keys ──

export interface MatchPlayerStats {
  minutes: number;
  shots: number;
  headedShots: number;
  goals: number;
  shotsOnTarget: number;
  assists: number;
  interceptions: number;
  tackles: number;
  tacklesWon: number;
  blocks: number;
  shotsFaced: number;
  shotsOnTargetFaced: number;
  passes: number;
  passesCompleted: number;
  saves: number;
  goalKicks: number;
}

export function extractMatchStats(
  statsArray: Array<{ type?: string; value?: string | number }>
): MatchPlayerStats {
  const lookup: Record<string, number> = {};
  for (const s of statsArray) {
    if (!s?.type) continue;
    const v = Number(s.value);
    lookup[s.type] = Number.isNaN(v) ? 0 : v;
  }

  return {
    minutes: lookup.minsPlayed ?? 0,
    shots: lookup.totalScoringAtt ?? 0,
    headedShots: lookup.attHdTotal ?? 0,
    goals: lookup.goals ?? 0,
    shotsOnTarget: lookup.ontargetScoringAtt ?? 0,
    assists: lookup.goalAssist ?? 0,
    interceptions: lookup.interception ?? 0,
    tackles: lookup.totalTackle ?? 0,
    tacklesWon: lookup.wonTackle ?? 0,
    // BUG FIX: use addition instead of || to avoid falsy-zero fallthrough
    blocks: (lookup.outfielderBlock ?? 0) + (lookup.blockedScoringAtt ?? 0),
    shotsFaced:
      (lookup.attemptsConcededIbox ?? 0) + (lookup.attemptsConcededObox ?? 0),
    shotsOnTargetFaced: lookup.shotsOnTargetFaced ?? 0,
    passes: lookup.totalPass ?? 0,
    passesCompleted: lookup.accuratePass ?? 0,
    saves: lookup.saves ?? 0,
    goalKicks: lookup.goalKicks ?? 0,
  };
}

// ── Webflow field mappings ──

/** Raw season total → Webflow field slug */
export const SEASON_TOTAL_FIELDS: Record<string, string> = {
  games: "games",
  shots: "shots-season",
  headedShots: "headed-shots-season",
  assists: "assists-season",
  interceptions: "interceptions-season",
  tackles: "tackles-season",
  blocks: "blocks-season",
  shotsFaced: "shots-faced-season",
  passes: "passes-season",
  saves: "saves-season",
  goalKicks: "goal-kicks-season",
  goals: "goals-season",
};

/** Season percentage → Webflow field slug */
export const SEASON_PERCENT_FIELDS = {
  shotAccuracy: "shot-accuracy",
  shotConversion: "shot-conversion---season",
  tackleWin: "tackle-win-rate---season",
  passAccuracy: "pass-accuracy---seasons",
  // BUG FIX: was incorrectly mapped to "pass-accuracy---season"
  savePercent: "saves---season",
};

/** Last match percentage → Webflow field slug */
export const LAST_MATCH_PERCENT_FIELDS = {
  shotAccuracy: "shot-accuracy---last-match",
  shotConversion: "shot-conversion---last-match",
  tackleWin: "tackle-win-rate---last-match",
  passAccuracy: "pass-accuracy---last-match",
  savePercent: "saves---last-match",
};

/** All-time total → Webflow field slug */
export const ALL_TIME_FIELDS: Record<string, string> = {
  appearances: "all-time-appearances",
  goals: "all-time-goals",
  assists: "all-time-assists",
  cleanSheets: "all-time-clean-sheets",
  yellowCards: "all-time-yellow-cards",
  redCards: "all-time-red-cards",
  minutesPlayed: "all-time-minutes-played",
  saves: "all-time-saves",
};

// ── Helpers ──

export function safePercent(numerator: number, denominator: number): number {
  if (
    !denominator ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 0;
  }
  return Math.round((numerator * 100) / denominator);
}
