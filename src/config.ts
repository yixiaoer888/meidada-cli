import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";

export type CliConfig = {
  apiUrl: string;
  apiKey: string;
  clientId?: string;
  deviceName?: string;
};

export const configPath = join(homedir(), ".mdd", "config.json");
export const legacyConfigPath = join(homedir(), ".config", "mdd", "config.json");
export const deviceTokenEnv = "MDD_DEVICE_TOKEN";
export const DEFAULT_API_URL = "https://www.meidada.cn";

export type ConfigLocations = {
  current: string;
  legacy: string;
};

const defaultConfigLocations: ConfigLocations = {
  current: configPath,
  legacy: legacyConfigPath,
};

function normalizeApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

async function readConfigFile(path: string): Promise<CliConfig | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<CliConfig>;
    if (!parsed.apiUrl || !parsed.apiKey) return null;
    return {
      apiUrl: normalizeApiUrl(parsed.apiUrl),
      apiKey: parsed.apiKey,
      ...(parsed.clientId ? { clientId: parsed.clientId } : {}),
      ...(parsed.deviceName ? { deviceName: parsed.deviceName } : {}),
    };
  } catch {
    return null;
  }
}

export async function readConfig(locations = defaultConfigLocations): Promise<CliConfig | null> {
  const current = await readConfigFile(locations.current);
  if (current) return current;

  const legacy = await readConfigFile(locations.legacy);
  if (!legacy) return null;

  // A read-only legacy config must remain usable even if migration cannot write.
  await saveConfig(legacy, locations.current).catch(() => undefined);
  return legacy;
}

export async function resolveConfig(): Promise<CliConfig> {
  const file = await readConfig();
  const apiUrl = file?.apiUrl || process.env.MDD_API_URL;
  const apiKey = file?.apiKey || process.env[deviceTokenEnv];
  if (!apiUrl || !apiKey) {
    throw new Error(`CLI 尚未配置，请先执行 mdd config init。配置文件：${configPath}`);
  }
  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    ...(file?.clientId ? { clientId: file.clientId } : {}),
    ...(file?.deviceName ? { deviceName: file.deviceName } : {}),
  };
}

export async function saveConfig(config: CliConfig, destination = configPath) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    `${JSON.stringify({ ...config, apiUrl: normalizeApiUrl(config.apiUrl) }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  if (process.platform !== "win32") await chmod(destination, 0o600);
}

export async function promptValue(label: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  const value = await new Promise<string>((resolve) => readline.question(`${label}: `, resolve));
  readline.close();
  return value.trim();
}

export async function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY) return promptValue(label);

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stderr.write(`${label}: `);

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.off("keypress", onKeypress);
      process.stderr.write("\n");
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("已取消"));
        return;
      }
      if (key.name === "return") {
        cleanup();
        resolve(value.trim());
        return;
      }
      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (character && !key.ctrl) value += character;
    };
    process.stdin.on("keypress", onKeypress);
  });
}

export async function readApiKeyFromStdin(input: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const stream = input as NodeJS.ReadableStream & { readableEnded?: boolean; read?: () => unknown };
  const buffered = typeof stream.read === "function" ? stream.read() : null;
  if (buffered !== null && buffered !== undefined) {
    const value = typeof buffered === "string" ? buffered : Buffer.from(buffered as Uint8Array).toString("utf8");
    const key = value.split(/\r?\n/, 1)[0]!.trim();
    if (key) return key;
  }
  if (stream.readableEnded) throw new Error("标准输入中的一次性部署 API Key 为空");

  if (typeof stream.read !== "function") {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Uint8Array | string) => {
        const value = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        const key = value.split(/\r?\n/, 1)[0]!.trim();
        if (key) { stream.off?.("data", onData); resolve(key); }
      };
      stream.on("data", onData);
      stream.once?.("end", () => reject(new Error("标准输入中的一次性部署 API Key 为空")));
      stream.once?.("error", reject);
    });
  }

  // Resolve on the first line so a pipe that stays open cannot block registration.
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    const key = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve(value!.trim());
      };
      lines.once("line", (line) => {
        const value = line.trim();
        finish(value ? undefined : new Error("标准输入中的一次性部署 API Key 为空"), value);
      });
      lines.once("close", () => finish(new Error("标准输入中的一次性部署 API Key 为空")));
      input.once?.("error", (error: Error) => finish(error));
    });
    if (!key) throw new Error("标准输入中的一次性部署 API Key 为空");
    return key;
  } finally {
    lines.close();
  }
}
