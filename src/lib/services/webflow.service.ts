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
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Webflow fetch failed ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return json.items || [];
}

export async function updateWebflowItem(
  collectionId: string,
  token: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<unknown> {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fieldData: fields }),
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
 * BUG FIX: Added Content-Type header for JSON body.
 */
export async function publishWebflowSite(
  siteId: string,
  token: string
): Promise<unknown> {
  const url = `https://api.webflow.com/v2/sites/${siteId}/publish`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publishTo: ["production"] }),
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
