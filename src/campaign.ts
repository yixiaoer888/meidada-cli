import type { ApiClient } from "./api-client";

const ORDER_DONE = new Set([-3, -2, -1, 2]);

type Approval = {
  id: string;
  status: string;
  confirmationUrl?: string;
  results?: Array<{ mediaId: number; ok: boolean; orderNo?: string; previewUrl?: string; error?: string }> | null;
  [key: string]: unknown;
};

type Order = {
  orderNo: string;
  mediaId?: number;
  mediaName?: string;
  status: number;
  rejectReason?: string | null;
  sellingPrice?: string;
  [key: string]: unknown;
};

export function summarizeCampaign(approval: Approval, orders: Order[], timedOut: boolean) {
  const failedResults = (approval.results ?? []).filter((result) => !result.ok);
  const success = orders.filter((order) => order.status === 2).length;
  const failed = orders.filter((order) => order.status < 0).length + failedResults.length;
  const processing = orders.length - success - orders.filter((order) => order.status < 0).length;
  const total = orders.length + failedResults.length;
  const status = timedOut
    ? "TIMEOUT"
    : total === 0
      ? approval.status
      : processing > 0
        ? "PROCESSING"
        : failed === 0
          ? "SUCCESS"
          : success > 0
            ? "PARTIAL_SUCCESS"
            : "FAILED";
  return {
    campaignId: approval.id,
    status,
    approvalStatus: approval.status,
    confirmationUrl: approval.confirmationUrl ?? null,
    summary: { total, success, failed, processing },
    orders,
    failedResults,
    approval,
  };
}

export async function getCampaign(client: ApiClient, approvalId: string) {
  const approval = await client.get<Approval>(`/publish-approvals/${encodeURIComponent(approvalId)}`);
  const orderNos = (approval.results ?? []).flatMap((item) => item.orderNo ? [item.orderNo] : []);
  const orders = await Promise.all(orderNos.map((orderNo) => client.get<Order>(`/orders/${encodeURIComponent(orderNo)}`)));
  return summarizeCampaign(approval, orders, false);
}

export async function waitForCampaign(client: ApiClient, approvalId: string, intervalSeconds: number, timeoutSeconds: number) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let approval: Approval;
  while (true) {
    approval = await client.get<Approval>(`/publish-approvals/${encodeURIComponent(approvalId)}`);
    if (!["PENDING", "PROCESSING"].includes(approval.status)) break;
    if (Date.now() >= deadline) return summarizeCampaign(approval, [], true);
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }

  if (approval.status !== "CONFIRMED") return summarizeCampaign(approval, [], false);
  while (true) {
    const orderNos = (approval.results ?? []).flatMap((item) => item.orderNo ? [item.orderNo] : []);
    const orders = await Promise.all(orderNos.map((orderNo) => client.post<Order>(`/orders/${encodeURIComponent(orderNo)}/sync`)));
    if (orders.length === 0 || orders.every((order) => ORDER_DONE.has(order.status))) return summarizeCampaign(approval, orders, false);
    if (Date.now() >= deadline) return summarizeCampaign(approval, orders, true);
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}
