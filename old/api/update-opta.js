/**
 * OPTA → Webflow Sync (MA1 + MA2 + Season Totals)
 * ------------------------------------------------
 * Version: Men + Women, MA2-based season engine
 *
 * Responsibilities:
 * - Fetch fixtures (MA1)
 * - Fetch match stats (MA2)
 * - Derive season totals from MA2
 * - Update Webflow CMS items
 * - Publish Webflow site(s)
 *
 * Supports:
 * - Men:   MEN_*
 * - Women: WOMEN_*
 */

import fetch from "node-fetch";
import crypto from "crypto";

// Webflow Field Slugs
const WF_PLAYER_UUID_FIELD = "player-uuid";

// Mapping from our season stat keys → Webflow field slugs (raw season totals)
const TM4_TO_WEBFLOW_FIELD = {
  games: "games", // Games (Season)
  shots: "shots-season", // Shots (Season)
  headedShots: "headed-shots-season", // Headed Shots (Season)
  assists: "assists-season", // Assists (Season)
  interceptions: "interceptions-season", // Interceptions (Season)
  tackles: "tackles-season", // Tackles (Season)
  blocks: "blocks-season", // Blocks (Season)
  shotsFaced: "shots-faced-season", // Shots Faced (Season)
  passes: "passes-season", // Passes (Season)
  saves: "saves-season", // Saves (Season)
  goalKicks: "goal-kicks-season", // Goal Kicks (Season)
  goals: "goals-season", // Goals (Season)
};

/**
 * CENTRAL PLACE TO FIX WEBFLOW % FIELD SLUGS
 *
 * These now match your collection schema exactly.
 */
const WF_SEASON_PERCENT_FIELDS = {
  // Shot Accuracy - Season (%)
  shotAccuracy: "shot-accuracy",
  // Shot Conversion - Season (%)
  shotConversion: "shot-conversion---season",
  // Tackle Win Rate - Season (%)
  tackleWin: "tackle-win-rate---season",
  // Pass Accuracy - Seasons (%)
  passAccuracy: "pass-accuracy---seasons",
  // Saves - Season (%)
  savePercent: "pass-accuracy---season",
};

const WF_LAST_MATCH_PERCENT_FIELDS = {
  // Shot Accuracy - Last Match (%)
  shotAccuracy: "shot-accuracy---last-match",
  // Shot Conversion - Last Match (%)
  shotConversion: "shot-conversion---last-match",
  // Tackle Win Rate - Last Match (%)
  tackleWin: "tackle-win-rate---last-match",
  // Pass Accuracy - Last Match (%)
  passAccuracy: "pass-accuracy---last-match",
  // Saves - Last Match (%)
  savePercent: "saves---last-match",
};

// --------------------------------------------
// 1. Generic helpers
// --------------------------------------------

function safePercent(numerator, denominator) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!den || !Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    return 0;
  }
  return Math.round((num * 100) / den);
}

async function fetchXMLorJSON(url, token) {
  const request = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!request.ok) {
    throw new Error(
      `OPTA request failed ${request.status}: ${await request.text()}`
    );
  }
  return await request.text();
}

/**
 * Get an OAuth access token from Stats Perform / Opta.
 * Mirrors the working Postman request:
 *  - URL:
 *      https://oauth.performgroup.com/oauth/token/{OutletApiKey}?_fmt=json&_rt=b
 *  - HEADERS:
 *      Content-Type: application/x-www-form-urlencoded
 *      Authorization: Basic <SHA512(outletKey + timestamp + secretKey)>
 *      Timestamp: <unix ms>
 *  - BODY (x-www-form-urlencoded):
 *      grant_type=client_credentials
 *      scope=b2b-feeds-auth
 */
async function getOptaAccessToken(outletKey, secretKey) {
  const baseUrl = "https://oauth.performgroup.com/oauth/token";

  const timestamp = Date.now().toString();
  const sigString = outletKey + timestamp + secretKey;
  const hash = crypto.createHash("sha512").update(sigString).digest("hex");

  const oauthURL = `${baseUrl}/${outletKey}?_fmt=json&_rt=b`;

  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("scope", "b2b-feeds-auth");

  const res = await fetch(oauthURL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${hash}`,
      Timestamp: timestamp,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`OAuth token fetch failed ${res.status}: ${msg}`);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new Error(
      `OAuth response missing access_token: ${JSON.stringify(json)}`
    );
  }

  return json.access_token;
}

// --------------------------------------------
// 2. Webflow Helpers
// --------------------------------------------

async function fetchAllWebflowItems(collectionId, token) {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Webflow fetch failed ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return json.items || [];
}

async function updateWebflowItem(collectionId, token, itemId, fields) {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}`;

  const body = {
    fieldData: fields,
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Webflow PATCH error:", {
      status: res.status,
      url,
      itemId,
      fields,
      body: text,
    });
    throw new Error(`Webflow update failed ${res.status}: ${text}`);
  }

  return res.json();
}

