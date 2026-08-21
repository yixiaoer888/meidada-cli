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

const emptyStdinApiKeyError = () => new Error("标准输入中的一次性部署 API Key 为空");

function parseApiKey(value: string): string {
  const key = value.replace(/\r$/, "").trim();
  if (!key) throw emptyStdinApiKeyError();
  return key;
}

function firstLine(value: string): string | null {
  const newline = value.indexOf("\n");
  return newline === -1 ? null : value.slice(0, newline);
}

async function readApiKeyFromBunStdin(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return parseApiKey(buffered + decoder.decode());

      buffered += decoder.decode(value, { stream: true });
      const line = firstLine(buffered);
      if (line !== null) return parseApiKey(line);
    }
  } finally {
    reader.releaseLock();
  }
}

async function readApiKeyFromNodeStdin(input: NodeJS.ReadableStream): Promise<string> {
  const stream = input as NodeJS.ReadableStream & { readableEnded?: boolean; read?: () => unknown };
  let buffered = "";
  const available = typeof stream.read === "function" ? stream.read() : null;
  if (available !== null && available !== undefined) {
    buffered = typeof available === "string" ? available : Buffer.from(available as Uint8Array).toString("utf8");
    const line = firstLine(buffered);
    if (line !== null) return parseApiKey(line);
  }
  if (stream.readableEnded) return parseApiKey(buffered);

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.off?.("data", onData);
      stream.off?.("end", onEnd);
      stream.off?.("error", onError);
    };
    const finish = (callback: () => string) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(callback());
      } catch (error) {
        reject(error);
      }
    };
    const onData = (chunk: Uint8Array | string) => {
      buffered += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      const line = firstLine(buffered);
      if (line !== null) finish(() => parseApiKey(line));
    };
    const onEnd = () => finish(() => parseApiKey(buffered));
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    stream.on("data", onData);
    stream.once?.("end", onEnd);
    stream.once?.("error", onError);

    // stdin may have ended between the initial check and listener registration.
    if (stream.readableEnded) onEnd();
  });
}

export async function readApiKeyFromStdin(
  input: NodeJS.ReadableStream = process.stdin,
  bunStdinStream?: ReadableStream<Uint8Array>,
): Promise<string> {
  const nativeBunStdin = input === process.stdin && process.platform === "win32" && typeof Bun !== "undefined"
    ? Bun.stdin.stream()
    : undefined;
  const stream = bunStdinStream ?? nativeBunStdin;
  return stream ? readApiKeyFromBunStdin(stream) : readApiKeyFromNodeStdin(input);
}
