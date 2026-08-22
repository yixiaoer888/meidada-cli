import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
  optionalDependencies?: Record<string, string>;
};
const registry = process.env.MDD_NPM_REGISTRY?.trim() || "https://registry.npmjs.org/";
const expectedPackages = [packageJson.name, ...Object.keys(packageJson.optionalDependencies ?? {})];
const retryDelaysMs = [10_000, 20_000, 40_000, 60_000, 60_000];

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function npmView(args: string[]) {
  let lastError = "";
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const child = Bun.spawn([
      process.platform === "win32" ? "npm.cmd" : "npm",
      "view",
      ...args,
      "--registry",
      registry,
    ], { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode === 0) return stdout.trim();

    lastError = stderr.trim() || stdout.trim() || `退出码 ${exitCode}`;
    if (attempt < retryDelaysMs.length) {
      await sleep(retryDelaysMs[attempt] ?? 0);
    }
  }
  throw new Error(`npm view ${args.join(" ")} 失败：${lastError}`);
}

for (const packageName of expectedPackages) {
  const publishedVersion = await npmView([`${packageName}@${packageJson.version}`, "version"]);
  if (publishedVersion !== packageJson.version) {
    throw new Error(`${packageName} 未发布期望版本：期望 ${packageJson.version}，实际 ${publishedVersion || "未知"}`);
  }
}

const latestVersion = await npmView([packageJson.name, "dist-tags.latest"]);
if (latestVersion !== packageJson.version) {
  throw new Error(`${packageJson.name} 的 latest 仍是 ${latestVersion || "未知"}，期望 ${packageJson.version}`);
}

process.stdout.write(`npm 发布核验通过：${packageJson.name}@${packageJson.version} 及 ${expectedPackages.length - 1} 个平台包，latest=${latestVersion}\n`);
