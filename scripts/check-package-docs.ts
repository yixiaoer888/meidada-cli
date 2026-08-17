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
];

const forbidden = [
  { pattern: /不得为了预览、校验或准备投放而先执行 `mdd draft import`/, message: "本地上传投放已改为临时来源草稿语义，请更新旧文档" },
  { pattern: /投放到媒体时不要为了预览或准备投放而创建草稿/, message: "本地上传投放已改为临时来源草稿语义，请更新旧文档" },
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
