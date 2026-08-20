const PACKAGE_SCOPE = "@meidada-cn";

const PLATFORM_PACKAGES = {
  "win32/x64": {
    packageName: `${PACKAGE_SCOPE}/cli-win32-x64`,
    binaryPath: "bin/mdd.exe",
  },
  "win32/arm64": {
    packageName: `${PACKAGE_SCOPE}/cli-win32-arm64`,
    binaryPath: "bin/mdd.exe",
  },
  "linux/x64": {
    packageName: `${PACKAGE_SCOPE}/cli-linux-x64`,
    binaryPath: "bin/mdd",
  },
  "linux/arm64": {
    packageName: `${PACKAGE_SCOPE}/cli-linux-arm64`,
    binaryPath: "bin/mdd",
  },
  "darwin/x64": {
    packageName: `${PACKAGE_SCOPE}/cli-darwin-x64`,
    binaryPath: "bin/mdd",
  },
  "darwin/arm64": {
    packageName: `${PACKAGE_SCOPE}/cli-darwin-arm64`,
    binaryPath: "bin/mdd",
  },
};

function getPlatformPackage(platform = process.platform, arch = process.arch) {
  return PLATFORM_PACKAGES[`${platform}/${arch}`] || null;
}

module.exports = { PLATFORM_PACKAGES, getPlatformPackage };
