import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { CLI_VERSION } from "./version";
import { syncSkill, type SyncSkillOptions } from "./skill";

const PACKAGE_NAME = "@meidada-cn/cli";
const PACKAGE_PATH_SEGMENTS = PACKAGE_NAME.split("/");
const UPDATE_METADATA_TIMEOUT_MS = 10_000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type InstallContext = {
  installRoot: string;
  packageRoot: string;
  npmExecutable: string;
  cliExecutable: string;
  launcherPath?: string;
  binaryExecutable?: string;
};

export type ProcessResult = { code: number; stdout: string; stderr: string };
export type UpdateFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type UpdateDependencies = {
  fetch: UpdateFetch;
  runProcess: (executable: string, args: string[]) => Promise<ProcessResult>;
  resolveInstallContext: () => InstallContext;
  syncSkill?: typeof syncSkill;
  pathExists?: (path: string) => boolean;
  readPackageVersion?: (packageRoot: string) => string | null;
  getRegistry?: () => Promise<string>;
};

export type UpdateOptions = {
  confirmed: boolean;
  check?: boolean;
  registry?: string;
  skill?: SyncSkillOptions;
};

const OFFICIAL_REGISTRY = "https://registry.npmjs.org/";
function normalizeRegistry(value: string) {
  const registry = value.trim();
  if (!/^https:\/\//i.test(registry)) throw new Error("npm registry 必须使用 HTTPS 地址");
  const parsed = new URL(registry);
  if (parsed.username || parsed.password) throw new Error("npm registry 不得包含认证信息");
  return `${registry.replace(/\/+$/, "")}/`;
}

function versionParts(value: string) {
  if (!VERSION_PATTERN.test(value)) throw new Error(`无效的 CLI 版本号：${value}`);
  return value.split("-", 1)[0]!.split(".").map(Number);
}

function compareVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!;
  }
  return left.localeCompare(right);
}

function validatePackageMetadata(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("npm 包元数据格式无效");
  const metadata = value as { name?: unknown; version?: unknown };
  if (metadata.name !== PACKAGE_NAME) throw new Error(`npm 返回了非预期包：${String(metadata.name || "未知")}`);
  if (typeof metadata.version !== "string") throw new Error("npm 包元数据缺少版本号");
  versionParts(metadata.version);
  return { name: PACKAGE_NAME, version: metadata.version };
}

function npmExecutableFor(nodeExecutable: string, platform: string) {
  const npmCandidate = join(dirname(nodeExecutable), platform === "win32" ? "npm.cmd" : "npm");
  return existsSync(npmCandidate) ? npmCandidate : platform === "win32" ? "npm.cmd" : "npm";
}

function cliExecutableFor(installRoot: string, platform: string) {
  return platform === "win32" ? join(installRoot, "mdd.cmd") : join(installRoot, "bin", "mdd");
}

function nativeBinaryFor(platform: string, arch: string, env: NodeJS.ProcessEnv) {
  const fromLauncher = env.MDD_NATIVE_BINARY_PATH?.trim();
  if (fromLauncher) return resolve(fromLauncher);
  const platformName = platform === "win32" ? "windows" : platform;
  const archName = arch === "x64" ? "amd64" : arch;
  const extension = platform === "win32" ? ".exe" : "";
  return join(homedir(), ".mdd", "bin", `mdd-${CLI_VERSION}-${platformName}-${archName}${extension}`);
}

function deriveInstallRootFromPackageRoot(packageRoot: string) {
  const normalized = resolve(packageRoot);
  const marker = `${sep}node_modules${sep}${PACKAGE_PATH_SEGMENTS.join(sep)}`;
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker.toLowerCase());
  if (markerIndex < 0) return null;

  const root = normalized.slice(0, markerIndex);
  return root.endsWith(`${sep}lib`) ? dirname(root) : root;
}

