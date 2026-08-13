import { Command } from "commander";
import type { PublishApproval } from "../contracts/publish-approvals";
import { createCommandContext } from "../runtime";
import { preparePublish } from "../prepare";
import { readPublishRequest, validatePublish } from "../publish";
import { parseScheduleOptions, readScheduleFile, writeScheduleFile, type SchedulePrepareOptions } from "../schedule";

const STATUS_DONE = new Set([-3, -2, -1, 2]);
const CHANNEL_MAP = {
  news: "NEWS",
  "we-media": "WE_MEDIA",
  overseas: "OVERSEAS",
} as const;

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

function seconds(value: string | undefined, fallback: number, label: string) {
  const result = Number(value || fallback);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} 必须是大于 0 的数字`);
  return result;
}

function registerPublish(program: Command) {
  const publish = program.command("publish").description("准备和申请投放");
  const payloadCommand = (action: "validate" | "dry-run" | "request" | "quote") => {
    const commandName = action === "quote" ? "request" : action;
    const description = commandName === "request" ? "创建待确认投放报价" : commandName === "dry-run" ? "模拟投放校验" : "校验投放文件";
    strict(publish.command(`${action} <payloadFile>`)).description(description)
      .action(async (payloadFile: string, _options, command: Command) => {
        const ctx = context(command);
        const client = await ctx.getClient();
        const request = await readPublishRequest(payloadFile);
        const payload = request.payload;
        const validation = await validatePublish(client, payload);
        if (commandName === "validate" || commandName === "dry-run") {
          ctx.success(`publish.${commandName}`, { ...validation, dryRun: commandName === "dry-run" });
          return;
        }
        if (!validation.balanceSufficient) throw new Error("余额不足，不能创建投放报价");
        ctx.success("publish.request", await client.post(
          "/publish-approvals",
          { payload, ...(request.sourceDraft ? { sourceDraft: request.sourceDraft } : {}) },
          request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : undefined,
        ));
      });
  };
  payloadCommand("validate");
  payloadCommand("dry-run");
  payloadCommand("request");
  payloadCommand("quote");

  strict(publish.command("confirm <approvalId>")).description("确认或预览最终投放")
    .option("--yes", "确认按当前媒体和报价投放")
    .option("--keep-draft", "投放全部成功后仍保留来源草稿")
    .action(async (approvalId: string, options: { yes?: boolean; keepDraft?: boolean }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const path = `/publish-approvals/${encodeURIComponent(approvalId)}`;
      if (!options.yes) {
        if (options.keepDraft) throw new Error("--keep-draft 必须与 --yes 一起使用");
        const approval = await client.get<PublishApproval>(path);
        const preview = approval.sourceDraft
          ? await client.post<{ url: string; expiresAt: string }>(
              `/drafts/${encodeURIComponent(approval.sourceDraft.id)}/preview-share`,
            )
          : null;
        const previewUrl = approval.previewUrl || approval.confirmationUrl || preview?.url || null;
        ctx.success("publish.confirm.preview", {
          approvalId: approval.id,
          status: approval.status,
          title: approval.payload.title,
          channel: approval.payload.channel,
          media: approval.quote.items,
          mediaCount: approval.quote.items.length,
          total: approval.quote.total,
          walletBalance: approval.quote.walletBalance,
          balanceAfter: approval.quote.balanceAfter,
          balanceSufficient: approval.quote.balanceSufficient,
          previewUrl,
          previewExpiresAt: preview?.expiresAt ?? null,
          keepDraftDefault: false,
          draftDispositionOnFullSuccess: "DELETED",
          expiresAt: approval.expiresAt,
          confirmation: {
            articleTitle: approval.payload.title,
            media: approval.quote.items.map((item) => ({ mediaId: item.mediaId, mediaName: item.mediaName, sellingPrice: item.sellingPrice })),
            total: approval.quote.total,
            walletBalance: approval.quote.walletBalance,
            balanceAfter: approval.quote.balanceAfter,
            previewUrl,
          },
          confirmed: false,
          nextCommand: `mdd publish confirm ${approval.id} --yes`,
        });
        return;
      }
      ctx.success("publish.confirm", await client.post(`${path}/confirm`, { keepDraft: Boolean(options.keepDraft) }));
    });

  strict(publish.command("prepare")).description("准备投放文件")
    .option("--draft <draftId>", "草稿 ID")
    .option("--file <file>", "本地 DOCX、HTML 或 TXT 文章文件；投放到媒体时不会保存到草稿箱")
    .option("--title <title>", "覆盖本地文章标题")
    .option("--channel <channel>", "渠道", "news")
    .option("--media <ids>", "逗号分隔的媒体 ID")
    .option("--customer <customerId>", "客户 ID")
    .option("--remark <remark>", "备注")
    .option("--keyword <keyword>", "话题关键词")
    .option("--output <file>", "输出文件", "campaign.json")
    .action(async (options: { draft?: string; file?: string; title?: string; channel: string; media?: string; customer?: string; remark?: string; keyword?: string; output: string }, command: Command) => {
      const ctx = context(command);
      const channel = options.channel as keyof typeof CHANNEL_MAP;
      if (!(channel in CHANNEL_MAP)) throw new Error("channel 必须是 news、we-media 或 overseas");
      if (Boolean(options.draft) === Boolean(options.file)) throw new Error("请二选一使用 --file 指定本地文章，或使用 --draft 指定已有草稿");
      const mediaIds = required(options.media, "请使用 --media 指定媒体 ID").split(",").map((value) => Number(value.trim()));
      if (mediaIds.some((value) => !Number.isInteger(value))) throw new Error("--media 必须是逗号分隔的整数");
      ctx.success("publish.prepare", await preparePublish(await ctx.getClient(), {
        ...(options.file ? { file: options.file, title: options.title } : { draftId: required(options.draft, "请使用 --draft 指定草稿 ID") }),
        channel: CHANNEL_MAP[channel],
        mediaIds,
        customerId: options.customer,
        remark: options.remark,
        keyword: options.keyword,
        output: options.output,
      }));
    });

  const approval = publish.command("approval").description("查询投放审批");
  strict(approval.command("get <approvalId>")).description("查看审批").action(async (approvalId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("publish.approval.get", await (await ctx.getClient()).get(`/publish-approvals/${encodeURIComponent(approvalId)}`));
  });
  strict(approval.command("wait <approvalId>")).description("等待审批结果")
    .option("--interval <seconds>", "轮询间隔", "5")
    .option("--timeout <seconds>", "超时时间", "600")
    .action(async (approvalId: string, options: { interval: string; timeout: string }, command: Command) => {
      const ctx = context(command);
      const interval = seconds(options.interval, 5, "interval");
      const timeout = seconds(options.timeout, 600, "timeout");
      const deadline = Date.now() + timeout * 1000;
      const client = await ctx.getClient();
      while (true) {
        const approval = await client.get<{ status: string }>(`/publish-approvals/${encodeURIComponent(approvalId)}`);
        if (!["PENDING", "PROCESSING"].includes(approval.status)) {
          ctx.success("publish.approval.wait", approval);
          return;
        }
        if (Date.now() >= deadline) throw new Error(`等待用户确认超时（${timeout} 秒）`);
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
    });
  strict(publish.command("create")).description("直接投放（已禁用）").option("--yes", "确认直接投放").action(() => {
    throw new Error("CLI 已禁止直接投放或跳过报价。请先使用 publish request 获取报价，用户明确确认后再使用 publish confirm --yes");
  });
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function registerOrder(program: Command) {
  const order = program.command("order").description("查询和取消订单");
  strict(order.command("list")).description("列出订单")
    .option("--status <status>", "订单状态")
    .option("--keyword <keyword>", "关键词")
    .option("--page <page>", "页码")
    .option("--limit <limit>", "数量")
    .action(async (options: { status?: string; keyword?: string; page?: string; limit?: string }, command: Command) => {
      const ctx = context(command);
      ctx.success("order.list", await (await ctx.getClient()).get(`/orders${queryString(options)}`));
    });
  strict(order.command("get <orderNo>")).description("查看订单").action(async (orderNo: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("order.get", await (await ctx.getClient()).get(`/orders/${encodeURIComponent(orderNo)}`));
  });
  strict(order.command("wait <orderNo>")).description("等待订单完成")
    .option("--interval <seconds>", "轮询间隔", "10")
    .option("--timeout <seconds>", "超时时间", "600")
    .action(async (orderNo: string, options: { interval: string; timeout: string }, command: Command) => {
      const ctx = context(command);
      const interval = seconds(options.interval, 10, "interval");
      const timeout = seconds(options.timeout, 600, "timeout");
      const deadline = Date.now() + timeout * 1000;
      const client = await ctx.getClient();
      while (true) {
        const result = await client.post<{ status: number }>(`/orders/${encodeURIComponent(orderNo)}/sync`);
        if (STATUS_DONE.has(result.status)) {
          ctx.success("order.wait", result);
          return;
        }
        if (Date.now() >= deadline) throw new Error(`等待订单超时（${timeout} 秒）`);
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
    });
  strict(order.command("cancel <orderNo>")).description("取消订单").option("--yes", "确认取消").action(async (orderNo: string, options: { yes?: boolean }, command: Command) => {
    const ctx = context(command);
    const client = await ctx.getClient();
    const current = await client.get<{ orderNo: string; status: number; sellingPrice: string; mediaName: string }>(`/orders/${encodeURIComponent(orderNo)}`);
    if (current.status !== 0) throw new Error("只有未处理状态的订单可以取消");
    if (!options.yes) {
      ctx.success("order.cancel.preview", {
        cancellable: true,
        orderNo: current.orderNo,
        mediaName: current.mediaName,
        refundableAmount: current.sellingPrice,
        cancelled: false,
        nextCommand: `mdd order cancel ${current.orderNo} --yes`,
      });
      return;
    }
    ctx.success("order.cancel", await client.post(`/orders/${encodeURIComponent(orderNo)}/cancel`));
  });
}

function registerSchedule(program: Command) {
  const schedule = program.command("schedule").description("管理草稿定时投放计划");
  strict(schedule.command("prepare")).description("生成定时投放计划文件")
    .requiredOption("--drafts <ids>", "逗号分隔的草稿 ID")
    .requiredOption("--channel <channel>", "news、we-media 或 overseas")
    .requiredOption("--media <ids>", "逗号分隔的媒体 ID")
    .requiredOption("--start-at <iso>", "首次执行时间，ISO 8601")
    .requiredOption("--run-at <time>", "每天执行时间，HH:mm")
    .option("--timezone <iana>", "IANA 时区", "Asia/Shanghai")
    .option("--repeat <mode>", "once 或 daily", "daily")
    .requiredOption("--budget-per-run <amount>", "单次预算上限")
    .option("--budget-total <amount>", "累计预算上限")
    .option("--customer <customerId>", "客户 ID")
    .option("--remark <remark>", "备注")
    .option("--keep-draft", "投放成功后仍保留草稿")
    .option("--output <file>", "计划文件", "schedule.json")
    .action(async (options: SchedulePrepareOptions, command: Command) => {
      const ctx = context(command);
      const payload = parseScheduleOptions(options);
      const prepared = await (await ctx.getClient()).post<Record<string, unknown>>("/publish-schedules/prepare", payload);
      const file = await writeScheduleFile(options.output, payload);
      ctx.success("schedule.prepare", { ...file, server: prepared });
    });

  strict(schedule.command("request <scheduleFile>")).description("创建待确认的定时投放计划")
    .action(async (scheduleFile: string, _options, command: Command) => {
      const ctx = context(command);
      const file = await readScheduleFile(scheduleFile);
      ctx.success("schedule.request", await (await ctx.getClient()).post("/publish-schedules", { payload: file.payload }, file.idempotencyKey ? { "Idempotency-Key": file.idempotencyKey } : undefined));
    });

  strict(schedule.command("confirm <scheduleId>")).description("预览或激活定时投放计划")
    .option("--yes", "确认激活计划")
    .action(async (scheduleId: string, options: { yes?: boolean }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const path = `/publish-schedules/${encodeURIComponent(scheduleId)}`;
      if (!options.yes) {
        const value = await client.get<Record<string, unknown>>(path);
        const payload = value.payload && typeof value.payload === "object" ? value.payload as Record<string, unknown> : {};
        const draftIds = Array.isArray(payload.draftIds) ? payload.draftIds : [];
        const mediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];
        ctx.success("schedule.confirm.preview", {
          ...value,
          confirmation: {
            draftIds,
            articleCount: draftIds.length,
            channel: payload.channel ?? null,
            mediaIds,
            mediaCount: mediaIds.length,
            repeat: payload.repeat ?? null,
            startAt: payload.startAt ?? null,
            runAt: payload.runAt ?? null,
            timezone: payload.timezone ?? null,
            budgetPerRun: payload.budgetPerRun ?? null,
            budgetTotal: payload.budgetTotal ?? null,
            keepDraft: payload.keepDraft ?? false,
            estimatedRunCount: payload.repeat === "ONCE" ? 1 : null,
          },
          confirmed: false,
          nextCommand: `mdd schedule confirm ${scheduleId} --yes`,
        });
        return;
      }
      ctx.success("schedule.confirm", await client.post(`${path}/confirm`, {}));
    });

  strict(schedule.command("list")).description("列出定时计划").action(async (_options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.list", await (await ctx.getClient()).get("/publish-schedules"));
  });
  strict(schedule.command("get <scheduleId>")).description("查看定时计划").action(async (scheduleId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.get", await (await ctx.getClient()).get(`/publish-schedules/${encodeURIComponent(scheduleId)}`));
  });
  strict(schedule.command("runs <scheduleId>")).description("查看执行记录").action(async (scheduleId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.runs", await (await ctx.getClient()).get(`/publish-schedules/${encodeURIComponent(scheduleId)}/runs`));
  });

  for (const action of ["pause", "resume", "cancel"] as const) {
    const description = action === "pause" ? "暂停定时计划" : action === "resume" ? "恢复定时计划" : "取消定时计划";
    strict(schedule.command(`${action} <scheduleId>`)).description(description).option("--yes", "确认操作")
      .action(async (scheduleId: string, options: { yes?: boolean }, command: Command) => {
        const ctx = context(command);
        const client = await ctx.getClient();
        const path = `/publish-schedules/${encodeURIComponent(scheduleId)}/${action}`;
        if (!options.yes) {
          const schedule = await client.get(`/publish-schedules/${encodeURIComponent(scheduleId)}`);
          ctx.success(`schedule.${action}.preview`, { schedule, action, confirmed: false, nextCommand: `mdd schedule ${action} ${scheduleId} --yes` });
          return;
        }
        ctx.success(`schedule.${action}`, await client.post(path, {}));
      });
  }
}

export function registerHighRiskCommands(program: Command) {
  registerPublish(program);
  registerSchedule(program);
  registerOrder(program);
}
