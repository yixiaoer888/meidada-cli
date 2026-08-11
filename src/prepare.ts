import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { batchOrderBody, type BatchOrderBody } from "./contracts/orders";
import type { CustomerProfile } from "./contracts/customers";
import type { Draft } from "./contracts/drafts";
import type { ApiClient } from "./api-client";
import { validatePublish } from "./publish";

export async function preparePublish(
  client: ApiClient,
  options: {
    draftId: string;
    channel: BatchOrderBody["channel"];
    mediaIds: number[];
    customerId?: string;
    remark?: string;
    keyword?: string;
    selection?: Record<string, unknown>;
    output: string;
  },
) {
  const [draft, customer] = await Promise.all([
    client.get<Draft>(`/drafts/${encodeURIComponent(options.draftId)}`),
    options.customerId
      ? client.get<CustomerProfile>(`/customers/${encodeURIComponent(options.customerId)}`)
      : Promise.resolve(undefined),
  ]);
  if (!draft.title.trim()) throw new Error("草稿标题为空，不能生成投放表单");

  const payload = batchOrderBody.parse({
    channel: options.channel,
    mediaIds: options.mediaIds,
    title: draft.title,
    content: draft.content,
    keyword: options.keyword,
    remark: options.remark || customer?.defaultRemark || undefined,
    customerName: customer?.name,
  });
  const validation = await validatePublish(client, payload);
  const campaign = {
    schemaVersion: "1",
    idempotencyKey: `mdd-${randomUUID()}`,
    sourceDraft: { id: draft.id, updatedAt: draft.updatedAt },
    ...(options.selection ? { selection: options.selection } : {}),
    payload,
  };
  await writeFile(options.output, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
  return { output: options.output, sourceDraft: campaign.sourceDraft, payload, validation, orderCreated: false };
}
