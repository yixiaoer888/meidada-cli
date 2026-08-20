import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const outputDirectory = join(projectRoot, "out", "npm");
const packageDirectory = join(projectRoot, "out", "package");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

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
await run(process.execPath, ["scripts/check-release-tag.ts"]);
await run(process.execPath, ["run", "build:native-assets"]);
await run(process.execPath, ["run", "build:platform-packages"]);
await run(process.execPath, ["run", "package:dir"]);
await run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "pack",
  packageDirectory,
  "--ignore-scripts",
  "--pack-destination",
  outputDirectory,
]);

const archiveName = `${packageJson.name.replace(/^@/, "").replace("/", "-")}-${packageJson.version}.tgz`;
const archive = await readFile(join(outputDirectory, archiveName));
const sha256 = createHash("sha256").update(archive).digest("hex");
await writeFile(join(outputDirectory, "SHA256SUMS"), `${sha256}  ${archiveName}\n`, "utf8");

for (const directory of ["win32-x64", "win32-arm64", "linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"]) {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "pack",
    join(projectRoot, "out", "platform-packages", directory),
    "--ignore-scripts",
    "--pack-destination",
    outputDirectory,
  ]);
}

process.stdout.write(`Built ${packageJson.name} ${packageJson.version} (${sha256})\n`);
