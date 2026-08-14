import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

describe("native postinstall", () => {
  test("does not fail npm install when binary download is unavailable", () => {
    const script = `
      const Module = require("node:module");
      const originalLoad = Module._load;
      Module._load = function(request, parent, isMain) {
        if (request === "./install.cjs") {
          return {
            isSupportedPlatform: () => true,
            install: () => { throw new Error("download unavailable"); }
          };
        }
        return originalLoad.call(this, request, parent, isMain);
      };
      require("./bin/postinstall.cjs");
    `;
    const result = spawnSync("node", ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("[mdd] postinstall failed:");
  });
});
