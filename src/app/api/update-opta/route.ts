import { NextRequest, NextResponse } from "next/server";
import { SyncModeSchema } from "@/lib/schemas/opta.schema";
import {
  buildSideEnv,
  runForSide,
  publishSites,
} from "@/lib/services/sync.service";
import type { SyncResult } from "@/lib/services/sync.service";

export async function GET(request: NextRequest) {
  try {
    const modeParam =
      request.nextUrl.searchParams.get("mode") ||
      request.nextUrl.searchParams.get("run") ||
      "both";

    const modeResult = SyncModeSchema.safeParse(modeParam);
    if (!modeResult.success) {
      return NextResponse.json(
        {
          error: "Invalid mode",
          validModes: ["season", "ma2", "latest", "both"],
        },
        { status: 400 }
      );
    }
    const mode = modeResult.data;

    const menEnvResult = buildSideEnv("MEN", "men");
    const womenEnvResult = buildSideEnv("WOMEN", "women");

    const results: SyncResult[] = [];

    const runSide = async (
      envResult: ReturnType<typeof buildSideEnv>,
      label: string
    ): Promise<SyncResult> => {
      if (!envResult.valid) {
        console.warn(`[${label}] Skipping: ${envResult.reason}`);
        return { label, skipped: true, reason: envResult.reason };
      }

      // For "latest" mode, Webflow isn't needed
      if (
        mode !== "latest" &&
        (!envResult.env.WEBFLOW_COLLECTION_ID ||
          !envResult.env.WEBFLOW_API_TOKEN)
      ) {
        return { label, skipped: true, reason: "Missing Webflow config" };
      }

      return runForSide(envResult.env, mode);
    };

    const [menResult, womenResult] = await Promise.all([
      runSide(menEnvResult, "men"),
      runSide(womenEnvResult, "women"),
    ]);

    results.push(menResult, womenResult);

    await publishSites(results, mode);

    return NextResponse.json({
      ok: true,
      mode,
      men: menResult,
      women: womenResult,
    });
  } catch (err) {
    console.error("update-opta error:", err);
    return NextResponse.json(
      {
        error: "Server error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
