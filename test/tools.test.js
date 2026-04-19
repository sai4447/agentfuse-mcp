/**
 * Tool handler tests -- verifies URL construction, fetch call counts, and
 * correct request bodies for each of the 6 MCP tool handlers.
 *
 * Strategy: import HANDLERS and agentfuse from src/index.js (safe because
 * the isMain guard prevents the server from starting on import), then stub
 * the global fetch with vi.stubGlobal so no real HTTP calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HANDLERS, agentfuse } from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared fetch mock helpers
// ---------------------------------------------------------------------------

function okJson(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function setupEnv() {
  process.env.AGENTFUSE_API_KEY = "af_test_key";
  process.env.AGENTFUSE_API_URL = "https://api.example.io";
}

function clearEnv() {
  delete process.env.AGENTFUSE_API_KEY;
  delete process.env.AGENTFUSE_API_URL;
}

beforeEach(setupEnv);
afterEach(() => {
  clearEnv();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// list_affiliate_programs
// ---------------------------------------------------------------------------

describe("list_affiliate_programs", () => {
  it("calls /api/catalog with no query string when no filters supplied", async () => {
    const mock = vi.fn(() => okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_affiliate_programs({});

    expect(mock).toHaveBeenCalledOnce();
    const [url] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/catalog");
  });

  it("appends category, limit, and cursor when provided", async () => {
    const mock = vi.fn(() => okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_affiliate_programs({ category: "ai-voice", limit: 10, cursor: "abc123" });

    const [url] = mock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("category")).toBe("ai-voice");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("cursor")).toBe("abc123");
  });

  it("omits query string params that are not provided", async () => {
    const mock = vi.fn(() => okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_affiliate_programs({ limit: 5 });

    const [url] = mock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.has("category")).toBe(false);
    expect(parsed.searchParams.has("cursor")).toBe(false);
    expect(parsed.searchParams.get("limit")).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// get_affiliate_program
// ---------------------------------------------------------------------------

describe("get_affiliate_program", () => {
  it("URL-encodes the slug in the path", async () => {
    const mock = vi.fn(() => okJson({ data: { id: "uuid-1" } }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.get_affiliate_program({ slug: "web flow" });

    const [url] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/catalog/web%20flow");
  });

  it("passes slug directly when no special chars", async () => {
    const mock = vi.fn(() => okJson({ data: { id: "uuid-2" } }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.get_affiliate_program({ slug: "webflow" });

    const [url] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/catalog/webflow");
  });
});

// ---------------------------------------------------------------------------
// generate_tracked_link
// ---------------------------------------------------------------------------

describe("generate_tracked_link", () => {
  it("makes exactly two fetch calls -- catalog lookup then links/generate", async () => {
    const catalogResponse = okJson({ data: { id: "prog-uuid-99" } });
    const linkResponse = okJson({ data: { tracked_url: "https://r.agentfuse.io/abc" } });

    const mock = vi.fn()
      .mockReturnValueOnce(catalogResponse)
      .mockReturnValueOnce(linkResponse);
    vi.stubGlobal("fetch", mock);

    await HANDLERS.generate_tracked_link({ program_slug: "notion", end_user_id: "user-42" });

    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("first call resolves slug via /api/catalog/:slug", async () => {
    const mock = vi.fn()
      .mockReturnValueOnce(okJson({ data: { id: "prog-uuid-99" } }))
      .mockReturnValueOnce(okJson({ data: {} }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.generate_tracked_link({ program_slug: "notion", end_user_id: "user-42" });

    const [firstUrl] = mock.mock.calls[0];
    expect(firstUrl).toBe("https://api.example.io/api/catalog/notion");
  });

  it("second call posts to /api/links/generate with program_id and end_user_id", async () => {
    const mock = vi.fn()
      .mockReturnValueOnce(okJson({ data: { id: "prog-uuid-99" } }))
      .mockReturnValueOnce(okJson({ data: {} }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.generate_tracked_link({ program_slug: "notion", end_user_id: "user-42" });

    const [secondUrl, secondOpts] = mock.mock.calls[1];
    expect(secondUrl).toBe("https://api.example.io/api/links/generate");
    expect(secondOpts.method).toBe("POST");

    const body = JSON.parse(secondOpts.body);
    expect(body.program_id).toBe("prog-uuid-99");
    expect(body.end_user_id).toBe("user-42");
  });

  it("includes metadata in the links/generate body when provided", async () => {
    const mock = vi.fn()
      .mockReturnValueOnce(okJson({ data: { id: "prog-uuid-99" } }))
      .mockReturnValueOnce(okJson({ data: {} }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.generate_tracked_link({
      program_slug: "notion",
      end_user_id: "user-42",
      metadata: { campaign: "onboarding" },
    });

    const body = JSON.parse(mock.mock.calls[1][1].body);
    expect(body.metadata).toEqual({ campaign: "onboarding" });
  });
});

// ---------------------------------------------------------------------------
// get_stats
// ---------------------------------------------------------------------------

describe("get_stats", () => {
  it("calls GET /api/stats", async () => {
    const mock = vi.fn(() => okJson({ total_clicks: 100 }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.get_stats({});

    expect(mock).toHaveBeenCalledOnce();
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/stats");
    expect(opts.method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// record_signup
// ---------------------------------------------------------------------------

describe("record_signup", () => {
  it("posts required fields to /api/webhooks/signup", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_signup({
      tracking_code: "tc_abc",
      network: "direct",
      network_event_id: "evt_001",
    });

    expect(mock).toHaveBeenCalledOnce();
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/webhooks/signup");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.tracking_code).toBe("tc_abc");
    expect(body.network).toBe("direct");
    expect(body.network_event_id).toBe("evt_001");
  });

  it("includes optional signup_email when provided", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_signup({
      tracking_code: "tc_abc",
      network: "impact",
      network_event_id: "evt_002",
      signup_email: "user@example.com",
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.signup_email).toBe("user@example.com");
  });

  it("does not include signup_email when omitted", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_signup({
      tracking_code: "tc_xyz",
      network: "direct",
      network_event_id: "evt_003",
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("signup_email");
  });
});

// ---------------------------------------------------------------------------
// record_commission
// ---------------------------------------------------------------------------

describe("record_commission", () => {
  it("posts required fields to /api/webhooks/commission", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_commission({
      tracking_code: "tc_abc",
      network: "impact",
      network_event_id: "comm_001",
      amount: 29.99,
    });

    expect(mock).toHaveBeenCalledOnce();
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.io/api/webhooks/commission");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.tracking_code).toBe("tc_abc");
    expect(body.network).toBe("impact");
    expect(body.network_event_id).toBe("comm_001");
    expect(body.amount).toBe(29.99);
  });

  it("passes through optional currency and commission_type", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_commission({
      tracking_code: "tc_abc",
      network: "direct",
      network_event_id: "comm_002",
      amount: 50,
      currency: "EUR",
      commission_type: "recurring",
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.currency).toBe("EUR");
    expect(body.commission_type).toBe("recurring");
  });

  it("passes through optional period_start and period_end", async () => {
    const mock = vi.fn(() => okJson({ success: true }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.record_commission({
      tracking_code: "tc_abc",
      network: "direct",
      network_event_id: "comm_003",
      amount: 10,
      period_start: "2026-04-01",
      period_end: "2026-04-30",
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.period_start).toBe("2026-04-01");
    expect(body.period_end).toBe("2026-04-30");
  });
});

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe("Authorization header", () => {
  it("sends Bearer token from AGENTFUSE_API_KEY", async () => {
    const mock = vi.fn(() => okJson({ data: [] }));
    vi.stubGlobal("fetch", mock);

    await HANDLERS.list_affiliate_programs({});

    const [, opts] = mock.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer af_test_key");
  });
});
