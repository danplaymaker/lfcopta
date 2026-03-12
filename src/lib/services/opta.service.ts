/**
 * Opta / Stats Perform data fetching service.
 *
 * Handles OAuth authentication, MA1 fixture fetching, and MA2 match stat fetching.
 */

import crypto from "crypto";

// ── Types ──

interface OptaFixture {
  matchId?: string;
  id?: string;
  matchInfo?: {
    id?: string;
    date?: string;
    localDate?: string;
    matchStatus?: string;
    status?: string;
    description?: string;
  };
  matchDateTimeUTC?: string;
  matchDateTime?: string;
  matchDate?: string;
  matchStatus?: string;
  liveData?: {
    matchDetails?: { matchStatus?: string };
    lineUp?: OptaTeamLineup[];
  };
}

interface OptaTeamLineup {
  contestantId?: string;
  player?: OptaPlayer[];
}

interface OptaPlayer {
  playerId?: string;
  matchName?: string;
  knownName?: string;
  firstName?: string;
  lastName?: string;
  stat?: Array<{ type?: string; value?: string | number }>;
}

interface Ma2Response {
  matchInfo?: { description?: string };
  liveData?: {
    lineUp?: OptaTeamLineup[];
  };
}

export type { OptaFixture, OptaTeamLineup, OptaPlayer, Ma2Response };

// ── OAuth ──

export async function getOptaAccessToken(
  outletKey: string,
  secretKey: string
): Promise<string> {
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

// ── MA1: Fixtures ──

export async function fetchMa1ForTmcl(
  outletApiKey: string,
  tmclId: string,
  contestantId: string,
  token: string,
  label: string
): Promise<OptaFixture[] | null> {
  const url = `https://api.performfeeds.com/soccerdata/match/${outletApiKey}?tmcl=${tmclId}&ctst=${contestantId}&live=yes&_pgSz=1000&_fmt=json&_rt=b`;

  console.log(`[${label}] MA1 request: tmcl=${tmclId}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const bodyText = await res.text();

  if (!res.ok) {
    if (res.status === 404 && bodyText.includes('"errorCode":"10400"')) {
      console.warn(
        `[${label}] MA1: no data for tmcl=${tmclId}, skipping`
      );
      return null;
    }
    throw new Error(`[${label}] MA1 fetch failed ${res.status}: ${bodyText}`);
  }

  const json = JSON.parse(bodyText);
  const list = json.match || json.matches?.match || json.fixtures?.fixture || [];
  const arr = Array.isArray(list) ? list : [list].filter(Boolean);

  console.log(`[${label}] MA1 tmcl=${tmclId} → ${arr.length} matches`);
  return arr;
}

/**
 * Aggregate all fixtures across configured TMCL IDs.
 * BUG FIX: Deduplicates by matchId to prevent double-counting.
 */
export async function aggregateFixtures(
  outletApiKey: string,
  contestantId: string,
  tmclIds: string[],
  token: string,
  label: string
): Promise<OptaFixture[]> {
  const seen = new Set<string>();
  const fixtures: OptaFixture[] = [];

  for (const tmcl of tmclIds) {
    const matches = await fetchMa1ForTmcl(
      outletApiKey,
      tmcl,
      contestantId,
      token,
      label
    );
    if (!matches) continue;

    for (const fx of matches) {
      const matchId = getMatchId(fx);
      if (!matchId) continue;
      if (seen.has(matchId)) continue;
      seen.add(matchId);
      fixtures.push(fx);
    }
  }

  console.log(
    `[${label}] Total deduplicated fixtures: ${fixtures.length}`
  );
  return fixtures;
}

// ── MA2: Match Stats ──

export async function fetchMa2ForMatch(
  outletApiKey: string,
  matchId: string,
  token: string,
  label: string
): Promise<Ma2Response> {
  const url = `https://api.performfeeds.com/soccerdata/matchstats/${outletApiKey}/?detailed=yes&fx=${matchId}&_rt=b&_fmt=json`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(
      `[${label}] MA2 fetch failed ${res.status}: ${await res.text()}`
    );
  }

  return await res.json();
}

// ── Fixture helpers ──

export function getMatchId(fx: OptaFixture): string | undefined {
  return fx.matchId || fx.matchInfo?.id || fx.id;
}

/**
 * BUG FIX: Don't strip timezone 'Z' — keep ISO 8601 parsing correct.
 */
export function getFixtureKickoffDate(fx: OptaFixture): Date | null {
  const mi = fx.matchInfo || {};

  if (mi.date) {
    return new Date(mi.date);
  }

  const raw =
    fx.matchDateTimeUTC || fx.matchDateTime || fx.matchDate || mi.localDate;

  return raw ? new Date(raw) : null;
}

/**
 * Find the latest played fixture.
 * BUG FIX: Sort all fixtures by date descending and pick the first played one,
 * rather than iterating unsorted and tracking best.
 */
export function findLatestPlayedFixture(
  fixtures: OptaFixture[]
): OptaFixture | null {
  const now = new Date();

  const withDates = fixtures
    .map((fx) => ({ fx, date: getFixtureKickoffDate(fx) }))
    .filter(
      (entry): entry is { fx: OptaFixture; date: Date } => entry.date !== null
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  for (const { fx, date } of withDates) {
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
      date <= now;

    if (isPlayed) return fx;
  }

  return null;
}
