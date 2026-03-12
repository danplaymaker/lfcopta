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

    it("handles unknown slugs gracefully", async () => {
      const result = await provider.comparePlayers([
        "steven-gerrard",
        "unknown-player",
      ]);
      expect(result.players.length).toBe(1);
    });
  });
});
