import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const packageRoot = join(projectRoot, "out", "package");
const assetChecksumsPath = join(projectRoot, "out", "assets", "checksums.txt");
const packageJsonPath = join(projectRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  files?: string[];
};
const assetChecksums = await readFile(assetChecksumsPath, "utf8").catch(() => {
  throw new Error("Missing out/assets/checksums.txt. Run `bun run build:native-assets` before `bun run package:dir`.");
});

async function run(executable: string, args: string[]) {
  const child = Bun.spawn([executable, ...args], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${executable} ${args.join(" ")} failed with exit code ${exitCode}`);
}

await run(process.execPath, ["run", "schemas"]);
await run(process.execPath, ["run", "check:package-docs"]);

await rm(packageRoot, { recursive: true, force: true });
await mkdir(packageRoot, { recursive: true });

const entries = [...new Set([...(packageJson.files ?? []), "package.json"])]
  .filter((entry) => entry !== "checksums.txt")
  .sort();

for (const entry of entries) {
  await cp(join(projectRoot, entry), join(packageRoot, entry), {
    recursive: true,
    force: true,
  });
}

const packageJsonForPublish = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Record<
  string,
  unknown
>;
packageJsonForPublish.scripts = {
  postinstall: "node bin/postinstall.cjs",
};
packageJsonForPublish.files = [
  ...new Set([...(Array.isArray(packageJsonForPublish.files) ? packageJsonForPublish.files : []), "checksums.txt"]),
];
delete packageJsonForPublish.dependencies;
delete packageJsonForPublish.devDependencies;
await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(packageJsonForPublish, null, 2)}\n`, "utf8");
await writeFile(join(packageRoot, "checksums.txt"), assetChecksums);

process.stdout.write(`Built package directory: ${packageRoot}\n`);
