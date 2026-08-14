import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { batchOrderBody } from "../src/contracts/orders";
import { customerProfileBody } from "../src/contracts/customers";
import { publishSchedulePayloadSchema } from "../src/contracts/publish-schedules";

const projectRoot = resolve(import.meta.dir, "..");
const outputDirectory = join(projectRoot, "schemas");

const schemas = [
  {
    file: "customer.schema.json",
    id: "https://npmjs.com/package/@meidada-cn/cli/schemas/customer.schema.json",
    title: "CustomerProfileBody",
    schema: customerProfileBody,
  },
  {
    file: "publish.schema.json",
    id: "https://npmjs.com/package/@meidada-cn/cli/schemas/publish.schema.json",
    title: "BatchOrderBody",
    schema: batchOrderBody,
  },
  {
    file: "schedule.schema.json",
    id: "https://npmjs.com/package/@meidada-cn/cli/schemas/schedule.schema.json",
    title: "PublishSchedulePayload",
    schema: publishSchedulePayloadSchema,
  },
] as const;

await mkdir(outputDirectory, { recursive: true });

for (const item of schemas) {
  const schema = z.toJSONSchema(item.schema, {
    io: "input",
    reused: "ref",
  }) as Record<string, unknown>;
  schema.$id = item.id;
  schema.title = item.title;
  await writeFile(join(outputDirectory, item.file), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}
