import { NextRequest, NextResponse } from "next/server";
import { PlayersQuerySchema } from "@/lib/schemas/query.schema";
import { getPlayers } from "@/lib/services/players.service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const parseResult = PlayersQuerySchema.safeParse({
    team: searchParams.get("team") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    sort: searchParams.get("sort") ?? "appearances",
    order: searchParams.get("order") ?? "desc",
    limit: searchParams.get("limit") ?? "20",
    offset: searchParams.get("offset") ?? "0",
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await getPlayers(parseResult.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/players] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch players", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
