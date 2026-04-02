/**
 * Tests for JSON-RPC message serialization/deserialization utilities
 * and UUID-correlated request-ID tracking.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  uuid,
  createRequestFrame,
  serializeRequest,
  serializeFrame,
  parseFrame,
  isResponseFrame,
  isEventFrame,
  isRequestFrame,
  RequestCorrelator,
} from "@/lib/gateway/protocol";
import type {
  GatewayResponse,
  GatewayEvent,
  GatewayRequest,
} from "@/lib/gateway-types";

// =============================================================================
// 1. UUID Generation
// =============================================================================

describe("uuid", () => {
  it("returns a string in UUID v4 format", () => {
    const id = uuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });
});

// =============================================================================
// 2. Frame Serialization
// =============================================================================

describe("createRequestFrame", () => {
  it("creates a frame with auto-generated UUID id", () => {
    const frame = createRequestFrame("device.auth", { deviceId: "abc" });
    expect(frame.frame).toBe("req");
    expect(frame.id).toMatch(/^[0-9a-f-]+$/);
    expect(frame.method).toBe("device.auth");
    expect(frame.params).toEqual({ deviceId: "abc" });
  });

  it("uses provided custom id", () => {
    const frame = createRequestFrame("ping", {}, "custom-id-123");
    expect(frame.id).toBe("custom-id-123");
  });

  it("defaults params to empty object", () => {
    const frame = createRequestFrame("ping");
    expect(frame.params).toEqual({});
  });
});

describe("serializeRequest", () => {
  it("returns [id, json] tuple", () => {
    const [id, json] = serializeRequest("device.auth", { key: "val" });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const parsed = JSON.parse(json);
    expect(parsed.frame).toBe("req");
    expect(parsed.id).toBe(id);
    expect(parsed.method).toBe("device.auth");
    expect(parsed.params).toEqual({ key: "val" });
  });

  it("uses custom id when provided", () => {
    const [id, json] = serializeRequest("ping", {}, "my-id");
    expect(id).toBe("my-id");
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe("my-id");
  });
});

describe("serializeFrame", () => {
  it("serializes a response frame", () => {
    const frame: GatewayResponse = {
      frame: "res",
      id: "test-id",
      ok: true,
      result: { status: "authenticated" },
    };
    const json = serializeFrame(frame);
    expect(JSON.parse(json)).toEqual(frame);
  });

  it("serializes an event frame", () => {
    const frame: GatewayEvent = {
      frame: "event",
      type: "health.update",
      data: { cpu: 42 },
      timestamp: "2026-01-01T00:00:00Z",
    };
    const json = serializeFrame(frame);
    expect(JSON.parse(json)).toEqual(frame);
  });
});

// =============================================================================
// 3. Frame Deserialization / Parsing
// =============================================================================

describe("parseFrame", () => {
  it("parses a response frame", () => {
    const json = JSON.stringify({
      frame: "res",
      id: "abc-123",
      ok: true,
      result: { status: "authenticated" },
    });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("response");
    if (isResponseFrame(parsed)) {
      expect(parsed.frame.id).toBe("abc-123");
      expect(parsed.frame.ok).toBe(true);
      expect(parsed.frame.result?.status).toBe("authenticated");
    }
  });

  it("parses an event frame", () => {
    const json = JSON.stringify({
      frame: "event",
      type: "health.update",
      data: { cpu: 55 },
    });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("event");
    if (isEventFrame(parsed)) {
      expect(parsed.frame.type).toBe("health.update");
      expect(parsed.frame.data).toEqual({ cpu: 55 });
    }
  });

  it("parses a request frame (server-initiated)", () => {
    const json = JSON.stringify({
      frame: "req",
      id: "srv-1",
      method: "notify",
      params: { msg: "hello" },
    });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("request");
    if (isRequestFrame(parsed)) {
      expect(parsed.frame.method).toBe("notify");
    }
  });

  it("returns unknown for unrecognized frame type", () => {
    const json = JSON.stringify({ frame: "pong", timestamp: "2026-01-01" });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("unknown");
    if (parsed.type === "unknown") {
      expect((parsed.raw as Record<string, unknown>).frame).toBe("pong");
    }
  });

  it("returns unknown for object without frame field", () => {
    const json = JSON.stringify({ type: "ping", data: {} });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("unknown");
  });

  it("returns error for invalid JSON", () => {
    const parsed = parseFrame("not valid json{{{");
    expect(parsed.type).toBe("error");
    if (parsed.type === "error") {
      expect(parsed.error).toContain("Invalid JSON");
    }
  });

  it("returns error for non-object JSON (number)", () => {
    const parsed = parseFrame("42");
    expect(parsed.type).toBe("error");
  });

  it("returns error for non-object JSON (null)", () => {
    const parsed = parseFrame("null");
    expect(parsed.type).toBe("error");
  });

  it("returns error for binary data", () => {
    const parsed = parseFrame(new ArrayBuffer(8));
    expect(parsed.type).toBe("error");
  });

  it("parses response with error field", () => {
    const json = JSON.stringify({
      frame: "res",
      id: "err-1",
      ok: false,
      error: { code: "INVALID_SIGNATURE", message: "Bad sig" },
    });
    const parsed = parseFrame(json);
    expect(parsed.type).toBe("response");
    if (isResponseFrame(parsed)) {
      expect(parsed.frame.ok).toBe(false);
      expect(parsed.frame.error?.code).toBe("INVALID_SIGNATURE");
    }
  });
});

// =============================================================================
// 4. Type Guards
// =============================================================================

describe("type guards", () => {
  it("isResponseFrame returns true for response", () => {
    const parsed = parseFrame(
      JSON.stringify({ frame: "res", id: "x", ok: true })
    );
    expect(isResponseFrame(parsed)).toBe(true);
    expect(isEventFrame(parsed)).toBe(false);
    expect(isRequestFrame(parsed)).toBe(false);
  });

  it("isEventFrame returns true for event", () => {
    const parsed = parseFrame(
      JSON.stringify({ frame: "event", type: "test", data: {} })
    );
    expect(isEventFrame(parsed)).toBe(true);
    expect(isResponseFrame(parsed)).toBe(false);
  });

  it("isRequestFrame returns true for request", () => {
    const parsed = parseFrame(
      JSON.stringify({ frame: "req", id: "x", method: "m", params: {} })
    );
    expect(isRequestFrame(parsed)).toBe(true);
    expect(isResponseFrame(parsed)).toBe(false);
  });
});

// =============================================================================
// 5. RequestCorrelator
// =============================================================================

describe("RequestCorrelator", () => {
  let correlator: RequestCorrelator;

  beforeEach(() => {
    vi.useFakeTimers();
    correlator = new RequestCorrelator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("register", () => {
    it("returns a unique request ID and a promise", () => {
      const { id, promise } = correlator.register("device.auth");
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(promise).toBeInstanceOf(Promise);
    });

    it("uses custom id when provided", () => {
      const { id } = correlator.register("ping", 5000, "custom-123");
      expect(id).toBe("custom-123");
    });

    it("increments the pending count", () => {
      expect(correlator.size).toBe(0);
      correlator.register("a");
      expect(correlator.size).toBe(1);
      correlator.register("b");
      expect(correlator.size).toBe(2);
    });

    it("has() returns true for pending requests", () => {
      const { id } = correlator.register("test");
      expect(correlator.has(id)).toBe(true);
      expect(correlator.has("nonexistent")).toBe(false);
    });
  });

  describe("resolve", () => {
    it("resolves the promise with the matching response", async () => {
      const { id, promise } = correlator.register("device.auth");

      const response: GatewayResponse = {
        frame: "res",
        id,
        ok: true,
        result: { status: "authenticated" },
      };

      const resolved = correlator.resolve(response);
      expect(resolved).toBe(true);
      expect(correlator.size).toBe(0);

      const result = await promise;
      expect(result).toEqual(response);
    });

    it("returns false for unknown response IDs", () => {
      const response: GatewayResponse = {
        frame: "res",
        id: "unknown-id",
        ok: true,
      };
      expect(correlator.resolve(response)).toBe(false);
    });

    it("clears the timeout when resolved", async () => {
      const { id, promise } = correlator.register("test", 5000);

      const response: GatewayResponse = { frame: "res", id, ok: true };
      correlator.resolve(response);
      await promise;

      // Advance past timeout — should not throw
      vi.advanceTimersByTime(10000);
      expect(correlator.size).toBe(0);
    });
  });

  describe("reject", () => {
    it("rejects a specific pending request", async () => {
      const { id, promise } = correlator.register("test");

      const rejected = correlator.reject(id, "cancelled");
      expect(rejected).toBe(true);
      expect(correlator.size).toBe(0);

      await expect(promise).rejects.toThrow("cancelled");
    });

    it("returns false for unknown request ID", () => {
      expect(correlator.reject("nope", "reason")).toBe(false);
    });
  });

  describe("timeout", () => {
    it("rejects the promise after timeout", async () => {
      const { promise } = correlator.register("slow.method", 3000);

      vi.advanceTimersByTime(3001);

      await expect(promise).rejects.toThrow("timed out after 3000ms");
      expect(correlator.size).toBe(0);
    });

    it("includes method name in timeout error", async () => {
      const { promise } = correlator.register("device.auth.challenge", 1000);

      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow("device.auth.challenge");
    });
  });

  describe("cancelAll", () => {
    it("rejects all pending requests", async () => {
      const { promise: p1 } = correlator.register("a");
      const { promise: p2 } = correlator.register("b");
      const { promise: p3 } = correlator.register("c");

      correlator.cancelAll("Connection closed");

      expect(correlator.size).toBe(0);

      await expect(p1).rejects.toThrow("Connection closed");
      await expect(p2).rejects.toThrow("Connection closed");
      await expect(p3).rejects.toThrow("Connection closed");
    });
  });

  describe("getPendingInfo", () => {
    it("returns diagnostic info for all pending requests", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      correlator.register("method.a", 5000, "id-a");

      vi.advanceTimersByTime(100);
      correlator.register("method.b", 5000, "id-b");

      const info = correlator.getPendingInfo();
      expect(info).toHaveLength(2);

      const infoA = info.find((i) => i.id === "id-a");
      const infoB = info.find((i) => i.id === "id-b");

      expect(infoA?.method).toBe("method.a");
      expect(infoA?.ageMs).toBe(100);
      expect(infoB?.method).toBe("method.b");
      expect(infoB?.ageMs).toBe(0);
    });
  });

  describe("concurrent requests with different IDs", () => {
    it("resolves each request independently by ID", async () => {
      const req1 = correlator.register("method.a");
      const req2 = correlator.register("method.b");
      const req3 = correlator.register("method.c");

      // Resolve in reverse order
      correlator.resolve({
        frame: "res",
        id: req3.id,
        ok: true,
        result: { val: "c" },
      });
      correlator.resolve({
        frame: "res",
        id: req1.id,
        ok: true,
        result: { val: "a" },
      });
      correlator.resolve({
        frame: "res",
        id: req2.id,
        ok: false,
        error: { code: "ERR", message: "fail" },
      });

      const r1 = await req1.promise;
      const r2 = await req2.promise;
      const r3 = await req3.promise;

      expect(r1.result).toEqual({ val: "a" });
      expect(r2.ok).toBe(false);
      expect(r2.error?.code).toBe("ERR");
      expect(r3.result).toEqual({ val: "c" });
    });
  });
});
