import type { BatchOrderBody } from "./contracts/orders";
import type { ApiClient } from "./api-client";
import { preparePublish } from "./prepare";

type MediaCandidate = {
  upstreamId: number;
  name: string;
  sellingPrice: string;
};

type MediaList = {
  list: MediaCandidate[];
  total: number;
  page: number;
  limit: number;
};

export type PublishPlanOptions = {
  draftId: string;
  channelPath: "news" | "we-media" | "overseas" | "short-video";
  channel: BatchOrderBody["channel"];
  budget: number;
  priceMin: number;
  priceMax: number;
  count: number;
  keyword?: string;
  customerId?: string;
  remark?: string;
  output: string;
};

export function selectMediaPlan(candidates: MediaCandidate[], options: Pick<PublishPlanOptions, "budget" | "priceMin" | "priceMax" | "count">) {
  const eligible = candidates
    .map((media) => ({ ...media, price: Number(media.sellingPrice) }))
    .filter((media) => Number.isFinite(media.price) && media.price >= options.priceMin && media.price <= options.priceMax)
    .sort((left, right) => left.price - right.price || left.upstreamId - right.upstreamId);

  if (eligible.length < options.count) {
    throw new Error(`符合价格区间的可投媒体只有 ${eligible.length} 家，少于要求的 ${options.count} 家`);
  }

  const selected = eligible.slice(0, options.count);
  const total = selected.reduce((sum, media) => sum + media.price, 0);
  if (total > options.budget) {
    throw new Error(`满足数量要求的最低预计费用为 ${total.toFixed(2)} 元，超过预算 ${options.budget.toFixed(2)} 元`);
  }

  return { selected, total: total.toFixed(2) };
}

export async function planPublish(client: ApiClient, options: PublishPlanOptions) {
  const query = new URLSearchParams({
    page: "1",
    limit: "100",
    priceMin: String(options.priceMin),
    priceMax: String(options.priceMax),
    sort: "sellingPrice:asc",
  });
  if (options.keyword) query.set("keyword", options.keyword);

  const media = await client.get<MediaList>(`/media/${options.channelPath}?${query.toString()}`);
  const selection = selectMediaPlan(media.list, options);
  const criteria = {
    channel: options.channel,
    budget: options.budget.toFixed(2),
    priceMin: options.priceMin.toFixed(2),
    priceMax: options.priceMax.toFixed(2),
    count: options.count,
    keyword: options.keyword ?? null,
    strategy: "PRICE_ASC",
  };
  const prepared = await preparePublish(client, {
    draftId: options.draftId,
    channel: options.channel,
    mediaIds: selection.selected.map((item) => item.upstreamId),
    customerId: options.customerId,
    remark: options.remark,
    keyword: options.keyword,
    selection: {
      criteria,
      media: selection.selected.map((item) => ({
        mediaId: item.upstreamId,
        name: item.name,
        sellingPrice: item.price.toFixed(2),
      })),
      estimatedTotal: selection.total,
    },
    output: options.output,
  });

  return {
    ...prepared,
    criteria,
    selectedMedia: selection.selected.map((item) => ({
      mediaId: item.upstreamId,
      name: item.name,
      sellingPrice: item.price.toFixed(2),
    })),
    estimatedTotal: selection.total,
    candidateTotal: media.total,
  };
}
