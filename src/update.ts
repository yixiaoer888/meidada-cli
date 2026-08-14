import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { CLI_VERSION } from "./version";

const PACKAGE_NAME = "@meidada-cn/cli";
const PACKAGE_PATH_SEGMENTS = PACKAGE_NAME.split("/");
const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type InstallContext = {
  installRoot: string;
  packageRoot: string;
  npmExecutable: string;
  cliExecutable: string;
};

export type ProcessResult = { code: number; stdout: string; stderr: string };
export type UpdateFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type UpdateDependencies = {
  fetch: UpdateFetch;
  runProcess: (executable: string, args: string[]) => Promise<ProcessResult>;
  resolveInstallContext: () => InstallContext;
};

export type UpdateOptions = {
  confirmed: boolean;
};

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
};

async function requireSuccess(
  dependencies: UpdateDependencies,
  executable: string,
  args: string[],
  label: string,
) {
  const result = await dependencies.runProcess(executable, args);
  if (result.code !== 0) {
    const details = result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`;
    throw new Error(`${label}失败：${details}`);
  }
  return result;
}

export async function updateCli(options: UpdateOptions, dependencies = defaultDependencies) {
  const metadataResponse = await dependencies.fetch(REGISTRY_LATEST_URL, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
  });
  if (!metadataResponse.ok) throw new Error(`获取 npm 最新版本失败：HTTP ${metadataResponse.status}`);
  const metadata = validatePackageMetadata(await metadataResponse.json());
  const install = dependencies.resolveInstallContext();
  const updateAvailable = compareVersions(metadata.version, CLI_VERSION) > 0;
  const preview = {
    packageName: PACKAGE_NAME,
    currentVersion: CLI_VERSION,
    latestVersion: metadata.version,
    updateAvailable,
    installRoot: install.installRoot,
  };

  if (!options.confirmed || !updateAvailable) {
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
      ], "安装 CLI");
      await requireSuccess(dependencies, install.cliExecutable, ["skill", "sync", "--global", "--json"], "同步 Agent Skill");
      const versionResult = await requireSuccess(dependencies, install.cliExecutable, ["version", "--json"], "验证 CLI 版本");
      await requireSuccess(dependencies, install.cliExecutable, ["draft", "import", "--help"], "验证文档导入命令");
      await requireSuccess(dependencies, install.cliExecutable, ["publish", "confirm", "--help"], "验证投放确认命令");
      await requireSuccess(dependencies, install.cliExecutable, ["schedule", "--help"], "验证定时投放命令");
      const versionPayload = JSON.parse(versionResult.stdout) as { version?: string };
      if (versionPayload.version !== metadata.version) {
        throw new Error(`CLI 更新后版本不一致：期望 ${metadata.version}，实际 ${versionPayload.version || "未知"}`);
      }
    } catch (error) {
      const rollback = await dependencies.runProcess(install.npmExecutable, [
        "install", "--global", "--prefix", install.installRoot, backupPath, "--no-audit", "--no-fund",
      ]);
      const reason = error instanceof Error ? error.message : String(error);
      if (rollback.code !== 0) {
        const details = rollback.stderr.trim() || rollback.stdout.trim() || `退出码 ${rollback.code}`;
        throw new Error(`${reason}；自动回滚失败：${details}`);
      }
      throw new Error(`${reason}；已自动恢复 CLI ${CLI_VERSION}`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  return {
    ...preview,
    currentVersion: metadata.version,
    updated: true,
    confirmationRequired: false,
    skillSynced: true,
    restartAgent: true,
  };
}
