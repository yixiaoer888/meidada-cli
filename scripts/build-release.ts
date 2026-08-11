import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const outputDirectory = join(projectRoot, "out", "npm");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
};
const expectedTag = `v${packageJson.version}`;
const actualTag = process.env.GITHUB_REF_NAME;

if (actualTag && actualTag !== expectedTag) {
  throw new Error(`Git Tag 与 package.json 版本不一致：期望 ${expectedTag}，实际 ${actualTag}`);
}

async function run(executable: string, args: string[]) {
  const child = Bun.spawn([executable, ...args], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${executable} ${args.join(" ")} 执行失败，退出码 ${exitCode}`);
}

await rm(join(projectRoot, "out"), { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await run(process.execPath, ["run", "build"]);
await run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "pack",
  ".",
  "--ignore-scripts",
  "--pack-destination",
  outputDirectory,
]);

const archiveName = `${packageJson.name.replace(/^@/, "").replace("/", "-")}-${packageJson.version}.tgz`;
const archive = await readFile(join(outputDirectory, archiveName));
const sha256 = createHash("sha256").update(archive).digest("hex");
await writeFile(join(outputDirectory, "SHA256SUMS"), `${sha256}  ${archiveName}\n`, "utf8");

process.stdout.write(`Built ${packageJson.name} ${packageJson.version} (${sha256})\n`);
