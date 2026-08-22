#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");
const { homedir } = require("node:os");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ensureExecutable } = require("./ensure-executable.cjs");

const PACKAGE_NAME = "mdd";
const ARCHIVE_PREFIX = "mdd-cli";
const VERSION = require("../package.json").version;
const DEFAULT_REPO = "yixiaoer888/meidada-cli";
const DEFAULT_BASE_URL = `https://github.com/${DEFAULT_REPO}/releases/download/v${VERSION}`;
const ALLOWED_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "registry.npmmirror.com",
]);

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

function validationError(errorCode, message) {
  const error = new Error(message);
  error.errorCode = errorCode;
  return error;
}

function parseVersionProbe(stdout, expectedVersion = VERSION) {
  const text = String(stdout || "").trim();
  if (!text) {
    throw validationError("CLI_BINARY_NOT_EXECUTABLE", "原生 CLI 版本探测没有输出。");
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw validationError("CLI_BINARY_NOT_EXECUTABLE", "原生 CLI 版本探测返回了无效数据。");
  }

  if (!payload || typeof payload !== "object" || typeof payload.version !== "string") {
    throw validationError("CLI_BINARY_NOT_EXECUTABLE", "原生 CLI 版本探测缺少版本信息。");
  }
  if (payload.version !== expectedVersion) {
    throw validationError("CLI_VERSION_MISMATCH", "原生 CLI 版本与 npm 包版本不一致。");
  }
  return payload;
}

function probeBinary(binaryPath, expectedVersion = VERSION, run = execFileSync) {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    throw validationError("CLI_BINARY_NOT_EXECUTABLE", "原生 CLI 文件不存在。");
  }

  try {
    ensureExecutable(binaryPath);
    const stdout = run(binaryPath, ["version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return parseVersionProbe(stdout, expectedVersion);
  } catch (error) {
    if (error && typeof error === "object" && error.errorCode) throw error;
    throw validationError("CLI_BINARY_NOT_EXECUTABLE", "原生 CLI 无法执行版本探测。");
  }
}

function getTarget(platform = process.platform, arch = process.arch) {
  const mappedPlatform = PLATFORM_MAP[platform];
  const mappedArch = ARCH_MAP[arch];
  if (!mappedPlatform || !mappedArch) {
    return null;
  }

  const ext = platform === "win32" ? "zip" : "tar.gz";
  const binaryExt = platform === "win32" ? ".exe" : "";
  const baseName = `${ARCHIVE_PREFIX}-${VERSION}-${mappedPlatform}-${mappedArch}`;

  return {
    platform,
    arch,
    mappedPlatform,
    mappedArch,
    archiveName: `${baseName}.${ext}`,
    binaryName: `${PACKAGE_NAME}-${VERSION}-${mappedPlatform}-${mappedArch}${binaryExt}`,
  };
}

function isSupportedPlatform(platform = process.platform, arch = process.arch) {
  return getTarget(platform, arch) !== null;
}

function getBinDir(baseDir = __dirname) {
  const customDir = (process.env.MDD_BINARY_DIR || "").trim();
  if (customDir) {
    return customDir;
  }

  return path.join(homedir(), ".mdd", "bin");
}

function getChecksumsPath(baseDir = __dirname) {
  return path.join(baseDir, "..", "checksums.txt");
}

function getBinaryPath(baseDir = __dirname, platform = process.platform, arch = process.arch) {
  const target = getTarget(platform, arch);
  if (!target) {
    return null;
  }

  return path.join(getBinDir(baseDir), target.binaryName);
}

function sleepSync(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function clearStaleInstallLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    if (!raw) return;
    const pid = Number.parseInt(raw, 10);
    if (!isProcessAlive(pid)) fs.rmSync(lockPath, { force: true });
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      try { fs.rmSync(lockPath, { force: true }); } catch { /* best effort */ }
    }
  }
}

