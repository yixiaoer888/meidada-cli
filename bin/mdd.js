#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const entrypoint = join(currentDirectory, "mdd-core.js");
const result = spawnSync(process.execPath, [entrypoint, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: {
        code: "spawn_failed",
        message: result.error.message,
        category: "environment",
        retryable: false,
      },
    }),
  );
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
