import { z } from "zod";

// 草稿写入体:标题选填(允许空标题草稿),正文为富文本 HTML;
// "去 HTML 后非空" 由服务端再判一道(前端也拦),这里只保证不是空串。
export const upsertDraftBody = z.object({
  title: z.string().max(255).default("").describe("稿件标题(选填,可空)"),
  content: z.string().min(1).describe("稿件正文(富文本 HTML)"),
  expectedUpdatedAt: z.string().datetime().optional().describe("更新时的版本时间，用于防止覆盖并发修改"),
});
export type UpsertDraftBody = z.infer<typeof upsertDraftBody>;

export const draftSchema = z.object({
  id: z.string().describe("草稿 ID"),
  title: z.string().describe("稿件标题(可能为空串)"),
  content: z.string().describe("稿件正文(富文本 HTML)"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});
export type Draft = z.infer<typeof draftSchema>;
