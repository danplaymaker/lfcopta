import type { DataProvider } from "./provider.types";
import { MockProvider } from "./mock.provider";
import { StaticProvider } from "./static.provider";
import { StatsPerformProvider } from "./statsperform.provider";

let cachedProvider: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.DATA_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      cachedProvider = new MockProvider();
      break;
    case "static":
      cachedProvider = new StaticProvider();
      break;
    case "statsperform":
      cachedProvider = new StatsPerformProvider();
      break;
    default:
      throw new Error(`Unknown data provider: ${providerName}`);
  }

  return cachedProvider;
}

export function getProviderName(): string {
  return process.env.DATA_PROVIDER ?? "mock";
}
