import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrollDevice, ensureDeviceIdentity, readDeviceIdentity } from "./device";

let tempRoot: string | null = null;

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("CLI device identity", () => {
  test("creates one stable clientId per local device file", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-device-test-"));
    const path = join(tempRoot, "device.json");

    const first = await ensureDeviceIdentity(path);
    const second = await ensureDeviceIdentity(path);

    expect(first.clientId).toMatch(/^cli_[a-f0-9]{32}$/);
    expect(second).toEqual(first);
    expect(await readDeviceIdentity(path)).toEqual(first);
  });

  test("sends the one-time registration token only to registration and returns the device token", async () => {
    const originalFetch = globalThis.fetch;
    let capturedAuthorization = "";
    let capturedBody = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedAuthorization = new Headers(init?.headers).get("authorization") || "";
      capturedBody = String(init?.body || "");
      return Response.json({
        code: 0,
        message: "ok",
        data: {
          device: { id: "device-1", clientId: "cli_test_device", name: "测试电脑", platform: "win32" },
          deviceToken: "mdk_device_token",
        },
      }, { status: 201 });
    }) as typeof fetch;

    try {
      tempRoot = await mkdtemp(join(tmpdir(), "mdd-enroll-test-"));
      const configDestination = join(tempRoot, "config.json");
      const result = await enrollDevice("https://example.com/", "mdk_master_key", {
        identity: {
          clientId: "cli_test_device",
          name: "测试电脑",
          platform: "win32",
        },
        configDestination,
      });
      expect(capturedAuthorization).toBe("Bearer mdk_master_key");
      expect(capturedBody).not.toContain("mdk_master_key");
      expect(result.registered.deviceToken).toBe("mdk_device_token");
      const saved = await readFile(configDestination, "utf8");
      expect(saved).toContain("mdk_device_token");
      expect(saved).not.toContain("mdk_master_key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
