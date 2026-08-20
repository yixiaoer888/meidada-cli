import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";

const projectRoot = resolve(import.meta.dir, "..");
const assetsDirectory = join(projectRoot, "out", "assets");
const outputDirectory = join(projectRoot, "out", "platform-packages");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  version: string;
  license: string;
};

const targets = [
  { npmPlatform: "win32", npmArch: "x64", releasePlatform: "windows", releaseArch: "amd64", binary: "mdd.exe" },
  { npmPlatform: "win32", npmArch: "arm64", releasePlatform: "windows", releaseArch: "arm64", binary: "mdd.exe" },
  { npmPlatform: "linux", npmArch: "x64", releasePlatform: "linux", releaseArch: "amd64", binary: "mdd" },
  { npmPlatform: "linux", npmArch: "arm64", releasePlatform: "linux", releaseArch: "arm64", binary: "mdd" },
  { npmPlatform: "darwin", npmArch: "x64", releasePlatform: "darwin", releaseArch: "amd64", binary: "mdd" },
  { npmPlatform: "darwin", npmArch: "arm64", releasePlatform: "darwin", releaseArch: "arm64", binary: "mdd" },
] as const;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const target of targets) {
  const packageName = `@meidada-cn/cli-${target.npmPlatform}-${target.npmArch}`;
  const directory = join(outputDirectory, `${target.npmPlatform}-${target.npmArch}`);
  const archiveBase = `mdd-cli-${packageJson.version}-${target.releasePlatform}-${target.releaseArch}`;
  const archive = join(assetsDirectory, `${archiveBase}${target.npmPlatform === "win32" ? ".zip" : ".tar.gz"}`);
  const binaryName = `mdd-${packageJson.version}-${target.releasePlatform}-${target.releaseArch}${target.npmPlatform === "win32" ? ".exe" : ""}`;
  const destination = join(directory, "bin", target.binary);

  await stat(archive).catch(() => {
    throw new Error(`Missing native archive for ${packageName}: ${archive}`);
  });
  await mkdir(dirname(destination), { recursive: true });
  if (target.npmPlatform === "win32") {
    const zip = await JSZip.loadAsync(await readFile(archive));
    const entry = zip.file(binaryName);
    if (!entry) throw new Error(`Archive missing ${binaryName}: ${archive}`);
    await writeFile(destination, await entry.async("nodebuffer"));
  } else {
    const child = Bun.spawn(["tar", "-xOzf", archive, binaryName], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(child.stdout).arrayBuffer();
    if (await child.exited !== 0) throw new Error(`Archive missing ${binaryName}: ${archive}`);
    await writeFile(destination, new Uint8Array(output));
  }
  if (target.npmPlatform !== "win32") await chmod(destination, 0o755);

  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    name: packageName,
    version: packageJson.version,
    description: `媒大大 CLI ${target.npmPlatform}-${target.npmArch} 原生二进制`,
    license: packageJson.license,
    os: [target.npmPlatform],
    cpu: [target.npmArch],
    files: [`bin/${target.binary}`],
    publishConfig: { access: "public" },
  }, null, 2)}\n`, "utf8");
}

process.stdout.write(`Built ${targets.length} platform package directories: ${outputDirectory}\n`);
