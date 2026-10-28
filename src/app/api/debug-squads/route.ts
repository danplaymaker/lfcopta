import { NextResponse } from "next/server";
import { buildSideEnv } from "@/lib/services/sync.service";
import {
  getOptaAccessToken,
  fetchSquadsForContestant,
  fetchActiveCalendars,
} from "@/lib/services/opta.service";

/**
 * Diagnostic endpoint: lists current Opta squads (player UUIDs + names)
 * for each side, plus the tournament calendar IDs they belong to.
 * Read-only — nothing is written to Webflow.
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
      const squads = await fetchSquadsForContestant(
        env.OUTLET_API_KEY,
        env.OPTA_CONTESTANT_ID,
        token
      );
      let activeCalendars: unknown;
      try {
        activeCalendars = await fetchActiveCalendars(env.OUTLET_API_KEY, token);
      } catch (err) {
        activeCalendars = { error: err instanceof Error ? err.message : String(err) };
      }
      results[label] = {
        activeCalendars,
        contestantId: env.OPTA_CONTESTANT_ID,
        configuredTmclIds: env.TMCL_IDS,
        squads,
      };
    } catch (err) {
      results[label] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(results);
}
