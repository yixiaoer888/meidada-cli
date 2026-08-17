import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { customerProfileBody } from "../contracts/customers";
import { createCommandContext } from "../runtime";
import { importDocument } from "../document-import";

const CHANNELS = new Set(["news", "we-media", "overseas", "short-video"]);

function context(command: Command) {
  return createCommandContext(Boolean(command.optsWithGlobals().json));
}

function strict(command: Command) {
  return command.allowExcessArguments(false);
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function channel(value: string): string {
  if (!CHANNELS.has(value)) throw new Error("channel 必须是 news、we-media、overseas 或 short-video");
  return value;
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function maskContactPhones<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskContactPhones) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "contactPhone" && typeof item === "string" && item.length >= 7) {
      return [key, `${item.slice(0, 3)}****${item.slice(-4)}`];
    }
    return [key, maskContactPhones(item)];
  })) as T;
}

function registerDraft(program: Command) {
  const draft = program.command("draft").description("管理草稿");
  strict(draft.command("list")).description("列出草稿").action(async (_options, command: Command) => {
    const ctx = context(command);
    ctx.success("draft.list", await (await ctx.getClient()).get("/drafts"));
  });
  strict(draft.command("get <draftId>")).description("查看草稿").action(async (draftId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("draft.get", await (await ctx.getClient()).get(`/drafts/${encodeURIComponent(draftId)}`));
  });
  strict(draft.command("create")).description("创建草稿")
    .requiredOption("--content-file <file>", "正文文件")
    .option("--title <title>", "标题", "")
    .action(async (options: { contentFile: string; title: string }, command: Command) => {
      const ctx = context(command);
      const result = await (await ctx.getClient()).post("/drafts", {
        title: options.title,
        content: await readFile(options.contentFile, "utf8"),
      });
      ctx.success("draft.create", result);
    });
  strict(draft.command("import <file>")).description("导入文档、保存草稿并生成预览链接")
    .option("--title <title>", "覆盖文档标题")
    .action(async (file: string, options: { title?: string }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const imported = await importDocument(client, file, options.title);
      const saved = await client.post<{ id: string; title: string; content: string; createdAt: string; updatedAt: string }>("/drafts", {
        title: imported.title,
        content: imported.content,
      });
      const preview = await client.post<{ url: string; expiresAt: string }>(`/drafts/${encodeURIComponent(saved.id)}/preview-share`);
      ctx.success("draft.import", {
        draft: saved,
        preview,
        import: {
          format: imported.format,
          imageCount: imported.imageCount,
          warnings: imported.warnings,
        },
        nextStep: "向用户展示 preview.url；用户确认继续投放后再查询并选择媒体",
      });
    });
  strict(draft.command("update <draftId>")).description("更新草稿")
    .option("--title <title>", "标题")
    .option("--content-file <file>", "正文文件")
    .option("--yes", "确认更新文章")
    .action(async (draftId: string, options: { title?: string; contentFile?: string; yes?: boolean }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const current = await client.get<{ title: string; content: string; updatedAt: string }>(`/drafts/${encodeURIComponent(draftId)}`);
      const next = {
        title: options.title ?? current.title,
        content: options.contentFile ? await readFile(options.contentFile, "utf8") : current.content,
        expectedUpdatedAt: current.updatedAt,
      };
      if (!options.yes) {
        ctx.success("draft.update.preview", {
          draftId,
          current: { title: current.title, content: current.content, updatedAt: current.updatedAt },
          proposed: { title: next.title, content: next.content },
          changed: { title: next.title !== current.title, content: next.content !== current.content },
          confirmed: false,
          nextCommand: `mdd draft update ${draftId} --yes`,
        });
        return;
      }
      ctx.success("draft.update", await client.put(`/drafts/${encodeURIComponent(draftId)}`, next));
    });
  strict(draft.command("preview <draftId>")).description("生成草稿预览链接").action(async (draftId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("draft.preview", await (await ctx.getClient()).post(`/drafts/${encodeURIComponent(draftId)}/preview-share`));
  });
  strict(draft.command("delete <draftId>")).description("删除草稿").option("--yes", "确认删除").action(async (draftId: string, options: { yes?: boolean }, command: Command) => {
    if (!options.yes) throw new Error("删除草稿必须明确传入 --yes");
    const ctx = context(command);
    ctx.success("draft.delete", await (await ctx.getClient()).delete(`/drafts/${encodeURIComponent(draftId)}`));
  });
}