function acquireInstallLock(lockPath, binaryPath, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${process.pid}\n`, "utf8");
      return fd;
    } catch (error) {
      if (error && error.code !== "EEXIST") throw error;
      if (fs.existsSync(binaryPath)) return null;
      clearStaleInstallLock(lockPath);
      sleepSync(200);
    }
  }
  throw new Error(`安装锁超时：${lockPath}`);
}

function releaseInstallLock(lockPath, fd) {
  if (fd === null || fd === undefined) return;
  try { fs.closeSync(fd); } catch { /* best effort */ }
  try { fs.rmSync(lockPath, { force: true }); } catch { /* best effort */ }
}

function recoverOldBinary(binaryPath, platform = process.platform) {
  if (platform !== "win32") return;
  const oldPath = `${binaryPath}.old`;
  if (!fs.existsSync(oldPath)) return;

  if (!fs.existsSync(binaryPath)) {
    fs.renameSync(oldPath, binaryPath);
    ensureExecutable(binaryPath);
    return;
  }

  try {
    probeBinary(binaryPath);
    fs.rmSync(oldPath, { force: true });
  } catch {
    fs.rmSync(binaryPath, { force: true });
    fs.renameSync(oldPath, binaryPath);
    ensureExecutable(binaryPath);
  }
}

function assertAllowedHost(url) {
  const hostname = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`Download host not allowed: ${hostname}`);
  }
}

function buildDownloadUrl(baseUrl, archiveName) {
  return `${baseUrl.replace(/\/+$/, "")}/${archiveName}`;
}

function downloadWithCurl(url, destPath, execFile = execFileSync) {
  assertAllowedHost(url);

  const args = [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "10",
    "--max-time",
    "120",
    "--max-redirs",
    "3",
    "--output",
    destPath,
  ];

  if (process.platform === "win32") {
    args.unshift("--ssl-revoke-best-effort");
  }

  args.push(url);
  execFile("curl", args, { stdio: ["ignore", "ignore", "pipe"] });
}

function downloadWithPowerShell(url, destPath, execFile = execFileSync) {
  assertAllowedHost(url);

  const psCommand =
    "$ProgressPreference='SilentlyContinue';" +
    "$ErrorActionPreference='Stop';" +
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" +
    "Invoke-WebRequest -UseBasicParsing -Uri $env:MDD_URL -OutFile $env:MDD_DEST";

  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", psCommand],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        MDD_URL: url,
        MDD_DEST: destPath,
      },
    },
  );
}

function download(url, destPath, platform = process.platform, execFile = execFileSync) {
  try {
    downloadWithCurl(url, destPath, execFile);
  } catch (error) {
    if (platform !== "win32") {
      throw error;
    }

    try {
      downloadWithPowerShell(url, destPath, execFile);
    } catch (fallbackError) {
      fallbackError.message = `${error.message}; fallback via PowerShell failed: ${fallbackError.message}`;
      throw fallbackError;
    }
  }
}

function parseChecksums(content) {
  const result = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const separator = trimmed.indexOf("  ");
    if (separator === -1) {
      continue;
    }

    result.set(trimmed.slice(separator + 2), trimmed.slice(0, separator));
  }

  return result;
}

function getExpectedChecksum(archiveName, checksumsPath = getChecksumsPath()) {
  if (!fs.existsSync(checksumsPath)) {
    return null;
  }

  const checksums = parseChecksums(fs.readFileSync(checksumsPath, "utf8"));
  return checksums.get(archiveName) || null;
}

function requireExpectedChecksum(archiveName, checksumsPath = getChecksumsPath()) {
  if (!fs.existsSync(checksumsPath)) {
    throw new Error(`Missing checksums.txt for ${archiveName}: ${checksumsPath}`);
  }

  const expectedHash = getExpectedChecksum(archiveName, checksumsPath);
  if (!expectedHash) {
    throw new Error(`Missing checksum for release asset: ${archiveName}`);
  }

  return expectedHash;
}

function verifyChecksum(archivePath, expectedHash) {
  if (typeof expectedHash !== "string" || expectedHash.length === 0) {
    throw new Error(`Missing expected checksum for ${path.basename(archivePath)}`);
  }

  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(archivePath, "r");

  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }

  const actualHash = hash.digest("hex");
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for ${path.basename(archivePath)}: expected ${expectedHash} but got ${actualHash}`,
    );
  }
}

function extractArchive(archivePath, destDir) {
  if (process.platform === "win32") {
    const psCommand =
      "$ErrorActionPreference='Stop';" +
      "Expand-Archive -LiteralPath $env:MDD_ARCHIVE -DestinationPath $env:MDD_DEST -Force";
    try {
      execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psCommand],
        {
          stdio: ["ignore", "ignore", "pipe"],
          env: {
            ...process.env,
            MDD_ARCHIVE: archivePath,
            MDD_DEST: destDir,
          },
        },
      );
    } catch (powershellError) {
      // 精简 Windows 环境可能没有加载 Microsoft.PowerShell.Archive，使用内置 ZIP 解压回退。
      try {
        extractZipSync(archivePath, destDir);
      } catch (fallbackError) {
        fallbackError.message = `${powershellError.message}; ZIP fallback failed: ${fallbackError.message}`;
        throw fallbackError;
      }
    }
    return;
  }

  execFileSync("tar", ["-xzf", archivePath, "-C", destDir], { stdio: "ignore" });
}

function resolveBaseUrl() {
  const customUrl = (process.env.MDD_DOWNLOAD_BASE_URL || "").trim();
  if (!customUrl) {
    return DEFAULT_BASE_URL;
  }

  ALLOWED_HOSTS.add(new URL(customUrl).hostname);
  return customUrl;
}

