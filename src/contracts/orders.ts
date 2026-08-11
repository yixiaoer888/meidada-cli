import { z } from "zod";

export const mediaChannelSchema = z.enum(["NEWS", "WE_MEDIA", "OVERSEAS", "SHORT_VIDEO"]);
export type MediaChannel = z.infer<typeof mediaChannelSchema>;

// 下单请求体
const baseOrderBody = {
  mediaId: z.number().int().describe("目标媒体 ID(取媒体列表的 upstreamId)"),
  title: z.string().min(1).describe("稿件标题"),
  content: z.string().min(1).describe("稿件正文(富文本 HTML)"),
  remark: z.string().optional().describe("发稿要求/备注(如带标、指定位置等,选填)"),
  customerName: z.string().max(200).optional().describe("所属客户名称(用于标记订单归属,选填)"),
};

// 自媒体渠道特有的投放参数(仅 WE_MEDIA 生效)
const weMediaOrderParams = {
  accountRule: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe("账号规则:1/2/3(具体含义见上游媒介盒子说明,默认 1)"),
  articleType: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe("文章类型:1/2/3(具体含义见上游媒介盒子说明,默认 1)"),
  allowVideo: z.union([z.literal(0), z.literal(1), z.literal(3)]).optional().describe("视频:0 不含视频 / 1 允许视频 / 3 仅视频(默认 0)"),
};

export const createNewsOrderBody = z.object(baseOrderBody);
export const createWeMediaOrderBody = z.object({
  ...baseOrderBody,
  ...weMediaOrderParams,
});
export const createOverseasOrderBody = z.object(baseOrderBody);
export const createShortVideoOrderBody = z.object({
  ...baseOrderBody,
  // 话题关键词非必填(对齐上游前台形态,格式形如 #减肥#健身),缺省时透传空串。
  keyword: z.string().optional().describe("话题关键词(短视频渠道选填,透传上游 create_order 的 keyword)"),
});

export const batchOrderBody = z.object({
  channel: mediaChannelSchema.describe("渠道:NEWS 新闻 / WE_MEDIA 自媒体 / OVERSEAS 海外 / SHORT_VIDEO 短视频"),
  mediaIds: z.array(z.number().int()).min(1).max(50).describe("目标媒体 ID 列表(1~50 家,同一篇稿件批量投放)"),
  title: z.string().min(1).describe("稿件标题"),
  content: z.string().min(1).describe("稿件正文(富文本 HTML)"),
  keyword: z.string().optional().describe("话题关键词(短视频渠道选填,其余渠道忽略)"),
  remark: z.string().optional().describe("发稿要求/备注(选填)"),
  customerName: z.string().max(200).optional().describe("所属客户名称(选填)"),
  ...weMediaOrderParams,
});
export type BatchOrderBody = z.infer<typeof batchOrderBody>;

export const orderSchema = z.object({
  id: z.string().describe("订单主键 ID"),
  tenantId: z.string().describe("所属租户 ID"),
  userId: z.string().describe("下单用户 ID"),
  orderNo: z.string().describe("平台订单号(查询/取消/同步均以此为准)"),
  upstreamOrderNo: z.string().nullable().describe("上游回传订单号(仅作记录展示,勿用于查询)"),
  channel: mediaChannelSchema.describe("渠道:NEWS 新闻 / WE_MEDIA 自媒体 / OVERSEAS 海外 / SHORT_VIDEO 短视频"),
  mediaId: z.number().int().describe("投放媒体 ID"),
  mediaName: z.string().describe("投放媒体名称"),
  title: z.string().describe("稿件标题"),
  content: z.string().describe("稿件正文(富文本 HTML)"),
  keyword: z.string().nullable().describe("关键词(仅短视频渠道)"),
  remark: z.string().nullable().describe("发稿要求/备注"),
  customerName: z.string().nullable().describe("所属客户名称"),
  cost: z.string().describe("上游成本价(仅平台超管可见,其余角色为空,单位:元)"),
  platformPrice: z.string().describe("平台底价(卖给租户的价格,单位:元)"),
  sellingPrice: z.string().describe("售价(实际扣款金额,单位:元)"),
  status: z.number().int().describe("订单状态:-3 取消 / -2 上游删除 / -1 拒稿 / 0 未处理 / 1 发布中 / 2 完成"),
  rejectReason: z.string().nullable().describe("拒稿原因(status=-1 时有值)"),
  publishUrl: z.string().nullable().describe("发布成功后的稿件链接"),
  presentUrl: z.string().nullable().describe("展示链接(上游回传的呈现地址)"),
  publishedAt: z.string().nullable().describe("发布完成时间"),
  accountRule: z.number().int().nullable().describe("账号规则(仅自媒体渠道)"),
  articleType: z.number().int().nullable().describe("文章类型(仅自媒体渠道)"),
  allowVideo: z.number().int().nullable().describe("视频参数(仅自媒体渠道)"),
  lastSyncedAt: z.string().nullable().describe("最近一次上游状态同步时间"),
  createdAt: z.string().describe("创建时间"),
  updatedAt: z.string().describe("更新时间"),
});
export type Order = z.infer<typeof orderSchema>;

export const batchResultSchema = z.object({
  results: z.array(
    z.object({
      mediaId: z.number().int().describe("媒体 ID"),
      ok: z.boolean().describe("该媒体是否受理成功"),
      orderNo: z.string().optional().describe("成功时返回的平台订单号"),
      previewUrl: z.string().url().optional().describe("成功投放后可直接打开的文章预览链接"),
      error: z.string().optional().describe("失败时的错误说明"),
    }),
  ).describe("每家媒体的投放结果(逐条独立,互不影响)"),
});
export type BatchResult = z.infer<typeof batchResultSchema>;
