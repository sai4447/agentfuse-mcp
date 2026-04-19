/**
 * Error-path tests -- missing API key, 4xx responses, missing required params.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { HANDLERS, agentfuse } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorJson(status, data) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function okJson(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => {
  process.env.AGENTFUSE_API_KEY = "af_test_key";
  process.env.AGENTFUSE_API_URL = "https://api.example.io";
});

afterEach(() => {
  delete process.env.AGENTFUSE_API_KEY;
  delete process.env.AGENTFUSE_API_URL;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Missing API key
// ---------------------------------------------------------------------------

describe("missing AGENTFUSE_API_KEY", () => {
  it("throws McpError with helpful message", async () => {
    delete process.env.AGENTFUSE_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await expect(agentfuse("GET", "/api/catalog")).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining("AGENTFUSE_API_KEY"),
    });
  });

  it("does NOT call fetch when API key is missing", async () => {
    delete process.env.AGENTFUSE_API_KEY;
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(agentfuse("GET", "/api/catalog")).rejects.toBeInstanceOf(McpError);
    expect(mock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// API 4xx / 5xx error responses
// ---------------------------------------------------------------------------

describe("API error responses", () => {
  it("throws McpError when API returns 401 with error field", async () => {
    vi.stubGlobal("fetch", vi.fn(() => errorJson(401, { error: "Invalid API key" })));

    await expect(agentfuse("GET", "/api/catalog")).rejects.toMatchObject({
      code: ErrorCode.InternalError,
      message: expect.stringContaining("Invalid API key"),
    });
  });

  it("throws McpError when API returns 404 with message field", async () => {
    vi.stubGlobal("fetch", vi.fn(() => errorJson(404, { message: "Program not found" })));

    await expect(agentfuse("GET", "/api/catalog/bad-slug")).rejects.toMatchObject({
      code: ErrorCode.InternalError,
      message: expect.stringContaining("Program not found"),
    });
  });

  it("includes the HTTP status code in the error message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => errorJson(403, { error: "Forbidden" })));

    await expect(agentfuse("GET", "/api/stats")).rejects.toMatchObject({
      message: expect.stringContaining("403"),
    });
  });

  it("throws McpError when response body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      })
    ));

    // non-JSON body goes through the InternalError branch
    await expect(agentfuse("GET", "/api/catalog")).rejects.toBeInstanceOf(McpError);
  });
});

// ---------------------------------------------------------------------------
// Missing required params -- InvalidParams thrown before fetch
// ---------------------------------------------------------------------------

describe("missing required params", () => {
  it("get_affiliate_program throws InvalidParams when slug is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(HANDLERS.get_affiliate_program({})).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("slug"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("generate_tracked_link throws InvalidParams when program_slug is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.generate_tracked_link({ end_user_id: "u1" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("program_slug"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("generate_tracked_link throws InvalidParams when end_user_id is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.generate_tracked_link({ program_slug: "notion" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("end_user_id"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("generate_tracked_link throws InvalidParams when catalog returns no id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ data: {} })));

    await expect(
      HANDLERS.generate_tracked_link({ program_slug: "bad-slug", end_user_id: "u1" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("bad-slug"),
    });
  });

  it("record_signup throws InvalidParams when tracking_code is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_signup({ network: "direct", network_event_id: "e1" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("tracking_code"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("record_signup throws InvalidParams when network is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_signup({ tracking_code: "tc", network_event_id: "e1" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("network"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("record_signup throws InvalidParams when network_event_id is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_signup({ tracking_code: "tc", network: "direct" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("network_event_id"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("record_commission throws InvalidParams when amount is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_commission({
        tracking_code: "tc",
        network: "direct",
        network_event_id: "e1",
      })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("amount"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("record_commission throws InvalidParams when tracking_code is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_commission({ network: "direct", network_event_id: "e1", amount: 10 })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("tracking_code"),
    });
    expect(mock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// list_tracked_links -- slug resolution paths
// ---------------------------------------------------------------------------

describe("list_tracked_links slug resolution", () => {
  it("throws InvalidParams when program_slug resolves to no id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ data: {} })));

    await expect(
      HANDLERS.list_tracked_links({ program_slug: "no-such-slug" })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("no-such-slug"),
    });
  });

  it("includes program_id in query string when slug resolves successfully", async () => {
    const mock = vi.fn()
      .mockReturnValueOnce(okJson({ data: { id: "prog-uuid-77" } }))
      .mockReturnValueOnce(okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_tracked_links({ program_slug: "notion" });

    // Second call is the actual /api/links request
    const [url] = mock.mock.calls[1];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("program_id")).toBe("prog-uuid-77");
  });

  it("appends end_user_id, limit, cursor to /api/links query string", async () => {
    const mock = vi.fn(() => okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_tracked_links({ end_user_id: "u1", limit: 5, cursor: "cur99" });

    const [url] = mock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("end_user_id")).toBe("u1");
    expect(parsed.searchParams.get("limit")).toBe("5");
    expect(parsed.searchParams.get("cursor")).toBe("cur99");
  });
});

// ---------------------------------------------------------------------------
// record_commission -- missing network / network_event_id
// ---------------------------------------------------------------------------

describe("record_commission missing network or network_event_id", () => {
  it("throws InvalidParams when network is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_commission({ tracking_code: "tc", network_event_id: "e1", amount: 10 })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("network"),
    });
    expect(mock).not.toHaveBeenCalled();
  });

  it("throws InvalidParams when network_event_id is absent", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    await expect(
      HANDLERS.record_commission({ tracking_code: "tc", network: "direct", amount: 10 })
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("network_event_id"),
    });
    expect(mock).not.toHaveBeenCalled();
  });
});