function extractZipSync(archivePath, destDir) {
  const buffer = fs.readFileSync(archivePath);
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const minimumEocdSize = 22;
  let eocdOffset = -1;
  for (let offset = buffer.length - minimumEocdSize; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP 文件缺少结束目录");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const centralEnd = offset + centralSize;
  const destination = path.resolve(destDir);
  for (let index = 0; index < entryCount && offset < centralEnd; index += 1) {
    if (buffer.readUInt32LE(offset) !== centralSignature) throw new Error("ZIP 中央目录损坏");
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength).replaceAll("/", path.sep);
    const target = path.resolve(destination, name);
    if (target !== destination && !target.startsWith(destination + path.sep)) {
      throw new Error("ZIP 条目不能写出目标目录");
    }
    if (buffer.readUInt32LE(localOffset) !== localSignature) throw new Error("ZIP 本地文件头损坏");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const isDirectory = name.endsWith(path.sep);
    if (isDirectory) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      let content;
      if (compression === 0) content = compressed;
      else if (compression === 8) content = zlib.inflateRawSync(compressed);
      else throw new Error(`ZIP 压缩格式不支持：${compression}`);
      if (content.length !== uncompressedSize) throw new Error(`ZIP 条目大小校验失败：${name}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function install(baseDir = __dirname, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const arch = dependencies.arch || process.arch;
  const downloadAsset = dependencies.download || download;
  const extract = dependencies.extractArchive || extractArchive;
  const probe = dependencies.probeBinary || probeBinary;
  const target = getTarget(platform, arch);
  if (!target) {
    throw new Error(`Unsupported platform: ${platform}/${arch}`);
  }

  const binDir = getBinDir(baseDir);
  const binaryPath = getBinaryPath(baseDir, platform, arch);
  fs.mkdirSync(binDir, { recursive: true });
  recoverOldBinary(binaryPath, platform);

  if (fs.existsSync(binaryPath)) {
    probe(binaryPath, VERSION);
    return binaryPath;
  }

  const lockPath = `${binaryPath}.lock`;
  const lockFd = acquireInstallLock(lockPath, binaryPath);
  if (lockFd === null) {
    probe(binaryPath, VERSION);
    return binaryPath;
  }

  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdd-install-"));
    const archivePath = path.join(tmpDir, target.archiveName);
    const downloadUrl = buildDownloadUrl(resolveBaseUrl(), target.archiveName);
    downloadAsset(downloadUrl, archivePath, platform);
    verifyChecksum(archivePath, requireExpectedChecksum(target.archiveName, getChecksumsPath(baseDir)));
    extract(archivePath, tmpDir);

    const extractedBinary = path.join(tmpDir, target.binaryName);
    if (!fs.existsSync(extractedBinary)) {
      throw new Error(`Extracted binary not found: ${target.binaryName}`);
    }

    // 文件存在和退出码为 0 都不足以证明它是当前版本 CLI；必须读取真实 JSON 版本。
    probe(extractedBinary, VERSION);

    // 先写入临时目标并完成权限处理，再原子替换，避免留下半成品二进制。
    const stagedBinaryPath = `${binaryPath}.partial-${process.pid}`;
    const oldBinaryPath = `${binaryPath}.old`;
    let movedOldBinary = false;
    try {
      fs.copyFileSync(extractedBinary, stagedBinaryPath);
      ensureExecutable(stagedBinaryPath);
      probe(stagedBinaryPath, VERSION);
      if (fs.existsSync(binaryPath) && platform === "win32") {
        fs.renameSync(binaryPath, oldBinaryPath);
        movedOldBinary = true;
      }
      fs.renameSync(stagedBinaryPath, binaryPath);
      probe(binaryPath, VERSION);
      if (movedOldBinary) fs.rmSync(oldBinaryPath, { force: true });
    } catch (error) {
      if (movedOldBinary && !fs.existsSync(binaryPath) && fs.existsSync(oldBinaryPath)) {
        fs.renameSync(oldBinaryPath, binaryPath);
      }
      throw error;
    } finally {
      fs.rmSync(stagedBinaryPath, { force: true });
    }
    return binaryPath;
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    releaseInstallLock(lockPath, lockFd);
  }
}

if (require.main === module) {
  try {
    install();
  } catch (error) {
    const code = error && typeof error === "object" && error.errorCode ? error.errorCode : "CLI_BINARY_NOT_EXECUTABLE";
    console.error(JSON.stringify({ ok: false, error: { code, message: "CLI 原生二进制安装或版本验证失败。" } }));
    process.exit(1);
  }
}

module.exports = {
  ALLOWED_HOSTS,
  buildDownloadUrl,
  download,
  downloadWithCurl,
  downloadWithPowerShell,
  getBinaryPath,
  getBinDir,
  recoverOldBinary,
  acquireInstallLock,
  getExpectedChecksum,
  requireExpectedChecksum,
  getTarget,
  extractArchive,
  extractZipSync,
  install,
  isSupportedPlatform,
  parseChecksums,
  parseVersionProbe,
  probeBinary,
  verifyChecksum,
};
