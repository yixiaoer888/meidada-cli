#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ensureExecutable } = require("./ensure-executable.cjs");
const { install } = require("./install.cjs");
const { getBinaryFilename, resolveBinaryPath } = require("./resolve-binary.cjs");

function resolveBinary() {
  const platform = process.platform;
  const arch = process.arch;
  const key = `${platform}/${arch}`;
  const filename = getBinaryFilename(platform, arch);
  if (!filename) {
    console.error(
      JSON.stringify({
        ok: false,
        error: {
          code: "unsupported_platform",
          message: `No packaged mdd binary for ${key}`,
          category: "environment",
          retryable: false,
        },
      }),
    );
    process.exit(1);
  }

  const binaryPath = resolveBinaryPath(currentDirectory, platform, arch);
  if (!binaryPath) {
    try {
      return install(currentDirectory);
    } catch (error) {
      console.error(
        JSON.stringify({
          ok: false,
          error: {
            code: "missing_binary",
            message: `Expected packaged binary not found: ${filename}`,
            category: "environment",
            hint: `Automatic install failed: ${error instanceof Error ? error.message : String(error)}`,
            nextCommand: "mdd update",
            retryable: true,
          },
        }),
      );
      process.exit(1);
    }
  }

  return binaryPath;
}

const binary = resolveBinary();
ensureExecutable(binary);
const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    MDD_NPM_PACKAGE_ROOT: dirname(currentDirectory),
    MDD_NPM_BIN_DIR: currentDirectory,
    MDD_LAUNCHER_ENTRYPOINT: join(currentDirectory, "mdd.js"),
  },
});

if (result.error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: {
        code: "spawn_failed",
        message: result.error.message,
        category: "environment",
        hint: "Check that the packaged binary has execute permission and matches the current platform.",
        retryable: false,
      },
    }),
  );
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