function validatePackageRoot(packageRoot: string) {
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`mdd update 找不到 npm 包目录中的 package.json：${packageRoot}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
  if (packageJson.name !== PACKAGE_NAME) {
    throw new Error(`mdd update 找到了非预期 npm 包：${String(packageJson.name || "未知")}`);
  }
}

export function resolveCurrentInstall(
  entrypoint: string = process.argv[1] || "",
  nodeExecutable = process.execPath,
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): InstallContext {
  const envPackageRoot = env.MDD_NPM_PACKAGE_ROOT?.trim();
  if (envPackageRoot) {
    const packageRoot = resolve(envPackageRoot);
    validatePackageRoot(packageRoot);
    const installRoot = deriveInstallRootFromPackageRoot(packageRoot);
    if (!installRoot) {
      throw new Error(`mdd update 无法从 npm 包目录推导安装根目录：${packageRoot}`);
    }

    return {
      installRoot,
      packageRoot,
      npmExecutable: npmExecutableFor(nodeExecutable, platform),
      cliExecutable: cliExecutableFor(installRoot, platform),
      launcherPath: cliExecutableFor(installRoot, platform),
      binaryExecutable: nativeBinaryFor(platform, process.arch, env),
    };
  }

  const normalized = resolve(entrypoint);
  const marker = `${sep}node_modules${sep}${PACKAGE_PATH_SEGMENTS.join(sep)}${sep}`;
  const markerIndex = `${normalized}${sep}`.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex < 0) {
    throw new Error(`mdd update 请从 npm 全局安装的 launcher 执行，或通过 ${PACKAGE_NAME} 的 npm 包入口启动`);
  }
  const installRoot = normalized.slice(0, markerIndex);
  const packageRoot = join(installRoot, "node_modules", ...PACKAGE_PATH_SEGMENTS);
  validatePackageRoot(packageRoot);
  return {
    installRoot,
    packageRoot,
    npmExecutable: npmExecutableFor(nodeExecutable, platform),
    cliExecutable: cliExecutableFor(installRoot, platform),
    launcherPath: cliExecutableFor(installRoot, platform),
    binaryExecutable: nativeBinaryFor(platform, process.arch, env),
  };
}

export async function runProcess(executable: string, args: string[]): Promise<ProcessResult> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ code: code ?? 1, stdout, stderr }));
  });
}

const defaultDependencies: UpdateDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  runProcess,
  resolveInstallContext: resolveCurrentInstall,
  syncSkill,
  pathExists: existsSync,
  getRegistry: async () => {
    const result = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["config", "get", "registry"]);
    return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : OFFICIAL_REGISTRY;
  },
};

async function requireSuccess(
  dependencies: UpdateDependencies,
  executable: string,
  args: string[],
  label: string,
) {
  const result = await dependencies.runProcess(executable, args);
  if (result.code !== 0) {
    throw validationError("CLI_UPDATE_FAILED", `${label}失败。`);
  }
  return result;
}

function validationError(errorCode: string, message: string) {
  const error = new Error(message) as Error & { errorCode?: string };
  error.errorCode = errorCode;
  return error;
}

function validateVersionResult(result: ProcessResult, expectedVersion: string, errorCode: string, label: string) {
  if (result.code !== 0) throw validationError(errorCode, `${label}未通过版本验证。`);
  const text = result.stdout.trim();
  if (!text) throw validationError(errorCode, `${label}版本探测没有输出。`);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw validationError(errorCode, `${label}版本探测返回了无效数据。`);
  }
  const version = payload && typeof payload === "object" && "version" in payload
    ? (payload as { version?: unknown }).version
    : undefined;
  if (typeof version !== "string") throw validationError(errorCode, `${label}版本探测缺少版本信息。`);
  if (version !== expectedVersion) throw validationError("CLI_VERSION_MISMATCH", `${label}版本与 npm 包版本不一致。`);
  return payload;
}

function packageVersion(packageRoot: string) {
  try {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
    if (packageJson.name !== PACKAGE_NAME) return null;
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}

async function syncAndValidateSkill(dependencies: UpdateDependencies, options: SyncSkillOptions) {
  const target = options.targetDir?.trim();
  if (options.targetDir !== undefined && !target) {
    throw validationError("CLI_SKILL_TARGET_NOT_FOUND", "Skill 同步目标为空。");
  }
  const result = await (dependencies.syncSkill || syncSkill)({ ...options, ...(target ? { targetDir: target } : {}) });
  const targets = Array.isArray(result.targets) ? result.targets.filter((value): value is string => typeof value === "string" && value.trim() !== "") : [];
  if (!result.synced || targets.length === 0 || typeof result.destination !== "string" || !result.destination.trim()) {
    throw validationError("CLI_SKILL_TARGET_NOT_FOUND", "Skill 同步目标为空或未完成同步。");
  }
  return { status: "ok", path: result.destination, targets, result };
}

export async function updateCli(options: UpdateOptions, dependencies = defaultDependencies) {
  const registry = normalizeRegistry(options.registry || await dependencies.getRegistry?.() || OFFICIAL_REGISTRY);
  const metadataResponse = await dependencies.fetch(`${registry}${PACKAGE_NAME}/latest`, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(UPDATE_METADATA_TIMEOUT_MS),
  });
  if (!metadataResponse.ok) throw new Error(`获取 npm 最新版本失败：HTTP ${metadataResponse.status}`);
  const metadata = validatePackageMetadata(await metadataResponse.json());
  const install = dependencies.resolveInstallContext();
  const launcherPath = install.launcherPath || install.cliExecutable;
  const binaryPath = install.binaryExecutable || install.cliExecutable;
  const pathExists = dependencies.pathExists || existsSync;
  const updateAvailable = compareVersions(metadata.version, CLI_VERSION) > 0;
  const preview = {
    packageName: PACKAGE_NAME,
    currentVersion: CLI_VERSION,
    latestVersion: metadata.version,
    updateAvailable,
    installRoot: install.installRoot,
    registry,
  };

  if (options.check || !options.confirmed || !updateAvailable) {
    if (!options.check && options.confirmed && !updateAvailable) {
      if (!options.skill) throw validationError("CLI_SKILL_TARGET_NOT_FOUND", "更新验证缺少 Skill 同步目标。");
      if ((dependencies.readPackageVersion || packageVersion)(install.packageRoot) !== CLI_VERSION) {
        throw validationError("CLI_VERSION_MISMATCH", "当前 npm 包版本与 CLI 版本不一致。");
      }
      if (!pathExists(launcherPath)) throw validationError("CLI_LAUNCHER_NOT_FOUND", "npm 安装后未找到 mdd launcher。");
      if (!pathExists(binaryPath)) throw validationError("CLI_BINARY_NOT_EXECUTABLE", "当前原生 CLI 文件不存在。");
      validateVersionResult(
        await dependencies.runProcess(launcherPath, ["version", "--json"]),
        CLI_VERSION,
        "CLI_BINARY_NOT_EXECUTABLE",
        "mdd launcher",
      );
      validateVersionResult(
        await dependencies.runProcess(binaryPath, ["version", "--json"]),
        CLI_VERSION,
        "CLI_BINARY_NOT_EXECUTABLE",
        "原生 CLI",
      );
      const skill = await syncAndValidateSkill(dependencies, options.skill);
      return {
        ...preview,
        updated: false,
        confirmationRequired: false,
        launcher: { status: "ok", path: launcherPath },
        binary: { status: "ok", path: binaryPath },
        skill: { status: skill.status, path: skill.path },
      };
    }
    return { ...preview, updated: false, confirmationRequired: updateAvailable && !options.confirmed };
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "mdd-update-"));
  try {
    const packResult = await requireSuccess(dependencies, install.npmExecutable, [
      "pack", install.packageRoot, "--pack-destination", temporaryRoot, "--ignore-scripts", "--json",
    ], "创建 CLI 回滚包");
    const packed = JSON.parse(packResult.stdout) as Array<{ filename?: string }>;
    const backupName = packed[0]?.filename;
    if (!backupName) throw new Error("创建 CLI 回滚包失败：npm 未返回文件名");
    const backupPath = join(temporaryRoot, backupName);

    try {
      await requireSuccess(dependencies, install.npmExecutable, [
        "install", "--global", "--prefix", install.installRoot, `${PACKAGE_NAME}@${metadata.version}`, "--no-audit", "--no-fund",
        "--registry", registry,
      ], "安装 CLI");
      const installedVersion = (dependencies.readPackageVersion || packageVersion)(install.packageRoot);
      if (installedVersion !== metadata.version) {
        throw validationError("CLI_VERSION_MISMATCH", "安装后的 npm 包版本与目标版本不一致。");
      }
      if (!pathExists(launcherPath)) throw validationError("CLI_LAUNCHER_NOT_FOUND", "npm 安装后未找到 mdd launcher。");
      const versionResult = await dependencies.runProcess(launcherPath, ["version", "--json"]);
      validateVersionResult(versionResult, metadata.version, "CLI_BINARY_NOT_EXECUTABLE", "mdd launcher");
      if (!pathExists(binaryPath)) throw validationError("CLI_BINARY_NOT_EXECUTABLE", "更新后的原生 CLI 文件不存在。");
      const binaryVersionResult = await dependencies.runProcess(binaryPath, ["version", "--json"]);
      validateVersionResult(binaryVersionResult, metadata.version, "CLI_BINARY_NOT_EXECUTABLE", "原生 CLI");
      await requireSuccess(dependencies, install.cliExecutable, ["draft", "import", "--help"], "验证文档导入命令");
      await requireSuccess(dependencies, install.cliExecutable, ["publish", "confirm", "--help"], "验证投放确认命令");
      await requireSuccess(dependencies, install.cliExecutable, ["schedule", "--help"], "验证定时投放命令");
      if (!options.skill) throw validationError("CLI_SKILL_TARGET_NOT_FOUND", "更新验证缺少 Skill 同步目标。");
      const skill = await syncAndValidateSkill(dependencies, options.skill);
      const validation = {
        launcher: { status: "ok", path: launcherPath },
        binary: { status: "ok", path: binaryPath },
        skill: { status: skill.status, path: skill.path },
      };
      return {
        ...preview,
        currentVersion: metadata.version,
        updated: true,
        confirmationRequired: false,
        ...validation,
        skillResult: skill.result,
        restartAgent: Boolean(skill.result.changed),
      };
    } catch (error) {
      const rollback = await dependencies.runProcess(install.npmExecutable, [
        "install", "--global", "--prefix", install.installRoot, backupPath, "--no-audit", "--no-fund",
        "--registry", registry,
      ]);
      const reason = error instanceof Error ? error.message : String(error);
      if (rollback.code !== 0) {
        const rollbackError = new Error(`${reason}；自动回滚失败。`) as Error & { errorCode?: string };
        rollbackError.errorCode = error && typeof error === "object" && "errorCode" in error
          ? String((error as { errorCode?: unknown }).errorCode || "CLI_UPDATE_FAILED")
          : "CLI_UPDATE_FAILED";
        throw rollbackError;
      }
      const validationFailure = new Error(`${reason}；已自动恢复 CLI ${CLI_VERSION}`) as Error & { errorCode?: string };
      validationFailure.errorCode = error && typeof error === "object" && "errorCode" in error
        ? String((error as { errorCode?: unknown }).errorCode || "CLI_UPDATE_FAILED")
        : "CLI_UPDATE_FAILED";
      throw validationFailure;
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  return {
    ...preview,
    currentVersion: metadata.version,
    updated: true,
    confirmationRequired: false,
    launcher: { status: "unknown", path: launcherPath },
    binary: { status: "unknown", path: binaryPath },
    skill: { status: "unknown", path: null },
    restartAgent: false,
  };
}
