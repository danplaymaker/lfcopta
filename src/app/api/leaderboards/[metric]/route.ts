import { NextRequest, NextResponse } from "next/server";
import {
  LeaderboardMetricSchema,
  LeaderboardQuerySchema,
} from "@/lib/schemas/query.schema";
import { getLeaderboard } from "@/lib/services/leaderboard.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metric: string }> }
) {
  const { metric } = await params;

  const metricResult = LeaderboardMetricSchema.safeParse(metric);
  if (!metricResult.success) {
    return NextResponse.json(
      {
        error: "Invalid metric",
        validMetrics: [
          "appearances",
          "goals",
          "assists",
          "cleanSheets",
          "yellowCards",
          "redCards",
          "minutesPlayed",
        ],
      },
      { status: 400 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = LeaderboardQuerySchema.safeParse({
    team: searchParams.get("team") ?? undefined,
    limit: searchParams.get("limit") ?? "20",
    verifiedOnly: searchParams.get("verifiedOnly") ?? undefined,
  });

  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: queryResult.error.issues,
      },
      { status: 400 }
    );
  }

  const leaderboard = await getLeaderboard(metricResult.data, queryResult.data);

  return NextResponse.json({
    metric: metricResult.data,
    leaderboard,
  });
}
