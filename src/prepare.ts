import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { batchOrderBody, type BatchOrderBody } from "./contracts/orders";
import type { CustomerProfile } from "./contracts/customers";
import type { Draft } from "./contracts/drafts";
import type { ApiClient } from "./api-client";
import { validatePublish } from "./publish";
import { importDocument, type ImportedDocument } from "./document-import";

type BasePrepareOptions = {
  channel: BatchOrderBody["channel"];
  mediaIds: number[];
  customerId?: string;
  remark?: string;
  keyword?: string;
  selection?: Record<string, unknown>;
  output: string;
};

type DraftPrepareOptions = BasePrepareOptions & {
  draftId: string;
  file?: never;
  title?: never;
};

type FilePrepareOptions = BasePrepareOptions & {
  file: string;
  title?: string;
  draftId?: never;
};

export async function preparePublish(
  client: ApiClient,
  options: DraftPrepareOptions | FilePrepareOptions,
) {
  const [article, customer] = await Promise.all([
    readPublishArticle(client, options),
    options.customerId
      ? client.get<CustomerProfile>(`/customers/${encodeURIComponent(options.customerId)}`)
      : Promise.resolve(undefined),
  ]);
  if (!article.title.trim()) throw new Error("文章标题为空，不能生成投放表单");

  const payload = batchOrderBody.parse({
    channel: options.channel,
    mediaIds: options.mediaIds,
    title: article.title,
    content: article.content,
    keyword: options.keyword,
    remark: options.remark || customer?.defaultRemark || undefined,
    customerName: customer?.name,
  });
  const validation = await validatePublish(client, payload);
  const campaign = {
    schemaVersion: "1",
    idempotencyKey: `mdd-${randomUUID()}`,
    ...(article.sourceDraft ? { sourceDraft: article.sourceDraft } : {}),
    ...(options.selection ? { selection: options.selection } : {}),
    ...(article.import ? { import: article.import } : {}),
    payload,
  };
  await writeFile(options.output, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
  return {
    output: options.output,
    sourceDraft: article.sourceDraft ?? null,
    import: article.import ?? null,
    payload,
    validation,
    orderCreated: false,
    draftCreated: false,
  };
}

async function readPublishArticle(client: ApiClient, options: DraftPrepareOptions | FilePrepareOptions): Promise<{
  title: string;
  content: string;
  sourceDraft?: { id: string; updatedAt: string };
  import?: Pick<ImportedDocument, "format" | "imageCount" | "warnings">;
}> {
  if (typeof options.file === "string") {
    const imported = await importDocument(client, options.file, options.title);
    return {
      title: imported.title,
      content: imported.content,
      import: {
        format: imported.format,
        imageCount: imported.imageCount,
        warnings: imported.warnings,
      },
    };
  }

  const draft = await client.get<Draft>(`/drafts/${encodeURIComponent(options.draftId)}`);
  return {
    title: draft.title,
    content: draft.content,
    sourceDraft: { id: draft.id, updatedAt: draft.updatedAt },
  };
}
