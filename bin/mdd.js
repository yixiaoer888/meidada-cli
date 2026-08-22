#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ensureExecutable } = require("./ensure-executable.cjs");
const { install, probeBinary, recoverOldBinary } = require("./install.cjs");
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
  let validationFailure = null;
  if (packaged.path) {
    try {
      recoverOldBinary(packaged.path, platform);
      probeBinary(packaged.path, packageVersion);
      return packaged.path;
    } catch (error) {
      validationFailure = error;
    }
  }

  const binaryPath = resolveBinaryPath(currentDirectory, platform, arch);
  if (binaryPath) {
    try {
      probeBinary(binaryPath, packageVersion);
      return binaryPath;
    } catch (error) {
      validationFailure = error;
    }
  }

  try {
    // optionalDependencies 不可用时，只按当前 package.json 版本下载一次官方发布资产。
    // install.cjs 会校验 HTTPS 主机、版本化文件名、SHA-256 和真实 JSON 版本，再原子写入用户 bin 目录。
    const installed = install(currentDirectory);
    probeBinary(installed, packageVersion);
    return installed;
  } catch (error) {
    const code = error?.errorCode || validationFailure?.errorCode || "CLI_BINARY_NOT_EXECUTABLE";
    console.error(
      JSON.stringify({
        ok: false,
        error: {
          code,
          message: "当前 CLI 原生二进制未通过版本验证。",
          category: "environment",
          hint: "请重新安装与 npm 包版本一致的官方 CLI。",
          retryable: true,
        },
      }),
    );
    process.exit(1);
  }
}

const binary = resolveBinary();
ensureExecutable(binary);
const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    MDD_NPM_PACKAGE_ROOT: dirname(currentDirectory),
    MDD_NPM_BIN_DIR: currentDirectory,
    MDD_NATIVE_BINARY_PATH: binary,
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
