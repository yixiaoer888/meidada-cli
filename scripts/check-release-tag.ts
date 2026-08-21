import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function validateReleaseTag(packageVersion: string, actualTag?: string) {
  const expectedTag = `v${packageVersion}`;
  if (actualTag && actualTag !== expectedTag) {
    throw new Error(`Git tag 与 package.json 版本不一致：期望 ${expectedTag}，实际 ${actualTag}`);
  }
  return `Release tag check passed: ${actualTag || expectedTag}`;
}

const projectRoot = resolve(import.meta.dir, "..");
if (import.meta.main) {
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const rawRef = process.env.GITHUB_REF?.trim() ?? "";
  const actualTag = rawRef.startsWith("refs/tags/")
    ? rawRef.slice("refs/tags/".length)
    : process.env.GITHUB_REF_NAME?.trim();
  process.stdout.write(`${validateReleaseTag(packageJson.version, actualTag)}\n`);
}
