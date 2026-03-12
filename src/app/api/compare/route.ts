import { NextRequest, NextResponse } from "next/server";
import { CompareQuerySchema } from "@/lib/schemas/query.schema";
import { comparePlayers } from "@/lib/services/compare.service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const parseResult = CompareQuerySchema.safeParse({
    players: searchParams.get("players") ?? "",
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters. Provide comma-separated player slugs.",
        details: parseResult.error.issues,
      },
      { status: 400 }
    );
  }

  const slugs = parseResult.data.players.split(",").map((s) => s.trim());

  if (slugs.length < 2) {
    return NextResponse.json(
      { error: "At least two player slugs are required for comparison." },
      { status: 400 }
    );
  }

  const result = await comparePlayers(slugs);

  if (result.players.length === 0) {
    return NextResponse.json(
      { error: "No matching players found." },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
