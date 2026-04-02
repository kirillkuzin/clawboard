/**
 * Tests for the usage.cost JSON-RPC response parsing logic.
 *
 * Validates that parseCostResponse correctly normalizes various gateway
 * response shapes into the canonical UsageCostData structure.
 */

import { describe, it, expect } from "vitest";
import {
  parseCostResponse,
  toLegacyCostTrackingData,
  type UsageCostData,
} from "@/hooks/use-usage-cost-polling";

describe("parseCostResponse", () => {
  it("parses a fully-populated flat response", () => {
    const raw = {
      today: 12.5,
      allTime: 1250.75,
      projected: 375.0,
      currency: "USD",
      perModel: [
        { model: "claude-sonnet-4-20250514", cost: 800.0, requests: 1500, tokens: 2000000 },
        { model: "gpt-4o", cost: 450.75, requests: 800, tokens: 1200000 },
      ],
      dailyHistory: [
        { date: "2026-03-18", cost: 10.25 },
        { date: "2026-03-19", cost: 11.0 },
        { date: "2026-03-20", cost: 12.5 },
      ],
      budgetLimit: 2000,
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(12.5);
    expect(result.allTime).toBe(1250.75);
    expect(result.projected).toBe(375.0);
    expect(result.currency).toBe("USD");
    expect(result.perModel).toHaveLength(2);
    expect(result.perModel[0]).toEqual({
      model: "claude-sonnet-4-20250514",
      cost: 800.0,
      requests: 1500,
      tokens: 2000000,
    });
    expect(result.perModel[1]).toEqual({
      model: "gpt-4o",
      cost: 450.75,
      requests: 800,
      tokens: 1200000,
    });
    expect(result.dailyHistory).toHaveLength(3);
    expect(result.dailyHistory[2]).toEqual({ date: "2026-03-20", cost: 12.5 });
    expect(result.budgetLimit).toBe(2000);
    expect(result.budgetUsedPercent).toBeCloseTo(62.5375);
  });

  it("parses a nested response (data under .cost key)", () => {
    const raw = {
      cost: {
        today: 5.0,
        allTime: 500.0,
        projected: 150.0,
        currency: "EUR",
        perModel: [{ model: "claude-opus-4", cost: 500.0 }],
      },
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(5.0);
    expect(result.allTime).toBe(500.0);
    expect(result.projected).toBe(150.0);
    expect(result.currency).toBe("EUR");
    expect(result.perModel).toHaveLength(1);
    expect(result.perModel[0].model).toBe("claude-opus-4");
  });

  it("handles snake_case field names", () => {
    const raw = {
      daily_cost: 8.0,
      all_time: 900.0,
      projected_monthly: 240.0,
      per_model: [{ name: "gpt-4o-mini", amount: 900.0 }],
      daily_history: [{ day: "2026-03-20", amount: 8.0 }],
      budget_limit: 1500,
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(8.0);
    expect(result.allTime).toBe(900.0);
    expect(result.projected).toBe(240.0);
    expect(result.perModel[0].model).toBe("gpt-4o-mini");
    expect(result.perModel[0].cost).toBe(900.0);
    expect(result.dailyHistory[0]).toEqual({ date: "2026-03-20", cost: 8.0 });
    expect(result.budgetLimit).toBe(1500);
    expect(result.budgetUsedPercent).toBe(60.0);
  });

  it("handles legacy CostTrackingData shape (totalCost, dailyCost, breakdown)", () => {
    const raw = {
      totalCost: 750.0,
      dailyCost: 15.0,
      currency: "USD",
      breakdown: [
        { label: "claude-sonnet-4-20250514", amount: 500 },
        { label: "gpt-4o", amount: 250 },
      ],
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(15.0);
    expect(result.allTime).toBe(750.0);
    expect(result.projected).toBe(0); // no projected in legacy
    expect(result.perModel).toHaveLength(2);
    expect(result.perModel[0].model).toBe("claude-sonnet-4-20250514");
    expect(result.perModel[0].cost).toBe(500);
    expect(result.perModel[1].model).toBe("gpt-4o");
    expect(result.perModel[1].cost).toBe(250);
  });

  it("defaults all fields gracefully for an empty response", () => {
    const result = parseCostResponse({});

    expect(result.today).toBe(0);
    expect(result.allTime).toBe(0);
    expect(result.projected).toBe(0);
    expect(result.currency).toBe("USD");
    expect(result.perModel).toEqual([]);
    expect(result.dailyHistory).toEqual([]);
    expect(result.budgetLimit).toBeNull();
    expect(result.budgetUsedPercent).toBeNull();
  });

  it("handles string numeric values (from JSON)", () => {
    const raw = {
      today: "7.50",
      allTime: "1000.25",
      projected: "200",
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(7.5);
    expect(result.allTime).toBe(1000.25);
    expect(result.projected).toBe(200);
  });

  it("handles NaN and invalid numeric values gracefully", () => {
    const raw = {
      today: NaN,
      allTime: "not-a-number",
      projected: undefined,
    };

    const result = parseCostResponse(raw);

    expect(result.today).toBe(0);
    expect(result.allTime).toBe(0);
    expect(result.projected).toBe(0);
  });

  it("ignores non-array perModel values", () => {
    const raw = {
      perModel: "invalid",
    };

    const result = parseCostResponse(raw);
    expect(result.perModel).toEqual([]);
  });

  it("filters out invalid entries in perModel array", () => {
    const raw = {
      perModel: [
        { model: "valid-model", cost: 100 },
        null,
        "invalid",
        42,
        { model: "another-model", cost: 200 },
      ],
    };

    const result = parseCostResponse(raw);
    expect(result.perModel).toHaveLength(2);
    expect(result.perModel[0].model).toBe("valid-model");
    expect(result.perModel[1].model).toBe("another-model");
  });

  it("caps budgetUsedPercent at 100", () => {
    const raw = {
      allTime: 3000,
      budgetLimit: 2000,
    };

    const result = parseCostResponse(raw);
    expect(result.budgetUsedPercent).toBe(100);
  });

  it("returns null budgetUsedPercent when budgetLimit is 0", () => {
    const raw = {
      allTime: 100,
      budgetLimit: 0,
    };

    const result = parseCostResponse(raw);
    expect(result.budgetLimit).toBe(0);
    expect(result.budgetUsedPercent).toBeNull();
  });

  it("uses 'total' field as fallback for allTime", () => {
    const raw = {
      total: 555.55,
      today: 10,
    };

    const result = parseCostResponse(raw);
    expect(result.allTime).toBe(555.55);
  });

  it("uses 'models' as fallback for perModel", () => {
    const raw = {
      models: [{ model: "test-model", cost: 42 }],
    };

    const result = parseCostResponse(raw);
    expect(result.perModel).toHaveLength(1);
    expect(result.perModel[0].model).toBe("test-model");
  });
});

describe("toLegacyCostTrackingData", () => {
  it("converts UsageCostData to the legacy CostTrackingData shape", () => {
    const costData: UsageCostData = {
      today: 15.0,
      allTime: 750.0,
      projected: 225.0,
      currency: "USD",
      perModel: [
        { model: "claude-sonnet-4-20250514", cost: 500, requests: 100, tokens: 500000 },
        { model: "gpt-4o", cost: 250, requests: 50, tokens: 200000 },
      ],
      dailyHistory: [{ date: "2026-03-20", cost: 15.0 }],
      budgetLimit: 2000,
      budgetUsedPercent: 37.5,
    };

    const legacy = toLegacyCostTrackingData(costData);

    expect(legacy.totalCost).toBe(750.0);
    expect(legacy.dailyCost).toBe(15.0);
    expect(legacy.currency).toBe("USD");
    expect(legacy.breakdown).toHaveLength(2);
    expect(legacy.breakdown[0]).toEqual({
      label: "claude-sonnet-4-20250514",
      amount: 500,
    });
    expect(legacy.breakdown[1]).toEqual({
      label: "gpt-4o",
      amount: 250,
    });
  });

  it("handles empty perModel array", () => {
    const costData: UsageCostData = {
      today: 0,
      allTime: 0,
      projected: 0,
      currency: "EUR",
      perModel: [],
      dailyHistory: [],
      budgetLimit: null,
      budgetUsedPercent: null,
    };

    const legacy = toLegacyCostTrackingData(costData);
    expect(legacy.breakdown).toEqual([]);
    expect(legacy.currency).toBe("EUR");
  });
});
