import { NextRequest, NextResponse } from "next/server";
import { buildSideEnv } from "@/lib/services/sync.service";
import { getOptaAccessToken } from "@/lib/services/opta.service";
import { buildRawSeasonReport } from "@/lib/services/diagnostics.service";

export const maxDuration = 300;

/**
 * Diagnostic endpoint: raw Opta MA2 season totals per player.
 * Read-only — nothing is written to Webflow. ?side=men|women
 */
export async function GET(request: NextRequest) {
  const side = request.nextUrl.searchParams.get("side") === "women" ? "women" : "men";
  const envResult = buildSideEnv(side === "men" ? "MEN" : "WOMEN", side);
  if (!envResult.valid) {
    return NextResponse.json({ error: envResult.reason }, { status: 400 });
  }

  try {
    const token = await getOptaAccessToken(
      envResult.env.OUTLET_API_KEY,
      envResult.env.OUTLET_SECRET_KEY
    );
    const report = await buildRawSeasonReport(envResult.env, token);
    return NextResponse.json({ side, ...report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
