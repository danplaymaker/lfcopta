/**
 * All-time stats service.
 *
 * Loads historical base data from CSV, then merges with live Opta season
 * data to produce all-time career totals per player.
 *
 * CSV rows are matched to Opta players by UUID (preferred) or by name (fallback).
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

/**
 * Loaded historical data with both UUID-keyed and name-keyed lookups.
 */
export interface HistoricalDataSet {
  byUuid: Map<string, HistoricalPlayerStats>;
  byName: Map<string, HistoricalPlayerStats>;
}

function loadCsv(
  filename: string,
  team: "LFC Men" | "LFC Women"
): HistoricalDataSet {
  const byUuid = new Map<string, HistoricalPlayerStats>();
  const byName = new Map<string, HistoricalPlayerStats>();

  let content: string;
  try {
    content = readFileSync(join(CSV_DIR, filename), "utf-8");
  } catch {
    console.warn(`[alltime] CSV not found: ${filename}, skipping`);
    return { byUuid, byName };
  }

  const rows = parseCsvRows(content);

  for (const row of rows) {
    const uuid = row["player_uuid"] || row["playerUuid"] || row["uuid"] || "";
    const name = row["name"] || row["fullName"] || "";
    if (!name && !uuid) continue;

    const stats: HistoricalPlayerStats = {
      playerUuid: uuid,
      name,
      team,
      appearances: parseNumber(row["appearances"]),
      goals: parseNumber(row["goals"]),
      assists: parseNumber(row["assists"]),
      cleanSheets: parseNumber(row["clean_sheets"] || row["cleanSheets"]),
      yellowCards: parseNumber(row["yellow_cards"] || row["yellowCards"]),
      redCards: parseNumber(row["red_cards"] || row["redCards"]),
      minutesPlayed: parseNumber(row["minutes_played"] || row["minutesPlayed"]),
      saves: parseNumber(row["saves"]),
    };

    if (uuid) byUuid.set(uuid, stats);
    if (name) byName.set(normaliseName(name), stats);
  }

  console.info(`[alltime] Loaded ${byUuid.size + byName.size} entries from ${filename} (${byUuid.size} by UUID, ${byName.size} by name)`);
  return { byUuid, byName };
}

/**
 * Normalise a player name for fuzzy matching:
 * lowercase, strip accents, collapse whitespace.
 */
function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cachedMen: HistoricalDataSet | null = null;
let cachedWomen: HistoricalDataSet | null = null;

export function loadHistoricalData(): {
  men: HistoricalDataSet;
  women: HistoricalDataSet;
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
 * Look up a player in the historical dataset.
 * Tries UUID first, then falls back to name matching.
 */
function findHistorical(
  dataset: HistoricalDataSet,
  uuid: string,
  name: string
): HistoricalPlayerStats | undefined {
  if (uuid && dataset.byUuid.has(uuid)) {
    return dataset.byUuid.get(uuid);
  }
  if (name) {
    return dataset.byName.get(normaliseName(name));
  }
  return undefined;
}

/**
 * Merge historical base stats with live season aggregation.
 * Returns all-time totals keyed by player UUID.
 *
 * seasonMap is keyed by player UUID with name for fallback matching.
 */
export function mergeAllTimeStats(
  historical: HistoricalDataSet,
  seasonMap: Map<string, { name: string; games: number; goals: number; assists: number; saves: number; minutes: number }>
): Map<string, AllTimePlayerStats> {
  const allTime = new Map<string, AllTimePlayerStats>();

  for (const [uuid, season] of seasonMap) {
    const hist = findHistorical(historical, uuid, season.name);
    if (!hist) continue;

    allTime.set(uuid, {
      ...hist,
      playerUuid: uuid,
      appearances: hist.appearances + season.games,
      goals: hist.goals + season.goals,
      assists: hist.assists + season.assists,
      cleanSheets: hist.cleanSheets,
      saves: hist.saves + season.saves,
      minutesPlayed: hist.minutesPlayed + season.minutes,
      seasonAppearances: season.games,
      seasonGoals: season.goals,
      seasonAssists: season.assists,
      seasonCleanSheets: 0,
      seasonSaves: season.saves,
      seasonMinutesPlayed: season.minutes,
    });
  }

  return allTime;
}
