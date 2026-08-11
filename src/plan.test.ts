import { describe, expect, it } from "bun:test";
import { selectMediaPlan } from "./plan";

const media = [
  { upstreamId: 3, name: "C", sellingPrice: "300" },
  { upstreamId: 1, name: "A", sellingPrice: "100" },
  { upstreamId: 2, name: "B", sellingPrice: "200" },
];

describe("selectMediaPlan", () => {
  it("selects the requested number of cheapest eligible media within budget", () => {
    const result = selectMediaPlan(media, { budget: 350, priceMin: 100, priceMax: 300, count: 2 });
    expect(result.selected.map((item) => item.upstreamId)).toEqual([1, 2]);
    expect(result.total).toBe("300.00");
  });

  it("rejects a plan when the eligible media count is insufficient", () => {
    expect(() => selectMediaPlan(media, { budget: 1000, priceMin: 250, priceMax: 350, count: 2 }))
      .toThrow("少于要求的 2 家");
  });

  it("rejects a plan when the cheapest valid combination exceeds the budget", () => {
    expect(() => selectMediaPlan(media, { budget: 250, priceMin: 100, priceMax: 300, count: 2 }))
      .toThrow("超过预算 250.00 元");
  });
});
