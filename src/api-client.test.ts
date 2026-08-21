import { describe, expect, test } from "bun:test";
import { ApiClient } from "./api-client";

describe("API authentication errors", () => {
  test("distinguishes an expired device token from an enrollment key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json(
      { code: 40101, message: "expired" },
      { status: 401 },
    )) as unknown as typeof fetch;
    try {
      await expect(new ApiClient({ apiUrl: "https://api.example.com", apiKey: "device-token" }).get("/profile"))
        .rejects.toThrow("设备令牌已失效");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not expose the bearer token in an authentication error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json(
      { code: 40102, message: "unauthorized" },
      { status: 401 },
    )) as unknown as typeof fetch;
    try {
      await expect(new ApiClient({ apiUrl: "https://api.example.com", apiKey: "secret-device-token" }).get("/profile"))
        .rejects.not.toThrow("secret-device-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
