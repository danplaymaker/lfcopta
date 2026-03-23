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
 * Fetch all domain IDs for a Webflow site (custom + staging).
 */
async function fetchDomainIds(
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
 * Publish a Webflow site by auto-fetching its domain IDs first.
 */
export async function publishWebflowSite(
  siteId: string,
  token: string
): Promise<unknown> {
  const domainIds = await fetchDomainIds(siteId, token);

  if (domainIds.length === 0) {
    throw new Error(
      "Webflow publish failed: no domains found for site. Check your WEBFLOW_SITE_ID."
    );
  }

  const url = `https://api.webflow.com/v2/sites/${siteId}/publish`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publishTo: domainIds }),
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
