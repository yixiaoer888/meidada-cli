import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const platformPackages = require("../bin/platform-packages.cjs") as {
  getPlatformPackage: (platform: string, arch: string) => { packageName: string; binaryPath: string } | null;
};

describe("platform npm packages", () => {
  test("maps every supported Node platform and architecture to one package", () => {
    expect(platformPackages.getPlatformPackage("win32", "x64")).toEqual({ packageName: "@meidada-cn/cli-win32-x64", binaryPath: "bin/mdd.exe" });
    expect(platformPackages.getPlatformPackage("win32", "arm64")).toEqual({ packageName: "@meidada-cn/cli-win32-arm64", binaryPath: "bin/mdd.exe" });
    expect(platformPackages.getPlatformPackage("linux", "x64")).toEqual({ packageName: "@meidada-cn/cli-linux-x64", binaryPath: "bin/mdd" });
    expect(platformPackages.getPlatformPackage("linux", "arm64")).toEqual({ packageName: "@meidada-cn/cli-linux-arm64", binaryPath: "bin/mdd" });
    expect(platformPackages.getPlatformPackage("darwin", "x64")).toEqual({ packageName: "@meidada-cn/cli-darwin-x64", binaryPath: "bin/mdd" });
    expect(platformPackages.getPlatformPackage("darwin", "arm64")).toEqual({ packageName: "@meidada-cn/cli-darwin-arm64", binaryPath: "bin/mdd" });
    expect(platformPackages.getPlatformPackage("freebsd", "x64")).toBeNull();
  });
});
