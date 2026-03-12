import { MockProvider } from "./mock.provider";

// Static provider uses the same logic as mock but would load
// club-approved JSON datasets in production.
// For now it extends MockProvider as a placeholder.
export class StaticProvider extends MockProvider {
  name = "static";
}
