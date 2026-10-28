import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setWebflowSleep,
  updateWebflowItemsBulk,
  webflowFetch,
} from "@/lib/services/webflow.service";

function jsonResponse(status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("webflow.service", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sleeps: number[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    sleeps.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    setWebflowSleep(async (ms) => {
      sleeps.push(ms);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("webflowFetch", () => {
    it("retries 429 using Retry-After, then succeeds", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { "retry-after": "3" }))
        .mockResolvedValueOnce(jsonResponse(200));

      const res = await webflowFetch("https://api.webflow.com/x", {
        method: "PATCH",
      });

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([3000]);
    });

    it("retries transient 502s with backoff", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(502))
        .mockResolvedValueOnce(jsonResponse(502))
        .mockResolvedValueOnce(jsonResponse(200));

      const res = await webflowFetch("https://api.webflow.com/x", {});

      expect(res.status).toBe(200);
      expect(sleeps).toEqual([2000, 4000]);
    });

    it("does not retry client errors", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400));

      const res = await webflowFetch("https://api.webflow.com/x", {});

      expect(res.status).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("gives up after the maximum number of attempts", async () => {
      fetchMock.mockImplementation(async () => jsonResponse(429));

      const res = await webflowFetch("https://api.webflow.com/x", {});

      expect(res.status).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
  });

  describe("updateWebflowItemsBulk", () => {
    it("batches updates 100 at a time and strips empty fields", async () => {
      fetchMock.mockImplementation(async () => jsonResponse(200));

      const updates = Array.from({ length: 150 }, (_, i) => ({
        id: `item-${i}`,
        fieldData: { games: i, flag: null, order: undefined },
      }));

      await updateWebflowItemsBulk("col", "token", updates);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.webflow.com/v2/collections/col/items");
      expect(init?.method).toBe("PATCH");

      const firstBody = JSON.parse(String(init?.body));
      const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(firstBody.items).toHaveLength(100);
      expect(secondBody.items).toHaveLength(50);
      expect(firstBody.items[1]).toEqual({
        id: "item-1",
        fieldData: { games: 1 },
      });
    });

    it("makes no request when there is nothing to update", async () => {
      await updateWebflowItemsBulk("col", "token", []);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when Webflow rejects the batch", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400));

      await expect(
        updateWebflowItemsBulk("col", "token", [
          { id: "a", fieldData: { games: 1 } },
        ])
      ).rejects.toThrow("Webflow bulk update failed 400");
    });
  });
});
