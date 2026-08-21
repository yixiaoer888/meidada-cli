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
  console.error(`[mdd] postinstall failed: ${error.message}`);
  process.exit(1);
}
