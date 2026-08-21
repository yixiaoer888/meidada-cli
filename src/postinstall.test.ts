import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

describe("native postinstall", () => {
  test("downloads the current binary when the platform package is missing", () => {
    const script = `
      const Module = require("node:module");
      const originalLoad = Module._load;
      let installed = false;
      Module._load = function(request, parent, isMain) {
        if (request === "./install.cjs") {
          return { isSupportedPlatform: () => true, install: () => { installed = true; } };
        }
        if (request === "./resolve-binary.cjs") {
          return { resolvePlatformBinary: () => ({ path: null }) };
        }
        return originalLoad.call(this, request, parent, isMain);
      };
      require("./bin/postinstall.cjs");
      if (!installed) process.exit(1);
    `;
    const result = spawnSync("node", ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
