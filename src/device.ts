import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { saveConfig } from "./config";

export type DeviceIdentity = {
  clientId: string;
  name: string;
  platform: string;
};

export const devicePath = join(homedir(), ".mdd", "device.json");

export async function readDeviceIdentity(path = devicePath): Promise<DeviceIdentity | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<DeviceIdentity>;
    if (!value.clientId || !value.name || !value.platform) return null;
    return { clientId: value.clientId, name: value.name, platform: value.platform };
  } catch {
    return null;
  }
}

export async function ensureDeviceIdentity(path = devicePath): Promise<DeviceIdentity> {
  const current = await readDeviceIdentity(path);
  if (current) return current;

  const identity: DeviceIdentity = {
    clientId: `cli_${randomUUID().replaceAll("-", "")}`,
    name: hostname() || "CLI 设备",
    platform: platform(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return identity;
}

type Envelope<T> = { code: number; message: string; data: T };

export class DeviceRegistrationError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number) {
    super(message);
  }
}

export async function registerDevice(apiUrl: string, enrollmentKey: string, identity: DeviceIdentity) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/cli/devices/register`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${enrollmentKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(identity),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => null)) as Envelope<{
    device: DeviceIdentity & { id: string };
    deviceToken: string;
  }> | null;
  if (!response.ok || !body || body.code !== 0) {
    const message = response.status === 401 || body?.code === 40101
      ? "一次性部署 API Key 无效或已过期；请重新生成后在本地终端执行 mdd config init"
      : body?.message || `设备注册失败（HTTP ${response.status}）`;
    throw new DeviceRegistrationError(message, response.status, body?.code);
  }
  if (!body.data.deviceToken) throw new Error("设备注册响应缺少设备令牌，未写入本地配置");
  return body.data;
}

export async function enrollDevice(
  apiUrl: string,
  enrollmentKey: string,
  options: { identity?: DeviceIdentity; configDestination?: string } = {},
) {
  const identity = options.identity ?? await ensureDeviceIdentity();
  const registered = await registerDevice(apiUrl, enrollmentKey, identity);
  await saveConfig({
    apiUrl,
    apiKey: registered.deviceToken,
    clientId: identity.clientId,
    deviceName: registered.device.name,
  }, options.configDestination);
  return { identity, registered };
}
