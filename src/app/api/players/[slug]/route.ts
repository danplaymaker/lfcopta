import { NextResponse } from "next/server";
import { getPlayerBySlug } from "@/lib/services/players.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  return NextResponse.json(player);
}
