#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ensureExecutable } = require("./ensure-executable.cjs");
const { install, recoverOldBinary } = require("./install.cjs");
const { getBinaryFilename, resolveBinaryPath, resolvePlatformBinary } = require("./resolve-binary.cjs");
const packageVersion = require("../package.json").version;

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

  const packaged = resolvePlatformBinary(currentDirectory, platform, arch);
  if (packaged.path) {
    recoverOldBinary(packaged.path, platform);
    ensureExecutable(packaged.path);
    const probe = spawnSync(packaged.path, ["--version"], { stdio: "ignore", windowsHide: true });
    if (probe.status === 0) return packaged.path;
  }

  const binaryPath = resolveBinaryPath(currentDirectory, platform, arch);
  if (!binaryPath) {
    try {
      // optionalDependencies 不可用时，只按当前 package.json 版本下载一次官方发布资产。
      // install.cjs 会校验 HTTPS 主机、版本化文件名和 SHA-256，再原子写入用户 bin 目录。
      return install(currentDirectory);
    } catch (error) {
      console.error(
        JSON.stringify({
          ok: false,
          error: {
            code: packaged.error === "platform_package_version_mismatch" ? packaged.error : "binary_download_failed",
            message: `当前平台包不可用，自动下载 CLI ${packageVersion} 二进制失败。`,
            category: "environment",
            hint: packaged.error === "missing_platform_package"
              ? `平台包 ${packaged.packageName} 未安装或当前 npm registry 尚未同步；自动下载失败：${error instanceof Error ? error.message : String(error)}`
              : `当前 CLI 与平台包版本不一致；自动下载失败：${error instanceof Error ? error.message : String(error)}`,
            nextCommand: `npm install -g @meidada-cn/cli@${packageVersion} --registry https://registry.npmjs.org --no-audit --no-fund`,
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
