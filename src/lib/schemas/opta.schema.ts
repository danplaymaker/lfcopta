import { z } from "zod/v4";

export const SideEnvSchema = z.object({
  SIDE_LABEL: z.string(),
  OUTLET_API_KEY: z.string().min(1),
  OUTLET_SECRET_KEY: z.string().min(1),
  OPTA_CONTESTANT_ID: z.string().min(1),
  TMCL_IDS: z.array(z.string().min(1)).min(1),
  WEBFLOW_COLLECTION_ID: z.string().min(1),
  WEBFLOW_SITE_ID: z.string().optional(),
  WEBFLOW_API_TOKEN: z.string().min(1),
});

export type SideEnv = z.infer<typeof SideEnvSchema>;

export const SyncModeSchema = z.enum(["season", "ma2", "latest", "both"]);
export type SyncMode = z.infer<typeof SyncModeSchema>;
