import { describe, expect, it } from "bun:test";
import { summarizeCampaign } from "./campaign";

describe("summarizeCampaign", () => {
  it("includes order creation failures in a partial success summary", () => {
    const result = summarizeCampaign(
      {
        id: "approval-1",
        status: "CONFIRMED",
        results: [
          { mediaId: 1, ok: true, orderNo: "ORDER-1" },
          { mediaId: 2, ok: false, error: "媒体不可投" },
        ],
      },
      [{ orderNo: "ORDER-1", status: 2 }],
      false,
    );
    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.summary).toEqual({ total: 2, success: 1, failed: 1, processing: 0 });
    expect(result.failedResults).toHaveLength(1);
  });

  it("returns timeout with the latest processing counts", () => {
    const result = summarizeCampaign(
      { id: "approval-2", status: "CONFIRMED", results: [{ mediaId: 1, ok: true, orderNo: "ORDER-2" }] },
      [{ orderNo: "ORDER-2", status: 1 }],
      true,
    );
    expect(result.status).toBe("TIMEOUT");
    expect(result.summary.processing).toBe(1);
  });
});