function registerFavorite(program: Command) {
  const favorite = program.command("favorite").description("管理媒体收藏");
  const folder = favorite.command("folder").description("管理收藏夹");
  strict(folder.command("list")).description("列出收藏夹").action(async (_options, command: Command) => {
    const ctx = context(command);
    ctx.success("favorite.folder.list", await (await ctx.getClient()).get("/favorites/folders"));
  });
  strict(folder.command("create <name>")).description("创建收藏夹").action(async (name: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("favorite.folder.create", await (await ctx.getClient()).post("/favorites/folders", { name }));
  });
  strict(folder.command("rename <folderId>")).description("重命名收藏夹").requiredOption("--name <name>", "新名称").action(async (folderId: string, options: { name: string }, command: Command) => {
    const ctx = context(command);
    ctx.success("favorite.folder.rename", await (await ctx.getClient()).patch(`/favorites/folders/${encodeURIComponent(folderId)}`, { name: options.name }));
  });
  strict(folder.command("delete <folderId>")).description("删除收藏夹").option("--yes", "确认删除").action(async (folderId: string, options: { yes?: boolean }, command: Command) => {
    if (!options.yes) throw new Error("删除收藏夹必须明确传入 --yes");
    const ctx = context(command);
    ctx.success("favorite.folder.delete", await (await ctx.getClient()).delete(`/favorites/folders/${encodeURIComponent(folderId)}`));
  });
  strict(favorite.command("list")).description("列出收藏媒体").option("--channel <channel>", "渠道", "news").action(async (options: { channel: string }, command: Command) => {
    const ctx = context(command);
    const selected = channel(options.channel);
    ctx.success("favorite.list", await (await ctx.getClient()).get(`/favorites?channel=${encodeURIComponent(selected)}`));
  });
  for (const action of ["add", "remove"] as const) {
    strict(favorite.command(`${action} <mediaId>`)).description(action === "add" ? "添加媒体收藏" : "移除媒体收藏")
      .option("--channel <channel>", "渠道", "news")
      .option("--folder <folderId>", "收藏夹")
      .action(async (mediaIdValue: string, options: { channel: string; folder?: string }, command: Command) => {
        const mediaId = Number(mediaIdValue);
        if (!Number.isInteger(mediaId)) throw new Error("媒体 ID 必须是整数");
        const selected = channel(options.channel);
        const ctx = context(command);
        const client = await ctx.getClient();
        const [foldersData, favoritesData, media] = await Promise.all([
          client.get<{ list: Array<{ id: string; isDefault: boolean }> }>("/favorites/folders"),
          client.get<{ list: Array<{ folderId: string; mediaId: number }> }>(`/favorites?channel=${encodeURIComponent(selected)}`),
          client.get<Record<string, unknown>>(`/media/${selected}/${mediaId}`),
        ]);
        const currentIds = favoritesData.list.filter((item) => item.mediaId === mediaId).map((item) => item.folderId);
        const targetFolder = options.folder || foldersData.list.find((item) => item.isDefault)?.id;
        if (action === "add" && !targetFolder) throw new Error("没有可用收藏夹");
        const folderIds = action === "add" ? [...new Set([...currentIds, targetFolder!])] : options.folder ? currentIds.filter((id) => id !== options.folder) : [];
        ctx.success(`favorite.${action}`, await client.put("/favorites/media/folders", { channel: selected, mediaId, mediaName: media.name, folderIds }));
      });
  }
}

