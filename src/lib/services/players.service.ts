import { getProvider } from "@/lib/providers/provider.factory";
import type { PlayersQuery } from "@/lib/schemas/query.schema";

export async function getPlayers(query: PlayersQuery) {
  const provider = getProvider();
  return provider.getPlayers(query);
}

export async function getPlayerBySlug(slug: string) {
  const provider = getProvider();
  return provider.getPlayerBySlug(slug);
}

export async function getPlayerById(id: string) {
  const provider = getProvider();
  return provider.getPlayerById(id);
}
