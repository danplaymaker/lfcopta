import { describe, it, expect } from "vitest";
import {
  getFixtureKickoffDate,
  findLatestPlayedFixture,
  getMatchId,
} from "@/lib/services/opta.service";

describe("getMatchId", () => {
  it("extracts matchId from top level", () => {
    expect(getMatchId({ matchId: "abc" })).toBe("abc");
  });

  it("falls back to matchInfo.id", () => {
    expect(getMatchId({ matchInfo: { id: "def" } })).toBe("def");
  });

  it("falls back to id", () => {
    expect(getMatchId({ id: "ghi" })).toBe("ghi");
  });

  it("returns undefined if no id found", () => {
    expect(getMatchId({})).toBeUndefined();
  });
});

describe("getFixtureKickoffDate", () => {
  it("BUG FIX: preserves timezone Z in ISO dates", () => {
    const fx = { matchInfo: { date: "2024-12-25T15:00:00Z" } };
    const date = getFixtureKickoffDate(fx);
    expect(date).not.toBeNull();
    expect(date!.toISOString()).toBe("2024-12-25T15:00:00.000Z");
  });

  it("parses matchDateTimeUTC", () => {
    const fx = { matchDateTimeUTC: "2024-06-01T19:45:00Z" };
    const date = getFixtureKickoffDate(fx);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2024);
  });

  it("returns null for fixture with no date", () => {
    const date = getFixtureKickoffDate({});
    expect(date).toBeNull();
  });
});

describe("findLatestPlayedFixture", () => {
  it("BUG FIX: returns the chronologically latest played fixture", () => {
    const fixtures = [
      {
        matchId: "old",
        matchInfo: { date: "2024-01-01T15:00:00Z", matchStatus: "Played" },
      },
      {
        matchId: "newest",
        matchInfo: { date: "2024-03-15T15:00:00Z", matchStatus: "Played" },
      },
      {
        matchId: "middle",
        matchInfo: { date: "2024-02-10T15:00:00Z", matchStatus: "Played" },
      },
    ];

    const result = findLatestPlayedFixture(fixtures);
    expect(result).not.toBeNull();
    expect(result!.matchId).toBe("newest");
  });

  it("skips unplayed fixtures", () => {
    const fixtures = [
      {
        matchId: "played",
        matchInfo: { date: "2024-01-01T15:00:00Z", matchStatus: "Played" },
      },
      {
        matchId: "future",
        matchInfo: { date: "2099-12-31T15:00:00Z", matchStatus: "Fixture" },
      },
    ];

    const result = findLatestPlayedFixture(fixtures);
    expect(result!.matchId).toBe("played");
  });

  it("returns null for empty fixtures", () => {
    expect(findLatestPlayedFixture([])).toBeNull();
  });
});
