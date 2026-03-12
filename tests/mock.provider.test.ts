import { describe, it, expect, beforeAll } from "vitest";
import { MockProvider } from "@/lib/providers/mock.provider";
import type { PlayersQuery, LeaderboardQuery } from "@/lib/schemas/query.schema";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeAll(() => {
    provider = new MockProvider();
  });

  describe("getPlayers", () => {
    it("returns all players with default query", async () => {
      const query: PlayersQuery = {
        sort: "appearances",
        order: "desc",
        limit: 20,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      expect(result.players.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it("filters by men team", async () => {
      const query: PlayersQuery = {
        team: "men",
        sort: "appearances",
        order: "desc",
        limit: 20,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      result.players.forEach((p) => {
        expect(p.team).toBe("LFC Men");
      });
    });

    it("filters by women team", async () => {
      const query: PlayersQuery = {
        team: "women",
        sort: "appearances",
        order: "desc",
        limit: 20,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      result.players.forEach((p) => {
        expect(p.team).toBe("LFC Women");
      });
    });

    it("searches by name", async () => {
      const query: PlayersQuery = {
        search: "gerrard",
        sort: "appearances",
        order: "desc",
        limit: 20,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      expect(result.players.length).toBe(1);
      expect(result.players[0].slug).toBe("steven-gerrard");
    });

    it("sorts by goals descending", async () => {
      const query: PlayersQuery = {
        sort: "goals",
        order: "desc",
        limit: 5,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      for (let i = 1; i < result.players.length; i++) {
        expect((result.players[i - 1].goals ?? 0)).toBeGreaterThanOrEqual(
          result.players[i].goals ?? 0
        );
      }
    });

    it("paginates correctly", async () => {
      const query: PlayersQuery = {
        sort: "appearances",
        order: "desc",
        limit: 3,
        offset: 0,
      };
      const page1 = await provider.getPlayers(query);
      const page2 = await provider.getPlayers({ ...query, offset: 3 });

      expect(page1.players.length).toBe(3);
      expect(page2.players.length).toBeGreaterThan(0);
      expect(page1.players[0].slug).not.toBe(page2.players[0].slug);
    });
  });

  describe("getPlayerBySlug", () => {
    it("returns a player by slug", async () => {
      const player = await provider.getPlayerBySlug("steven-gerrard");
      expect(player).not.toBeNull();
      expect(player!.fullName).toBe("Steven Gerrard");
    });

    it("returns null for unknown slug", async () => {
      const player = await provider.getPlayerBySlug("unknown-player");
      expect(player).toBeNull();
    });
  });

  describe("getPlayerById", () => {
    it("finds by playerId", async () => {
      const player = await provider.getPlayerById("lfc-001");
      expect(player).not.toBeNull();
      expect(player!.slug).toBe("steven-gerrard");
    });

    it("finds by optaPlayerId", async () => {
      const player = await provider.getPlayerById("p14306");
      expect(player).not.toBeNull();
      expect(player!.slug).toBe("steven-gerrard");
    });

    it("returns null for unknown id", async () => {
      const player = await provider.getPlayerById("unknown-id");
      expect(player).toBeNull();
    });
  });

  describe("getLeaderboard", () => {
    it("returns goals leaderboard sorted descending", async () => {
      const query: LeaderboardQuery = { limit: 5 };
      const result = await provider.getLeaderboard("goals", query);
      expect(result.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].value).toBeGreaterThanOrEqual(result[i].value);
      }
      expect(result[0].rank).toBe(1);
    });

    it("filters by team", async () => {
      const query: LeaderboardQuery = { team: "women", limit: 20 };
      const result = await provider.getLeaderboard("goals", query);
      result.forEach((entry) => {
        expect(entry.player.team).toBe("LFC Women");
      });
    });

    it("filters by verified only", async () => {
      const query: LeaderboardQuery = { verifiedOnly: true, limit: 20 };
      const result = await provider.getLeaderboard("appearances", query);
      result.forEach((entry) => {
        expect(entry.player.metadata?.verified).toBe(true);
      });
    });

    it("returns clean sheets leaderboard", async () => {
      const query: LeaderboardQuery = { limit: 20 };
      const result = await provider.getLeaderboard("cleanSheets", query);
      result.forEach((entry) => {
        expect(entry.value).toBeGreaterThan(0);
      });
    });

    it("returns detailed stats leaderboard (tackles)", async () => {
      const query: LeaderboardQuery = { limit: 5 };
      const result = await provider.getLeaderboard("tackles", query);
      expect(result.length).toBeGreaterThan(0);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].value).toBeGreaterThanOrEqual(result[i].value);
      }
      // Gerrard should be top tackler in mock data (1230)
      expect(result[0].player.slug).toBe("steven-gerrard");
    });

    it("returns detailed stats leaderboard (shots)", async () => {
      const query: LeaderboardQuery = { limit: 3 };
      const result = await provider.getLeaderboard("shots", query);
      expect(result.length).toBe(3);
      // Rush has most shots (2100)
      expect(result[0].player.slug).toBe("ian-rush");
      expect(result[0].value).toBe(2100);
    });

    it("returns saves leaderboard (goalkeeper stat)", async () => {
      const query: LeaderboardQuery = { limit: 5 };
      const result = await provider.getLeaderboard("saves", query);
      // Only Alisson has saves in mock data
      expect(result.length).toBe(1);
      expect(result[0].player.slug).toBe("alisson-becker");
      expect(result[0].value).toBe(890);
    });

    it("can sort players by detailed stat field", async () => {
      const query: PlayersQuery = {
        sort: "tackles",
        order: "desc",
        limit: 3,
        offset: 0,
      };
      const result = await provider.getPlayers(query);
      expect(result.players.length).toBe(3);
      const tackles = result.players.map(
        (p) => p.detailedStats?.tackles ?? 0
      );
      expect(tackles[0]).toBeGreaterThanOrEqual(tackles[1]);
      expect(tackles[1]).toBeGreaterThanOrEqual(tackles[2]);
    });
  });

  describe("detailedStats and percentages", () => {
    it("players have detailedStats populated", async () => {
      const player = await provider.getPlayerBySlug("steven-gerrard");
      expect(player).not.toBeNull();
      expect(player!.detailedStats).toBeDefined();
      expect(player!.detailedStats!.shots).toBe(1450);
      expect(player!.detailedStats!.tackles).toBe(1230);
      expect(player!.detailedStats!.passes).toBe(32450);
    });

    it("players have percentage stats", async () => {
      const player = await provider.getPlayerBySlug("steven-gerrard");
      expect(player!.percentages).toBeDefined();
      expect(player!.percentages!.shotAccuracy).toBe(43);
      expect(player!.percentages!.passAccuracy).toBe(81);
    });

    it("goalkeeper has save percentage", async () => {
      const player = await provider.getPlayerBySlug("alisson-becker");
      expect(player!.percentages).toBeDefined();
      expect(player!.percentages!.savePercentage).toBe(79);
    });

    it("current season data is present for active players", async () => {
      const player = await provider.getPlayerBySlug("mohamed-salah");
      expect(player!.currentSeason).toBeDefined();
      expect(player!.currentSeason!.season).toBe("2024-25");
      expect(player!.currentSeason!.games).toBe(32);
      expect(player!.currentSeason!.detailedStats).toBeDefined();
      expect(player!.currentSeason!.percentages).toBeDefined();
    });

    it("last match data is present for players with recent games", async () => {
      const player = await provider.getPlayerBySlug("mohamed-salah");
      expect(player!.lastMatch).toBeDefined();
      expect(player!.lastMatch!.matchId).toBe("mock-match-001");
      expect(player!.lastMatch!.stats).toBeDefined();
      expect(player!.lastMatch!.stats!.goals).toBe(1);
      expect(player!.lastMatch!.percentages).toBeDefined();
      expect(player!.lastMatch!.percentages!.shotAccuracy).toBe(60);
    });
  });

  describe("comparePlayers", () => {
    it("compares two players", async () => {
      const result = await provider.comparePlayers([
        "ian-rush",
        "steven-gerrard",
      ]);
      expect(result.players.length).toBe(2);
      expect(result.metrics.length).toBeGreaterThan(0);

      const goalsMetric = result.metrics.find((m) => m.metric === "goals");
      expect(goalsMetric).toBeDefined();
      expect(goalsMetric!.values.length).toBe(2);
    });

    it("comparison includes detailed stat metrics", async () => {
      const result = await provider.comparePlayers([
        "ian-rush",
        "steven-gerrard",
      ]);

      const tacklesMetric = result.metrics.find(
        (m) => m.metric === "tackles"
      );
      expect(tacklesMetric).toBeDefined();

      const shotsMetric = result.metrics.find((m) => m.metric === "shots");
      expect(shotsMetric).toBeDefined();

      const passesMetric = result.metrics.find(
        (m) => m.metric === "passes"
      );
      expect(passesMetric).toBeDefined();
    });

    it("handles unknown slugs gracefully", async () => {
      const result = await provider.comparePlayers([
        "steven-gerrard",
        "unknown-player",
      ]);
      expect(result.players.length).toBe(1);
    });
  });
});
