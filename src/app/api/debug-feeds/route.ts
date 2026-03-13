import { NextResponse } from "next/server";
import { buildSideEnv } from "@/lib/services/sync.service";
import {
  getOptaAccessToken,
  fetchMa1ForTmcl,
} from "@/lib/services/opta.service";

/**
 * Diagnostic endpoint: tests Opta MA1 connectivity for each side/TMCL.
 * Returns fixture counts without writing to Webflow.
 */
export async function GET() {
  const results: Record<string, unknown> = {};

  for (const [prefix, label] of [
    ["MEN", "men"],
    ["WOMEN", "women"],
  ] as const) {
    const envResult = buildSideEnv(prefix, label);

    if (!envResult.valid) {
      results[label] = { skipped: true, reason: envResult.reason };
      continue;
    }

    const env = envResult.env;

    try {
      const token = await getOptaAccessToken(
        env.OUTLET_API_KEY,
        env.OUTLET_SECRET_KEY
      );

      const tmclResults: Array<{
        tmclId: string;
        fixtureCount: number | null;
        error?: string;
      }> = [];

      for (const tmcl of env.TMCL_IDS) {
        try {
          const fixtures = await fetchMa1ForTmcl(
            env.OUTLET_API_KEY,
            tmcl,
            env.OPTA_CONTESTANT_ID,
            token,
            label
          );
          tmclResults.push({
            tmclId: tmcl,
            fixtureCount: fixtures ? fixtures.length : 0,
          });
        } catch (err) {
          tmclResults.push({
            tmclId: tmcl,
            fixtureCount: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      results[label] = {
        contestantId: env.OPTA_CONTESTANT_ID,
        tmclIds: env.TMCL_IDS,
        tokenOk: true,
        tmclResults,
        totalFixtures: tmclResults.reduce(
          (sum, r) => sum + (r.fixtureCount ?? 0),
          0
        ),
      };
    } catch (err) {
      results[label] = {
        contestantId: env.OPTA_CONTESTANT_ID,
        tokenOk: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(results);
}
