#!/usr/bin/env node

const { install, isSupportedPlatform } = require("./install.cjs");
const { resolvePlatformBinary } = require("./resolve-binary.cjs");

try {
  if (!isSupportedPlatform(process.platform, process.arch)) {
    process.exit(0);
  }

  if (resolvePlatformBinary(__dirname).path) process.exit(0);
  install();
} catch (error) {
  console.error(`[mdd] postinstall failed: ${error.message}`);
  process.exit(0);
}
