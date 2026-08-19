import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";

const projectRoot = resolve(import.meta.dir, "..");
const assetsDirectory = join(projectRoot, "out", "assets");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  version: string;
};

const targets = [
  { bunTarget: "bun-windows-x64", platform: "windows", arch: "amd64", binaryName: "mdd.exe", archiveExt: "zip" },
  { bunTarget: "bun-darwin-x64", platform: "darwin", arch: "amd64", binaryName: "mdd", archiveExt: "tar.gz" },
  { bunTarget: "bun-darwin-arm64", platform: "darwin", arch: "arm64", binaryName: "mdd", archiveExt: "tar.gz" },
  { bunTarget: "bun-linux-x64", platform: "linux", arch: "amd64", binaryName: "mdd", archiveExt: "tar.gz" },
  { bunTarget: "bun-linux-arm64", platform: "linux", arch: "arm64", binaryName: "mdd", archiveExt: "tar.gz" },
] as const;

const selectedTargets = new Set(
  (process.env.MDD_NATIVE_TARGETS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const buildTargets = selectedTargets.size
  ? targets.filter((target) => selectedTargets.has(`${target.platform}-${target.arch}`))
  : targets;

async function run(executable: string, args: string[], cwd = projectRoot) {
  const child = Bun.spawn([executable, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${executable} ${args.join(" ")} failed with exit code ${exitCode}`);
}

async function writeZip(sourceFile: string, archivePath: string, binaryName: string) {
  const zip = new JSZip();
  zip.file(binaryName, await readFile(sourceFile), {
    unixPermissions: binaryName.endsWith(".exe") ? undefined : 0o755,
  });
  const content = await zip.generateAsync({
    type: "nodebuffer",
    platform: "UNIX",
    compression: "DEFLATE",
  });
  await writeFile(archivePath, content);
}

async function writeTarGz(sourceDirectory: string, archivePath: string, binaryName: string) {
  await run("tar", ["-czf", archivePath, "-C", sourceDirectory, binaryName]);
}

await rm(assetsDirectory, { recursive: true, force: true });
await mkdir(assetsDirectory, { recursive: true });

const checksumLines: string[] = [];

for (const target of buildTargets) {
  const baseName = `mdd-cli-${packageJson.version}-${target.platform}-${target.arch}`;
  const binaryExt = target.platform === "windows" ? ".exe" : "";
  const binaryName = `mdd-${packageJson.version}-${target.platform}-${target.arch}${binaryExt}`;
  const stagingDirectory = join(assetsDirectory, ".staging", baseName);
  const binaryPath = join(stagingDirectory, binaryName);
  const archiveName = `${baseName}.${target.archiveExt}`;
  const archivePath = join(assetsDirectory, archiveName);

  await mkdir(stagingDirectory, { recursive: true });
  const build = await Bun.build({
    entrypoints: [join(projectRoot, "src", "index.ts")],
    compile: {
      target: target.bunTarget,
      outfile: binaryPath,
    },
  });
  if (!build.success) {
    throw new Error(`bun build ${target.bunTarget} failed`);
  }

  if (!binaryName.endsWith(".exe")) {
    await chmod(binaryPath, 0o755);
  }

  if (target.archiveExt === "zip") {
    await writeZip(binaryPath, archivePath, binaryName);
  } else {
    await writeTarGz(stagingDirectory, archivePath, binaryName);
  }

  const archive = await readFile(archivePath);
  const hash = createHash("sha256").update(archive).digest("hex");
  checksumLines.push(`${hash}  ${archiveName}`);
}

const checksums = `${checksumLines.sort().join("\n")}\n`;
await writeFile(join(assetsDirectory, "checksums.txt"), checksums, "utf8");
await writeFile(join(projectRoot, "checksums.txt"), checksums, "utf8");
await rm(join(assetsDirectory, ".staging"), { recursive: true, force: true });

process.stdout.write(`Built ${buildTargets.length} native asset(s): ${assetsDirectory}\n`);