function registerCustomer(program: Command) {
  const customer = program.command("customer").description("管理客户资料");
  strict(customer.command("list")).description("列出客户").option("--show-sensitive", "显示完整联系方式").action(async (options: { showSensitive?: boolean }, command: Command) => {
    const ctx = context(command);
    const value = await (await ctx.getClient()).get("/customers");
    ctx.success("customer.list", options.showSensitive ? value : maskContactPhones(value));
  });
  strict(customer.command("get <customerId>")).description("查看客户").option("--show-sensitive", "显示完整联系方式").action(async (customerId: string, options: { showSensitive?: boolean }, command: Command) => {
    const ctx = context(command);
    const value = await (await ctx.getClient()).get(`/customers/${encodeURIComponent(customerId)}`);
    ctx.success("customer.get", options.showSensitive ? value : maskContactPhones(value));
  });
  for (const action of ["create", "update"] as const) {
    const command = action === "create" ? customer.command(action) : customer.command(`${action} <customerId>`);
    strict(command).description(action === "create" ? "创建客户" : "更新客户").requiredOption("--file <file>", "客户 JSON 文件").option("--show-sensitive", "显示完整联系方式")
      .action(async (...args: unknown[]) => {
        const options = args[action === "create" ? 0 : 1] as { file: string; showSensitive?: boolean };
        const commandInstance = args[action === "create" ? 1 : 2] as Command;
        const customerId = action === "update" ? String(args[0]) : undefined;
        const ctx = context(commandInstance);
        const payload = customerProfileBody.parse(JSON.parse(await readFile(options.file, "utf8")));
        const path = customerId ? `/customers/${encodeURIComponent(customerId)}` : "/customers";
        const value = action === "create" ? await (await ctx.getClient()).post(path, payload) : await (await ctx.getClient()).put(path, payload);
        ctx.success(`customer.${action}`, options.showSensitive ? value : maskContactPhones(value));
      });
  }
  strict(customer.command("delete <customerId>")).description("删除客户").option("--yes", "确认删除").action(async (customerId: string, options: { yes?: boolean }, command: Command) => {
    if (!options.yes) throw new Error("删除客户资料必须明确传入 --yes");
    const ctx = context(command);
    ctx.success("customer.delete", await (await ctx.getClient()).delete(`/customers/${encodeURIComponent(customerId)}`));
  });
}

function registerMedia(program: Command) {
  const media = program.command("media").description("查询媒体");
  strict(media.command("search")).description("搜索媒体")
    .option("--channel <channel>", "渠道", "news")
    .option("--keyword <keyword>", "关键词")
    .option("--page <page>", "页码")
    .option("--limit <limit>", "数量")
    .option("--price-min <price>", "最低价格")
    .option("--price-max <price>", "最高价格")
    .action(async (options: { channel: string; keyword?: string; page?: string; limit?: string; priceMin?: string; priceMax?: string }, command: Command) => {
      const ctx = context(command);
      const selected = channel(options.channel);
      ctx.success("media.search", await (await ctx.getClient()).get(`/media/${selected}${queryString({ keyword: options.keyword, page: options.page, limit: options.limit, priceMin: options.priceMin, priceMax: options.priceMax })}`));
    });
  strict(media.command("get <mediaId>")).description("查看媒体详情").option("--channel <channel>", "渠道", "news").action(async (mediaId: string, options: { channel: string }, command: Command) => {
    const ctx = context(command);
    const selected = channel(options.channel);
    ctx.success("media.get", await (await ctx.getClient()).get(`/media/${selected}/${encodeURIComponent(mediaId)}`));
  });
}

export function registerLowRiskCommands(program: Command) {
  registerDraft(program);
  registerFavorite(program);
  registerCustomer(program);
  registerMedia(program);
}
