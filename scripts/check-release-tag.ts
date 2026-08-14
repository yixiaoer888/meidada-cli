import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
  version: string;
};
const expectedTag = `v${packageJson.version}`;
const actualTag = process.env.GITHUB_REF_NAME;

if (actualTag && actualTag !== expectedTag) {
  throw new Error(`Git tag 与 package.json 版本不一致：期望 ${expectedTag}，实际 ${actualTag}`);
}

process.stdout.write(`Release tag check passed: ${actualTag || expectedTag}\n`);
