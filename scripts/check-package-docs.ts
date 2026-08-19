import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const files = [
  "README.md",
  "references/command-reference.md",
  "references/publish-schedules-api.md",
  "schemas/publish.schema.json",
  "schemas/schedule.schema.json",
  "skills/media-distribution/SKILL.md",
  "bin/mdd-core.js",
];

const forbidden = [
  {
    pattern: /为了[^\n]*预览[^\n]*校验[^\n]*准备投放[^\n]*mdd draft import/,
    message: "本地文件直投不应创建或导入草稿，请更新旧文档。",
  },
  {
    pattern: /为了[^\n]*预览[^\n]*准备投放[^\n]*创建草稿/,
    message: "本地文件直投不应创建或导入草稿，请更新旧文档。",
  },
  {
    pattern: /unset\s+HTTP_PROXY/,
    message: "不要在面向 Agent 的文档中建议使用 unset 清理代理变量，容易触发删除操作安全提示。",
  },
  {
    pattern: /Remove-Item\s+Env:[A-Za-z_]/,
    message: "不要在面向 Agent 的文档中建议使用 Remove-Item Env: 清理代理变量，容易触发删除操作安全提示。",
  },
];

const failures: string[] = [];

for (const file of files) {
  const content = await readFile(join(projectRoot, file), "utf8");
  for (const item of forbidden) {
    if (item.pattern.test(content)) failures.push(`${file}: ${item.message}`);
  }
}

if (failures.length > 0) {
  throw new Error(`发布文档检查失败：\n${failures.map((item) => `- ${item}`).join("\n")}`);
}
