import { getProvider } from "@/lib/providers/provider.factory";

export async function comparePlayers(slugs: string[]) {
  const provider = getProvider();
  return provider.comparePlayers(slugs);
}
