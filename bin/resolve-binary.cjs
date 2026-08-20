const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getBinaryPath, getTarget } = require("./install.cjs");
const { getPlatformPackage } = require("./platform-packages.cjs");

function getBinaryFilename(platform = os.platform(), arch = os.arch()) {
  const target = getTarget(platform, arch);
  return target ? target.binaryName : null;
}

function resolveBinaryPath(baseDir = __dirname, platform = os.platform(), arch = os.arch()) {
  const binaryPath = getBinaryPath(baseDir, platform, arch);
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    return null;
  }

  return binaryPath;
}

function resolvePlatformBinary(baseDir = __dirname, platform = os.platform(), arch = os.arch()) {
  const platformPackage = getPlatformPackage(platform, arch);
  if (!platformPackage) return { path: null, error: "unsupported_platform" };

  try {
    const packageJsonPath = require.resolve(`${platformPackage.packageName}/package.json`, { paths: [baseDir] });
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const expectedVersion = require(path.join(baseDir, "..", "package.json")).version;
    if (packageJson.version !== expectedVersion) {
      return { path: null, error: "platform_package_version_mismatch", packageName: platformPackage.packageName };
    }

    const binaryPath = path.join(path.dirname(packageJsonPath), platformPackage.binaryPath);
    if (!fs.existsSync(binaryPath)) return { path: null, error: "missing_platform_package", packageName: platformPackage.packageName };
    return { path: binaryPath, error: null, packageName: platformPackage.packageName };
  } catch {
    return { path: null, error: "missing_platform_package", packageName: platformPackage.packageName };
  }
}

module.exports = {
  getBinaryFilename,
  resolvePlatformBinary,
  resolveBinaryPath,
};
