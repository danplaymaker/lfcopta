/**
 * All-time stats service.
 *
 * Loads historical base data from JSON (keyed by player UUID),
 * then adds live Opta season stats on top to produce all-time totals.
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface HistoricalPlayerStats {
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
}

export interface AllTimePlayerStats {
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
}

const DATA_DIR = join(process.cwd(), "src", "data");

function loadJson(filename: string): Map<string, HistoricalPlayerStats> {
  const map = new Map<string, HistoricalPlayerStats>();

  let content: string;
  try {
    content = readFileSync(join(DATA_DIR, filename), "utf-8");
  } catch {
    console.warn(`[alltime] File not found: ${filename}, skipping`);
    return map;
  }

  const data = JSON.parse(content) as Record<string, unknown>;

  for (const [uuid, value] of Object.entries(data)) {
    if (uuid.startsWith("_") || typeof value !== "object" || !value) continue;

    const v = value as Record<string, unknown>;
    map.set(uuid, {
      name: String(v.name ?? ""),
      appearances: Number(v.appearances ?? 0),
      goals: Number(v.goals ?? 0),
      assists: Number(v.assists ?? 0),
      cleanSheets: Number(v.cleanSheets ?? 0),
      saves: Number(v.saves ?? 0),
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
  if (!cachedMen) cachedMen = loadJson("historical-men.json");
  if (!cachedWomen) cachedWomen = loadJson("historical-women.json");
  return { men: cachedMen, women: cachedWomen };
}

export function clearHistoricalCache(): void {
  cachedMen = null;
  cachedWomen = null;
}

/**
 * Merge historical base stats with live season stats.
 * Simple UUID lookup — no name matching needed.
 */
export function mergeAllTimeStats(
  historical: Map<string, HistoricalPlayerStats>,
  seasonMap: Map<string, { games: number; goals: number; assists: number; saves: number }>
): Map<string, AllTimePlayerStats> {
  const allTime = new Map<string, AllTimePlayerStats>();

  for (const [uuid, base] of historical) {
    const season = seasonMap.get(uuid);

    allTime.set(uuid, {
      name: base.name,
      appearances: base.appearances + (season?.games ?? 0),
      goals: base.goals + (season?.goals ?? 0),
      assists: base.assists + (season?.assists ?? 0),
      cleanSheets: base.cleanSheets,
      saves: base.saves + (season?.saves ?? 0),
    });
  }

  return allTime;
}
