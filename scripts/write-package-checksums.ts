import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const candidates = ["bin", "references", "schemas", "skills", "README.md", "package.json"];

async function collectFiles(path: string): Promise<string[]> {
  const absolutePath = join(projectRoot, path);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];

  const files = await Promise.all(
    entries.map((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? collectFiles(child) : [child];
    }),
  );
  return files.flat();
}

const files = (await Promise.all(candidates.map(collectFiles))).flat().sort();
const lines = [];

for (const file of files) {
  if (file.replaceAll("\\", "/") === "checksums.txt") continue;
  const content = await readFile(join(projectRoot, file));
  const hash = createHash("sha256").update(content).digest("hex");
  lines.push(`${hash}  ${relative(projectRoot, join(projectRoot, file)).replaceAll("\\", "/")}`);
}

await writeFile(join(projectRoot, "checksums.txt"), `${lines.join("\n")}\n`, "utf8");
