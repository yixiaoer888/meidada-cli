import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { EventEmitter, once } from "node:events";
import { PassThrough, Readable } from "node:stream";
import { readApiKeyFromStdin, readConfig, saveConfig, type ConfigLocations } from "./config";

const sample = {
  apiUrl: "https://example.com/",
  apiKey: "mdk_test_config",
};

let tempRoot: string | null = null;

async function locations(): Promise<ConfigLocations> {
  tempRoot = await mkdtemp(join(tmpdir(), "mdd-config-test-"));
  return {
    current: join(tempRoot, ".mdd", "config.json"),
    legacy: join(tempRoot, ".config", "mdd", "config.json"),
  };
}

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("CLI config", () => {
  test("reads a piped API key followed by a newline", async () => {
    const input = new EventEmitter() as NodeJS.ReadableStream;
    const pending = readApiKeyFromStdin(input);
    input.emit("data", "piped-deployment-key\n");
    await expect(pending).resolves.toBe("piped-deployment-key");
  });

  test("reads a piped API key without a newline when stdin reaches EOF", async () => {
    const stream = new Blob(["piped-deployment-key"]).stream();
    await expect(readApiKeyFromStdin(new PassThrough(), stream)).resolves.toBe("piped-deployment-key");
  });

  test("rejects an already-ended empty stdin instead of exiting silently", async () => {
    const input = Readable.from([]);
    input.resume();
    await once(input, "end");
    const stream = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
    await expect(readApiKeyFromStdin(input, stream)).rejects.toThrow("标准输入中的一次性部署 API Key 为空");
  });

  test("rejects empty piped input", async () => {
    const stream = new Blob([" \r\n"]).stream();
    await expect(readApiKeyFromStdin(new PassThrough(), stream)).rejects.toThrow("标准输入中的一次性部署 API Key 为空");
  });

  test("Bun stdin resolves on the first line while the pipe remains open", async () => {
    const input = new PassThrough();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("native-piped-key\r\n"));
      },
    });

    const key = await Promise.race([
      readApiKeyFromStdin(input, stream),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("读取 stdin 超时")), 200)),
    ]);
    expect(key).toBe("native-piped-key");
  });

  test("persists config in the user-level .mdd directory", async () => {
    const paths = await locations();
    await saveConfig(sample, paths.current);

    expect(JSON.parse(await readFile(paths.current, "utf8"))).toEqual({
      apiUrl: "https://example.com",
      apiKey: sample.apiKey,
    });
    expect(await readConfig(paths)).toEqual({
      apiUrl: "https://example.com",
      apiKey: sample.apiKey,
    });
  });

  test("migrates the legacy config on first read", async () => {
    const paths = await locations();
    await mkdir(dirname(paths.legacy), { recursive: true });
    await writeFile(paths.legacy, JSON.stringify(sample), "utf8");

    expect(await readConfig(paths)).toEqual({
      apiUrl: "https://example.com",
      apiKey: sample.apiKey,
    });
    expect(JSON.parse(await readFile(paths.current, "utf8"))).toEqual({
      apiUrl: "https://example.com",
      apiKey: sample.apiKey,
    });
  });

  test("reads and trims a one-time deployment key from stdin", async () => {
    expect(await readApiKeyFromStdin(Readable.from(["  deployment-key\n"]))).toBe("deployment-key");
    await expect(readApiKeyFromStdin(Readable.from([" \n "]))).rejects.toThrow("标准输入中的一次性部署 API Key 为空");
  });
});
