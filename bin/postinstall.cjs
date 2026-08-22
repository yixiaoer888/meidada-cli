#!/usr/bin/env node

const { install, isSupportedPlatform } = require("./install.cjs");
const { resolvePlatformBinary } = require("./resolve-binary.cjs");

try {
  if (!isSupportedPlatform(process.platform, process.arch)) {
    process.exit(0);
  }

  // 优先使用 npm optionalDependencies；平台包缺失时，受控下载当前版本官方资产。
  if (!resolvePlatformBinary(__dirname).path) install(__dirname);
} catch (error) {
  const code = error && typeof error === "object" && error.errorCode ? error.errorCode : "CLI_BINARY_NOT_EXECUTABLE";
  console.error(`[mdd] ${JSON.stringify({ ok: false, error: { code, message: "CLI 原生二进制安装或版本验证失败。" } })}`);
  process.exit(1);
}
