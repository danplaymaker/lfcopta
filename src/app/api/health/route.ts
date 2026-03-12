import { NextResponse } from "next/server";
import { getProviderName } from "@/lib/providers/provider.factory";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    provider: getProviderName(),
    timestamp: new Date().toISOString(),
  });
}
