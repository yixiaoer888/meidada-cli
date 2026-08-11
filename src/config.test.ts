import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readConfig, saveConfig, type ConfigLocations } from "./config";

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
});
