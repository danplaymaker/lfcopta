import { describe, expect, it } from "vitest";
import { mergeAllTimeStats } from "@/lib/services/alltime.service";
import type {
  HistoricalPlayerStats,
  SeasonAllTimeContribution,
} from "@/lib/services/alltime.service";

const base = (over: Partial<HistoricalPlayerStats> = {}): HistoricalPlayerStats => ({
  name: "Test Player",
  appearances: 100,
  goals: 10,
  assists: 5,
  cleanSheets: 20,
  saves: 50,
  ...over,
});

describe("mergeAllTimeStats", () => {
  it("adds season clean sheets to the historical base", () => {
    const historical = new Map([["p1", base()]]);
    const season = new Map<string, SeasonAllTimeContribution>([
      ["p1", { games: 12, goals: 1, assists: 2, saves: 3, cleanSheets: 4 }],
    ]);

    const result = mergeAllTimeStats(historical, season).get("p1");

    expect(result).toEqual({
      name: "Test Player",
      appearances: 112,
      goals: 11,
      assists: 7,
      cleanSheets: 24,
      saves: 53,
    });
  });

  it("returns the historical base unchanged when the player has no season data", () => {
    const historical = new Map([["p1", base()]]);
    const result = mergeAllTimeStats(historical, new Map()).get("p1");
    expect(result?.cleanSheets).toBe(20);
    expect(result?.appearances).toBe(100);
  });
});
