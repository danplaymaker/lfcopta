/**
 * Run this script on the deployed environment to export player UUIDs
 * from the Webflow CMS. Then paste the output into historical-men.json.
 *
 * Usage (via Vercel or locally with env vars):
 *   npx tsx scripts/export-uuids.ts
 *
 * Or just hit GET /api/player-uuids on the deployed app.
 */

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

if (!WEBFLOW_API_TOKEN || !COLLECTION_ID) {
  console.error("Set WEBFLOW_API_TOKEN and WEBFLOW_COLLECTION_ID env vars");
  process.exit(1);
}

async function fetchAll() {
  const items: Array<{ id: string; fieldData: Record<string, unknown> }> = [];
  let offset = 0;

  while (true) {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items?limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${WEBFLOW_API_TOKEN}` } }
    );

    if (!res.ok) {
      console.error(`Webflow API error: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    items.push(...(data.items || []));
    if ((data.items || []).length < 100) break;
    offset += 100;
  }

  return items;
}

async function main() {
  const items = await fetchAll();
  const result: Record<string, { name: string }> = {};

  for (const item of items) {
    const uuid = item.fieldData?.["player-uuid"];
    const name = item.fieldData?.["name"];
    if (typeof uuid === "string" && uuid && typeof name === "string") {
      result[uuid] = { name };
    }
  }

  console.log(JSON.stringify(result, null, 2));
  console.error(`\nExported ${Object.keys(result).length} players`);
}

main();
