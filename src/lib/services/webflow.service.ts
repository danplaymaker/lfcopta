/**
 * Webflow CMS API service.
 */

const WF_PLAYER_UUID_FIELD = "player-uuid";

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

    const res = await fetch(url, {
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

  const res = await fetch(url, {
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

  const res = await fetch(url, {
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

    const res = await fetch(url, {
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

  const res = await fetch(url, {
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
