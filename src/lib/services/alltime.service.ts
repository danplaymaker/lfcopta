/**
 * All-time stats service.
 *
 * Loads historical base data from CSV, then merges with live Opta season
 * data to produce all-time career totals per player.
 *
 * CSV is matched to Opta players by Stats Perform player UUID.
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface HistoricalPlayerStats {
  playerUuid: string;
  name: string;
  team: "LFC Men" | "LFC Women";
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  saves: number;
}

export interface AllTimePlayerStats extends HistoricalPlayerStats {
  /** Season stats added on top of historical base */
  seasonAppearances: number;
  seasonGoals: number;
  seasonAssists: number;
  seasonCleanSheets: number;
  seasonSaves: number;
  seasonMinutesPlayed: number;
}

const CSV_DIR = join(process.cwd(), "src", "data");
const MEN_CSV = "historical-men.csv";
const WOMEN_CSV = "historical-women.csv";

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const n = Number(val.trim());
  return Number.isNaN(n) ? 0 : n;
}

function parseCsvRows(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function loadCsv(
  filename: string,
  team: "LFC Men" | "LFC Women"
): Map<string, HistoricalPlayerStats> {
  const map = new Map<string, HistoricalPlayerStats>();

  let content: string;
  try {
    content = readFileSync(join(CSV_DIR, filename), "utf-8");
  } catch {
    console.warn(`[alltime] CSV not found: ${filename}, skipping`);
    return map;
  }

  const rows = parseCsvRows(content);

  for (const row of rows) {
    const uuid = row["player_uuid"] || row["playerUuid"] || row["uuid"] || "";
    if (!uuid) continue;

    map.set(uuid, {
      playerUuid: uuid,
      name: row["name"] || row["fullName"] || "",
      team,
      appearances: parseNumber(row["appearances"]),
      goals: parseNumber(row["goals"]),
      assists: parseNumber(row["assists"]),
      cleanSheets: parseNumber(row["clean_sheets"] || row["cleanSheets"]),
      yellowCards: parseNumber(row["yellow_cards"] || row["yellowCards"]),
      redCards: parseNumber(row["red_cards"] || row["redCards"]),
      minutesPlayed: parseNumber(row["minutes_played"] || row["minutesPlayed"]),
      saves: parseNumber(row["saves"]),
    });
  }

  console.info(`[alltime] Loaded ${map.size} players from ${filename}`);
  return map;
}

let cachedMen: Map<string, HistoricalPlayerStats> | null = null;
let cachedWomen: Map<string, HistoricalPlayerStats> | null = null;

export function loadHistoricalData(): {
  men: Map<string, HistoricalPlayerStats>;
  women: Map<string, HistoricalPlayerStats>;
} {
  if (!cachedMen) cachedMen = loadCsv(MEN_CSV, "LFC Men");
  if (!cachedWomen) cachedWomen = loadCsv(WOMEN_CSV, "LFC Women");
  return { men: cachedMen, women: cachedWomen };
}

export function clearHistoricalCache(): void {
  cachedMen = null;
  cachedWomen = null;
}

/**
 * Merge historical base stats with live season aggregation.
 * Returns all-time totals per player UUID.
 */
export function mergeAllTimeStats(
  historical: Map<string, HistoricalPlayerStats>,
  seasonMap: Map<string, { games: number; goals: number; assists: number; saves: number; minutes: number }>
): Map<string, AllTimePlayerStats> {
  const allTime = new Map<string, AllTimePlayerStats>();

  // Start with all historical players
  for (const [uuid, hist] of historical) {
    const season = seasonMap.get(uuid);

    allTime.set(uuid, {
      ...hist,
      appearances: hist.appearances + (season?.games ?? 0),
      goals: hist.goals + (season?.goals ?? 0),
      assists: hist.assists + (season?.assists ?? 0),
      cleanSheets: hist.cleanSheets,
      saves: hist.saves + (season?.saves ?? 0),
      minutesPlayed: hist.minutesPlayed + (season?.minutes ?? 0),
      seasonAppearances: season?.games ?? 0,
      seasonGoals: season?.goals ?? 0,
      seasonAssists: season?.assists ?? 0,
      seasonCleanSheets: 0,
      seasonSaves: season?.saves ?? 0,
      seasonMinutesPlayed: season?.minutes ?? 0,
    });
  }

  return allTime;
}