async function publishWebflowSite(siteId, token) {
  const url = `https://api.webflow.com/v2/sites/${siteId}/publish`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      publishTo: ["production"],
    }),
  });

  if (!res.ok) {
    throw new Error(`Webflow publish failed ${res.status}`);
  }

  return res.json();
}

// --------------------------------------------
// 3. OPTA: MA1 Fixtures (match endpoint)
// --------------------------------------------

/**
 * MA1: Fixtures / results for a given tournament calendar
 * Uses the confirmed working endpoint:
 *   /soccerdata/match/{OutletApiKey}?tmcl=...&live=yes&_pgSz=1000&_fmt=json&_rt=b
 */
async function fetchMa1ForTmcl(
  outletApiKey,
  tmclId,
  contestantId,
  token,
  label
) {
  const url = `https://api.performfeeds.com/soccerdata/match/${outletApiKey}?tmcl=${tmclId}&ctst=${contestantId}&live=yes&_pgSz=1000&_fmt=json&_rt=b`;

  console.log(`[${label}] MA1 request URL: ${url}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const bodyText = await res.text();

  // If no data / 10400, just skip this competition
  if (!res.ok) {
    if (res.status === 404 && bodyText.includes('"errorCode":"10400"')) {
      console.warn(
        `[${label}] MA1: no data for tmcl=${tmclId}, ctst=${contestantId}, skipping`
      );
      return null;
    }

    throw new Error(
      `[${label}] MA1 fetch failed ${res.status}: URL=${url} BODY=${bodyText}`
    );
  }

  return JSON.parse(bodyText);
}

/**
 * All fixtures for a team (home or away) across configured TMCL IDs
 */
async function aggregateMa1Fixtures(env, token, label) {
  const { OUTLET_API_KEY, OPTA_CONTESTANT_ID, TMCL_IDS } = env;
  const fixtures = [];

  if (!OPTA_CONTESTANT_ID) {
    throw new Error(`[${label}] OPTA_CONTESTANT_ID is not set`);
  }

  console.log(`[${label}] TMCL IDs resolved to:`, TMCL_IDS);

  for (const tmcl of TMCL_IDS) {
    const ma1 = await fetchMa1ForTmcl(
      OUTLET_API_KEY,
      tmcl,
      OPTA_CONTESTANT_ID,
      token,
      label
    );
    if (!ma1) continue;

    const list = ma1.match || ma1.matches?.match || ma1.fixtures?.fixture || [];

    const arr = Array.isArray(list) ? list : [list].filter(Boolean);

    console.log(
      `[${label}] MA1 tmcl=${tmcl} → matches involving ctst=${OPTA_CONTESTANT_ID}: ${arr.length}`
    );

    fixtures.push(...arr);
  }

  console.log(
    `[${label}] Total fixtures found for contestant=${OPTA_CONTESTANT_ID}: ${fixtures.length}`
  );

  return fixtures;
}

/**
 * Helper to extract a JS Date from a fixture object.
 */
function getFixtureKickoffDate(fx) {
  const mi = fx.matchInfo || {};

  if (mi.date) {
    const d = mi.date.replace("Z", "");
    return new Date(d);
  }

  const raw =
    fx.matchDateTimeUTC ||
    fx.matchDateTime ||
    fx.matchDate ||
    mi.localDate;

  return raw ? new Date(raw) : null;
}

/**
 * Find the latest *played* fixture for given env/contestant.
 */
async function getLatestFixture(env, token, label) {
  const fixtures = await aggregateMa1Fixtures(env, token, label);
  if (!fixtures.length) {
    console.warn(
      `[${label}] No fixtures matched contestant=${env.OPTA_CONTESTANT_ID}. ` +
        `Check TMCL IDs and OPTA_CONTESTANT_ID.`
    );
    return null;
  }

  const now = new Date();
  let best = null;
  let bestKickoff = null;

  for (const fx of fixtures) {
    const kickoff = getFixtureKickoffDate(fx);
    if (!kickoff) continue;

    const statusRaw =
      fx.liveData?.matchDetails?.matchStatus ||
      fx.matchStatus ||
      fx.matchInfo?.matchStatus ||
      fx.matchInfo?.status;

    const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";

    const isPlayed =
      status.includes("played") ||
      status.includes("finished") ||
      status.includes("result") ||
      status.includes("completed") ||
      kickoff <= now; // fallback if status missing

    if (!isPlayed) continue;

    if (!bestKickoff || kickoff > bestKickoff) {
      best = fx;
      bestKickoff = kickoff;
    }
  }

  return best;
}

// --------------------------------------------
// 4. OPTA: MA2 Match Stats
// --------------------------------------------

/**
 * MA2: Match stats for a given matchId
 * Uses the confirmed working endpoint:
 *   /soccerdata/matchstats/{OutletApiKey}/?detailed=yes&fx={matchId}&_rt=b&_fmt=json
 */
async function fetchMa2ForMatch(outletApiKey, matchId, token, label) {
  const url = `https://api.performfeeds.com/soccerdata/matchstats/${outletApiKey}/?detailed=yes&fx=${matchId}&_rt=b&_fmt=json`;

  console.log(`[${label}] MA2 request URL: ${url}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `[${label}] MA2 fetch failed ${res.status}: ${await res.text()}`
    );
  }

  return await res.json();
}

// --------------------------------------------
// 5. MA2: Full Season Aggregation
// --------------------------------------------

async function aggregateMa2Season(env, token, label) {
  const { OUTLET_API_KEY } = env;

  const allFixtures = await aggregateMa1Fixtures(env, token, label);
  const seasonMap = new Map();

  for (const fx of allFixtures) {
    const matchId = fx.matchId || fx.matchInfo?.id || fx.id;
    if (!matchId) continue;

    const kickoffDate = getFixtureKickoffDate(fx);
    const dateStr = kickoffDate ? kickoffDate.toISOString().slice(0, 10) : "";

    const ma2 = await fetchMa2ForMatch(OUTLET_API_KEY, matchId, token, label);

    const lineups = ma2?.liveData?.lineUp || [];
    const matchName = ma2?.matchInfo?.description || "";

    for (const team of lineups) {
      const isOurTeam = team?.contestantId === env.OPTA_CONTESTANT_ID;
      if (!isOurTeam) continue;

      const players = team.player || [];

      for (const pl of players) {
        const pid = pl.playerId;
        if (!pid) continue;

        const statsArray = pl.stat || [];
        const stats = {};
        for (const s of statsArray) {
          if (!s || !s.type) continue;
          const v = Number(s.value);
          stats[s.type] = Number.isNaN(v) ? 0 : v;
        }

        // Core metrics we care about (per-match)
        const minutes = stats.minsPlayed || 0;
        const totalShots = stats.totalScoringAtt || 0; // all shots
        const headedShots = stats.attHdTotal || 0; // headed attempts
        const goals = stats.goal || 0; // goals scored
        const shotsOnTarget = stats.ontargetScoringAtt || 0;
        const assists = stats.goalAssist || 0; // assist count
        const interceptions = stats.interception || 0;
        const tackles = stats.totalTackle || 0;
        const tacklesWon = stats.wonTackle || 0;
        const attemptsConcededIbox = stats.attemptsConcededIbox || 0;
        const attemptsConcededObox = stats.attemptsConcededObox || 0;
        const attemptsConceded = attemptsConcededIbox + attemptsConcededObox;
        const passes = stats.totalPass || 0;
        const passesCompleted = stats.accuratePass || 0;
        const saves = stats.saves || 0;
        const shotsOnTargetFaced = stats.shotsOnTargetFaced || 0;
        const blocks =
          stats.outfielderBlock ||
          stats.blockedScoringAtt ||
          0;
        const goalKicks = stats.goalKicks || 0;

        if (!seasonMap.has(pid)) {
          seasonMap.set(pid, {
            name:
              pl.matchName ||
              pl.knownName ||
              `${pl.firstName || ""} ${pl.lastName || ""}`.trim(),
            season: {
              games: 0,
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
            lastMatch: {
              name: "",
              matchId: "",
              date: "",
              shots: 0,
              shotsOnTarget: 0,
              goals: 0,
              headedShots: 0,
              totalTackle: 0,
              tacklesWon: 0,
              interceptions: 0,
              totalPass: 0,
              passesCompleted: 0,
              saves: 0,
              shotsOnTargetFaced: 0,
              goalKicks: 0,
            },
          });
        }

        const agg = seasonMap.get(pid);

        // Season totals
        if (minutes > 0) agg.season.games += 1;
        agg.season.shots += totalShots;
        agg.season.headedShots += headedShots;
        agg.season.goals += goals;
        agg.season.shotsOnTarget += shotsOnTarget;
        agg.season.assists += assists;
        agg.season.interceptions += interceptions;
        agg.season.tackles += tackles;
        agg.season.tacklesWon += tacklesWon;
        agg.season.blocks += blocks;
        agg.season.shotsFaced += attemptsConceded;
        agg.season.shotsOnTargetFaced += shotsOnTargetFaced;
        agg.season.passes += passes;
        agg.season.passesCompleted += passesCompleted;
        agg.season.saves += saves;
        agg.season.goalKicks += goalKicks;

        // Last match snapshot – always overwritten, so ends up as the most recent in the loop
        agg.lastMatch = {
          name: matchName,
          matchId,
          date: dateStr,
          shots: totalShots,
          shotsOnTarget,
          goals,
          headedShots,
          totalTackle: tackles,
          tacklesWon,
          interceptions,
          totalPass: passes,
          passesCompleted,
          saves,
          shotsOnTargetFaced,
          goalKicks,
        };
      }
    }
  }

  return seasonMap;
}

// --------------------------------------------
// 6. Season Update (via MA2 only)
// --------------------------------------------

async function runSeasonUpdate(env, tokenFromCaller, label) {
  const { WEBFLOW_API_TOKEN, WEBFLOW_COLLECTION_ID } = env;

  const token =
    tokenFromCaller ||
    (await getOptaAccessToken(env.OUTLET_API_KEY, env.OUTLET_SECRET_KEY));

  const playersAgg = await aggregateMa2Season(env, token, label);
  const webflowItems = await fetchAllWebflowItems(
    WEBFLOW_COLLECTION_ID,
    WEBFLOW_API_TOKEN
  );

  const webflowIndex = new Map();
  for (const item of webflowItems) {
    const uuid = item.fieldData?.[WF_PLAYER_UUID_FIELD];
    if (uuid) webflowIndex.set(uuid, item);
  }

  let updated = 0;
  const unmatched = [];

  for (const [playerId, agg] of playersAgg.entries()) {
    const wfItem = webflowIndex.get(playerId);
    if (!wfItem) {
      unmatched.push({ playerId, name: agg.name });
      continue;
    }

    const s = agg.season;
    const fd = {};

    // Raw season totals
    fd[TM4_TO_WEBFLOW_FIELD.games] = s.games;
    fd[TM4_TO_WEBFLOW_FIELD.shots] = s.shots;
    fd[TM4_TO_WEBFLOW_FIELD.headedShots] = s.headedShots;
    fd[TM4_TO_WEBFLOW_FIELD.assists] = s.assists;
    fd[TM4_TO_WEBFLOW_FIELD.interceptions] = s.interceptions;
    fd[TM4_TO_WEBFLOW_FIELD.tackles] = s.tackles;
    fd[TM4_TO_WEBFLOW_FIELD.blocks] = s.blocks;
    fd[TM4_TO_WEBFLOW_FIELD.shotsFaced] = s.shotsFaced;
    fd[TM4_TO_WEBFLOW_FIELD.passes] = s.passes;
    fd[TM4_TO_WEBFLOW_FIELD.saves] = s.saves;
    fd[TM4_TO_WEBFLOW_FIELD.goalKicks] = s.goalKicks;
    fd[TM4_TO_WEBFLOW_FIELD.goals] = s.goals;

    // Season % fields
    fd[WF_SEASON_PERCENT_FIELDS.shotAccuracy] = safePercent(
      s.shotsOnTarget,
      s.shots
    );
    fd[WF_SEASON_PERCENT_FIELDS.shotConversion] = safePercent(
      s.goals,
      s.shots
    );
    fd[WF_SEASON_PERCENT_FIELDS.tackleWin] = safePercent(
      s.tacklesWon,
      s.tackles
    );
    fd[WF_SEASON_PERCENT_FIELDS.passAccuracy] = safePercent(
      s.passesCompleted,
      s.passes
    );
    fd[WF_SEASON_PERCENT_FIELDS.savePercent] = safePercent(
      s.saves,
      s.shotsOnTargetFaced
    );

    await updateWebflowItem(
      WEBFLOW_COLLECTION_ID,
      WEBFLOW_API_TOKEN,
      wfItem.id,
      fd
    );

    updated++;
  }

  console.info(
    `[${label}] Season update complete: ${updated} players updated, ${unmatched.length} unmatched`
  );

  return {
    seasonPlayers: playersAgg.size,
    updatedPlayers: updated,
    unmatched,
  };
}

// --------------------------------------------
// 7. MA2 (Last Match Update for all players)
// --------------------------------------------

async function runMa2SeasonAggregate(env, tokenFromCaller, label) {
  const { WEBFLOW_API_TOKEN, WEBFLOW_COLLECTION_ID } = env;

  const token =
    tokenFromCaller ||
    (await getOptaAccessToken(env.OUTLET_API_KEY, env.OUTLET_SECRET_KEY));

  const playersAgg = await aggregateMa2Season(env, token, label);
  const webflowItems = await fetchAllWebflowItems(
    WEBFLOW_COLLECTION_ID,
    WEBFLOW_API_TOKEN
  );

  const webflowIndex = new Map();
  for (const item of webflowItems) {
    const uuid = item.fieldData?.[WF_PLAYER_UUID_FIELD];
    if (uuid) webflowIndex.set(uuid, item);
  }

  let updated = 0;
  const unmatched = [];

  for (const [playerId, agg] of playersAgg.entries()) {
    const wfItem = webflowIndex.get(playerId);
    if (!wfItem) {
      unmatched.push({ playerId, name: agg.name });
      continue;
    }

    const lm = agg.lastMatch;

    const fd = {
      // Fixture context
      "last-match-fixture-uuid": lm.matchId || "",
      "last-match-date": lm.date || "",
    };

    // Last match % fields
    fd[WF_LAST_MATCH_PERCENT_FIELDS.shotAccuracy] = safePercent(
      lm.shotsOnTarget,
      lm.shots
    );
    fd[WF_LAST_MATCH_PERCENT_FIELDS.shotConversion] = safePercent(
      lm.goals,
      lm.shots
    );
    fd[WF_LAST_MATCH_PERCENT_FIELDS.tackleWin] = safePercent(
      lm.tacklesWon,
      lm.totalTackle
    );
    fd[WF_LAST_MATCH_PERCENT_FIELDS.passAccuracy] = safePercent(
      lm.passesCompleted,
      lm.totalPass
    );
    fd[WF_LAST_MATCH_PERCENT_FIELDS.savePercent] = safePercent(
      lm.saves,
      lm.shotsOnTargetFaced
    );

    await updateWebflowItem(
      WEBFLOW_COLLECTION_ID,
      WEBFLOW_API_TOKEN,
      wfItem.id,
      fd
    );

    updated++;
  }

  console.info(
    `[${label}] Last-match update complete: ${updated} players updated, ${unmatched.length} unmatched`
  );

  return { updatedPlayers: updated, unmatched };
}

// --------------------------------------------
// 8. Latest Match (MA1 + MA2 for a single game)
// --------------------------------------------

async function getLatestMatchStats(env, tokenFromCaller, label) {
  const token =
    tokenFromCaller ||
    (await getOptaAccessToken(env.OUTLET_API_KEY, env.OUTLET_SECRET_KEY));

  const latestFixture = await getLatestFixture(env, token, label);

  if (!latestFixture) {
    throw new Error(
      `[${label}] No fixtures found for the configured TMCL IDs.`
    );
  }

  const matchId =
    latestFixture.matchId ||
    latestFixture.matchInfo?.id ||
    latestFixture.id;

  if (!matchId) {
    throw new Error(`[${label}] Latest fixture is missing matchId`);
  }

  const ma2 = await fetchMa2ForMatch(env.OUTLET_API_KEY, matchId, token, label);

  return {
    matchId,
    fixture: latestFixture,
    ma2,
  };
}

// --------------------------------------------
// 9. Multi-side runner (men + women)
// --------------------------------------------

function buildSideEnv(prefix, label) {
  // Helper to pull MEN_*/WOMEN_* with fallback to unprefixed (for men)
  const get = (name, allowFallback = false) => {
    const prefixed = process.env[`${prefix}_${name}`];
    if (prefixed) return prefixed;
    if (allowFallback) return process.env[name];
    return undefined;
  };

  return {
    SIDE_LABEL: label,

    OUTLET_API_KEY: get("OUTLET_API_KEY", prefix === "MEN"),
    OUTLET_SECRET_KEY: get("OUTLET_SECRET_KEY", prefix === "MEN"),

    OPTA_CONTESTANT_ID: get("OPTA_CONTESTANT_ID", prefix === "MEN"),
    OPTA_TOURNAMENT_CALENDAR_IDS:
      get("OPTA_TOURNAMENT_CALENDAR_IDS", prefix === "MEN") ||
      get("OPTA_TOURNAMENT_CALENDAR_ID", prefix === "MEN"),

    WEBFLOW_COLLECTION_ID: get("WEBFLOW_COLLECTION_ID", true),
    WEBFLOW_SITE_ID: get("WEBFLOW_SITE_ID", true),

    WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  };
}

/**
 * Run for a single side (men/women) respecting mode.
 * Returns an object describing what happened for that side.
 */
async function runForSide(baseEnv, mode) {
  const env = { ...baseEnv };
  const label = env.SIDE_LABEL || "side";

  const needsWebflow = mode !== "latest";

  // Basic config checks – if missing, skip this side without blowing up men.
  if (!env.OUTLET_API_KEY || !env.OUTLET_SECRET_KEY) {
    console.warn(
      `[${label}] Missing OUTLET_API_KEY / OUTLET_SECRET_KEY – skipping`
    );
    return { label, skipped: true, reason: "Missing Opta credentials" };
  }

  if (!env.OPTA_TOURNAMENT_CALENDAR_IDS) {
    console.warn(
      `[${label}] Missing OPTA_TOURNAMENT_CALENDAR_IDS – skipping`
    );
    return { label, skipped: true, reason: "Missing TMCL IDs" };
  }

  if (!env.OPTA_CONTESTANT_ID) {
    console.warn(`[${label}] Missing OPTA_CONTESTANT_ID – skipping`);
    return { label, skipped: true, reason: "Missing contestant ID" };
  }

  if (needsWebflow) {
    if (!env.WEBFLOW_COLLECTION_ID || !env.WEBFLOW_API_TOKEN) {
      console.warn(
        `[${label}] Missing Webflow collection/token – skipping Webflow updates`
      );
      return { label, skipped: true, reason: "Missing Webflow config" };
    }
  }

  // Normalise TMCL IDs
  const TMCL_IDS = String(env.OPTA_TOURNAMENT_CALENDAR_IDS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  env.TMCL_IDS = TMCL_IDS;

  if (env.OPTA_CONTESTANT_ID) {
    env.OPTA_CONTESTANT_ID = env.OPTA_CONTESTANT_ID.trim();
  }

  const token = await getOptaAccessToken(
    env.OUTLET_API_KEY,
    env.OUTLET_SECRET_KEY
  );

  if (mode === "season") {
    const season = await runSeasonUpdate(env, token, label);
    return { label, mode, season, siteId: env.WEBFLOW_SITE_ID };
  }

  if (mode === "ma2") {
    const ma2 = await runMa2SeasonAggregate(env, token, label);
    return { label, mode, ma2, siteId: env.WEBFLOW_SITE_ID };
  }

  if (mode === "latest") {
    const latest = await getLatestMatchStats(env, token, label);
    return { label, mode, latest };
  }

  // Default: season + last-match
  const season = await runSeasonUpdate(env, token, label);
  const ma2 = await runMa2SeasonAggregate(env, token, label);

  return { label, mode: "both", season, ma2, siteId: env.WEBFLOW_SITE_ID };
}

// --------------------------------------------
// 10. Main Handler (Vercel API)
// --------------------------------------------

export default async function handler(req, res) {
  try {
    const mode = req.query.run || req.query.mode || "both";

    // Build env per side
    const menEnv = buildSideEnv("MEN", "men");
    const womenEnv = buildSideEnv("WOMEN", "women");

    const [menResult, womenResult] = await Promise.all([
      runForSide(menEnv, mode),
      runForSide(womenEnv, mode),
    ]);

    // Publish sites only on default/both mode
    if (mode === "both" || mode === "all") {
      const publishIds = new Set();

      if (!menResult.skipped && menResult.siteId) {
        publishIds.add(menResult.siteId);
      }
      if (!womenResult.skipped && womenResult.siteId) {
        publishIds.add(womenResult.siteId);
      }

      for (const siteId of publishIds) {
        await publishWebflowSite(siteId, process.env.WEBFLOW_API_TOKEN);
      }
    }

    return res.status(200).json({
      ok: true,
      mode,
      men: menResult,
      women: womenResult,
    });
  } catch (err) {
    console.error("update-opta error:", err);
    return res.status(500).json({
      error: "Server error",
      detail: String(err.message || err),
    });
  }
}
