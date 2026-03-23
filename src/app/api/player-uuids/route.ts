import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers/provider.factory";

/**
 * GET /api/player-uuids
 *
 * Utility endpoint: returns all player UUIDs and names from the active provider.
 * Use this to populate the historical CSV with correct player_uuid values.
 */
export async function GET() {
  try {
    const provider = getProvider();
    const { players } = await provider.getPlayers({
      sort: "appearances",
      order: "desc",
      limit: 200,
      offset: 0,
    });

    const mapping = players.map((p) => ({
      player_uuid: p.statsPerformPlayerId || p.playerId,
      fullName: p.fullName,
      team: p.team,
      appearances: p.appearances,
    }));

    return NextResponse.json({ players: mapping, total: mapping.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
