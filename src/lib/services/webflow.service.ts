/**
 * Webflow CMS API service.
 */

const WF_PLAYER_UUID_FIELD = "player-uuid";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;
const MAX_DELAY_MS = 30_000;
const BULK_BATCH_SIZE = 100;

type Sleep = (ms: number) => Promise<void>;
let sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Test hook: replace the delay function used between retries. */
export function setWebflowSleep(fn: Sleep): void {
  sleep = fn;
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_DELAY_MS);
  }
  return Math.min(1000 * 2 ** attempt, MAX_DELAY_MS);
}

/**
 * fetch() for the Webflow API that retries rate limits (429) and
 * transient gateway errors (5xx), honouring Retry-After when present.
 */
export async function webflowFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  let res = await fetch(url, init);
  for (
    let attempt = 1;
    attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(res.status);
    attempt++
  ) {
    const delay = retryDelayMs(res, attempt);
    console.warn(
      `Webflow ${res.status} on ${init.method ?? "GET"} ${url}, retry ${attempt} in ${delay}ms`
    );
    await sleep(delay);
    res = await fetch(url, init);
  }
  return res;
}

function stripEmptyFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) clean[key] = value;
  }
  return clean;
}

export interface WebflowItemUpdate {
  id: string;
  fieldData: Record<string, unknown>;
}

/**
 * Update many items with Webflow's bulk endpoint (100 items per request),
 * instead of one PATCH per item, to stay inside the API rate limit.
 */
export async function updateWebflowItemsBulk(
  collectionId: string,
  token: string,
  updates: WebflowItemUpdate[]
): Promise<void> {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items`;

  for (let i = 0; i < updates.length; i += BULK_BATCH_SIZE) {
    const batch = updates.slice(i, i + BULK_BATCH_SIZE).map((u) => ({
      id: u.id,
      fieldData: stripEmptyFields(u.fieldData),
    }));

    const res = await webflowFetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: batch }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Webflow bulk PATCH error:", { status: res.status, body: text });
      throw new Error(`Webflow bulk update failed ${res.status}: ${text}`);
    }
  }
}

export interface WebflowItem {
  id: string;
  fieldData?: Record<string, unknown>;
}

export async function fetchAllWebflowItems(
  collectionId: string,
  token: string
): Promise<WebflowItem[]> {
  const allItems: WebflowItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=${limit}&offset=${offset}`;

    const res = await webflowFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(
        `Webflow fetch failed ${res.status}: ${await res.text()}`
      );
    }

    const json = await res.json();
    const items: WebflowItem[] = json.items || [];
    allItems.push(...items);

    if (items.length < limit) break;
    offset += limit;
  }

  return allItems;
}

export async function updateWebflowItem(
  collectionId: string,
  token: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}`;

  // Strip fields with undefined/null values so missing Webflow fields don't cause validation errors
  const cleanFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      cleanFields[key] = value;
    }
  }

  const res = await webflowFetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fieldData: cleanFields }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Webflow PATCH error:", {
      status: res.status,
      itemId,
      body: text,
    });
    throw new Error(`Webflow update failed ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Fetch custom domain IDs for a Webflow site.
 */
async function fetchCustomDomainIds(
  siteId: string,
  token: string
): Promise<string[]> {
  const url = `https://api.webflow.com/v2/sites/${siteId}/custom_domains`;

  const res = await webflowFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(
      `Webflow domain fetch failed ${res.status}: ${await res.text()}`
    );
  }

  const json = await res.json();
  const domains: { id: string }[] = json.customDomains || [];
  return domains.map((d) => d.id);
}

/**
 * Publish specific CMS items so they go live immediately.
 * Uses Webflow v2 collection items publish endpoint.
 */
export async function publishWebflowItems(
  collectionId: string,
  token: string,
  itemIds: string[]
): Promise<void> {
  if (itemIds.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items/publish`;

    const res = await webflowFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemIds: batch }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Webflow items publish error:", {
        status: res.status,
        body: text,
      });
      throw new Error(
        `Webflow items publish failed ${res.status}: ${text}`
      );
    }
  }
}

/**
 * Publish a Webflow site to its staging subdomain and any custom domains.
 */
export async function publishWebflowSite(
  siteId: string,
  token: string
): Promise<unknown> {
  const customDomainIds = await fetchCustomDomainIds(siteId, token);

  const url = `https://api.webflow.com/v2/sites/${siteId}/publish`;

  const body: Record<string, unknown> = {
    publishToWebflowSubdomain: true,
  };

  if (customDomainIds.length > 0) {
    body.customDomains = customDomainIds;
  }

  const res = await webflowFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Webflow publish failed ${res.status}: ${await res.text()}`
    );
  }

  return res.json();
}

/**
 * Build a lookup from player UUID → Webflow item.
 */
export function buildWebflowIndex(
  items: WebflowItem[]
): Map<string, WebflowItem> {
  const index = new Map<string, WebflowItem>();
  for (const item of items) {
    const uuid = item.fieldData?.[WF_PLAYER_UUID_FIELD];
    if (typeof uuid === "string" && uuid) {
      index.set(uuid, item);
    }
  }
  return index;
}
