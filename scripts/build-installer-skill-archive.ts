import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";

const projectRoot = resolve(import.meta.dir, "..");
const archive = new JSZip();
const fixedDate = new Date(0);

for (const name of ["plugin.json", "README.md", "SKILL.md"]) {
  archive.file(name, await readFile(join(projectRoot, "skills", "meidada-cli-installer", name)), { date: fixedDate });
}

await writeFile(
  join(projectRoot, "skills", "meidada-cli-installer.zip"),
  await archive.generateAsync({ type: "nodebuffer", platform: "DOS", compression: "DEFLATE", compressionOptions: { level: 9 } }),
);
