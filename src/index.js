#!/usr/bin/env node

/**
 * AgentFuse MCP Server
 *
 * Exposes the AgentFuse Affiliate API as MCP tools so AI agents can:
 *   - Browse available affiliate programs
 *   - Generate tracked affiliate links for end users
 *   - Record affiliate signups and commissions
 *   - Query dashboard stats
 *
 * Config (via environment variables):
 *   AGENTFUSE_API_KEY  -- required, e.g. af_live_...
 *   AGENTFUSE_API_URL  -- optional, defaults to https://api.agentfuse.io
 */

import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Helper: call the AgentFuse REST API
// ---------------------------------------------------------------------------

export async function agentfuse(method, path, body = null) {
  const apiKey = process.env.AGENTFUSE_API_KEY || "";
  const baseUrl = (process.env.AGENTFUSE_API_URL || "https://api.agentfuse.io").replace(/\/$/, "");

  if (!apiKey) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "AGENTFUSE_API_KEY environment variable is not set. " +
        "Get a key at https://agentfuse.io and add it to your MCP config."
    );
  }

  const url = `${baseUrl}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "agentfuse-mcp/1.0.0",
  };

  const options = { method, headers };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new McpError(
      ErrorCode.InternalError,
      `AgentFuse API returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data);
    throw new McpError(
      ErrorCode.InternalError,
      `AgentFuse API error ${res.status}: ${msg}`
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_affiliate_programs",
    description:
      "Browse available affiliate programs in the AgentFuse catalog. " +
      "Returns each program's name, slug, category, commission rate, and network. " +
      "Use this to discover programs before generating tracked links.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Filter by category slug. Examples: productivity, marketing, ai-voice, ai-writing, " +
            "email-marketing, newsletter, automation, marketing-automation, seo-analytics, " +
            "design, developer-tools. Omit to return all categories.",
        },
        limit: {
          type: "number",
          description: "Number of programs to return (default: 50, max: 100).",
          minimum: 1,
          maximum: 100,
        },
        cursor: {
          type: "string",
          description:
            "Pagination cursor returned from a previous call. Pass this to get the next page.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_affiliate_program",
    description:
      "Get full details for a single affiliate program by its slug. " +
      "Returns the program's UUID (needed for generate_tracked_link), commission structure, " +
      "payout terms, description, and network info.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "The program slug (e.g. 'webflow', 'elevenlabs', 'notion', 'zapier'). " +
            "Use list_affiliate_programs to discover available slugs.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "generate_tracked_link",
    description:
      "Generate a tracked affiliate link for a program and an end user. " +
      "Pass the human-readable program slug (e.g. 'webflow') -- the tool resolves the UUID automatically. " +
      "The link records clicks and attributes any resulting signups or commissions " +
      "back to the specified end user. Returns a short redirect URL and a tracking_code " +
      "you should save -- it is needed for record_signup and record_commission.",
    inputSchema: {
      type: "object",
      properties: {
        program_slug: {
          type: "string",
          description:
            "Slug of the affiliate program (e.g. 'webflow', 'notion'). " +
            "Use list_affiliate_programs to find available slugs.",
        },
        end_user_id: {
          type: "string",
          description:
            "Your internal ID for the end user who will receive credit for this referral. " +
            "Can be any stable unique string (UUID, email, username, etc.).",
        },
        metadata: {
          type: "object",
          description:
            "Optional key-value metadata to attach to the link " +
            "(e.g. { campaign: 'onboarding', source: 'chat' }).",
          additionalProperties: { type: "string" },
        },
      },
      required: ["program_slug", "end_user_id"],
    },
  },
  {
    name: "get_stats",
    description:
      "Retrieve AgentFuse dashboard summary stats: total clicks, signups, commissions, " +
      "and top-performing programs. Useful for reporting to users or surfacing revenue data.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_tracked_links",
    description:
      "List tracked affiliate links previously generated by this API key. " +
      "Returns each link's tracked URL, tracking_code, click count, program, and end user. " +
      "Use this to look up existing links before generating a new one, or to show a user " +
      "their active referral links.",
    inputSchema: {
      type: "object",
      properties: {
        end_user_id: {
          type: "string",
          description:
            "Filter links by end user ID. Use this to fetch all links for a specific user.",
        },
        program_slug: {
          type: "string",
          description:
            "Filter links by program slug (e.g. 'webflow'). " +
            "The tool resolves the slug to a UUID automatically before querying.",
        },
        limit: {
          type: "number",
          description: "Number of links to return (default: 20, max: 100).",
          minimum: 1,
          maximum: 100,
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from a previous call to get the next page.",
        },
      },
      required: [],
    },
  },
  {
    name: "record_signup",
    description:
      "Record an affiliate signup conversion event. Call this when one of your end users " +
      "successfully signs up for a referred product. Requires the tracking_code returned " +
      "by generate_tracked_link. Idempotent -- safe to call multiple times with the same " +
      "network + network_event_id.",
    inputSchema: {
      type: "object",
      properties: {
        tracking_code: {
          type: "string",
          description:
            "The tracking code from the affiliate link (returned by generate_tracked_link). " +
            "This ties the signup back to the original referral.",
        },
        network: {
          type: "string",
          description:
            "The affiliate network that reported this event. One of: 'partnerstack', 'impact', 'direct'.",
          enum: ["partnerstack", "impact", "direct"],
        },
        network_event_id: {
          type: "string",
          description:
            "Unique event ID from the affiliate network (or any unique string for 'direct'). " +
            "Used for idempotency -- duplicate calls with the same ID are ignored.",
        },
        signup_email: {
          type: "string",
          description: "Email address the user signed up with (optional but recommended).",
        },
        metadata: {
          type: "object",
          description: "Optional extra data to attach to this event.",
          additionalProperties: true,
        },
      },
      required: ["tracking_code", "network", "network_event_id"],
    },
  },
  {
    name: "record_commission",
    description:
      "Record an affiliate commission event (e.g. when a referred user makes a purchase " +
      "or renews a subscription). Requires the tracking_code from the original affiliate link. " +
      "Idempotent -- safe to call multiple times with the same network + network_event_id.",
    inputSchema: {
      type: "object",
      properties: {
        tracking_code: {
          type: "string",
          description:
            "The tracking code from the affiliate link (returned by generate_tracked_link).",
        },
        network: {
          type: "string",
          description:
            "The affiliate network that reported this event. One of: 'partnerstack', 'impact', 'direct'.",
          enum: ["partnerstack", "impact", "direct"],
        },
        network_event_id: {
          type: "string",
          description:
            "Unique commission event ID from the affiliate network. Used for idempotency.",
        },
        amount: {
          type: "number",
          description: "Commission amount in dollars (e.g. 29.99).",
          minimum: 0,
        },
        currency: {
          type: "string",
          description: "ISO 4217 currency code (default: 'USD').",
          default: "USD",
        },
        commission_type: {
          type: "string",
          description: "Type of commission. One of: 'initial', 'recurring'. Defaults to 'recurring'.",
          enum: ["initial", "recurring"],
        },
        period_start: {
          type: "string",
          description: "Billing period start date in ISO 8601 format (optional).",
        },
        period_end: {
          type: "string",
          description: "Billing period end date in ISO 8601 format (optional).",
        },
        metadata: {
          type: "object",
          description: "Optional extra data (e.g. order ID, plan name).",
          additionalProperties: true,
        },
      },
      required: ["tracking_code", "network", "network_event_id", "amount"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleListAffiliatePrograms(args) {
  const params = new URLSearchParams();
  if (args.limit)    params.set("limit", String(args.limit));
  if (args.cursor)   params.set("cursor", args.cursor);
  if (args.category) params.set("category", args.category);

  const qs = params.toString();
  return agentfuse("GET", `/api/catalog${qs ? "?" + qs : ""}`);
}

async function handleGetAffiliateProgram(args) {
  if (!args.slug) {
    throw new McpError(ErrorCode.InvalidParams, "slug is required");
  }
  return agentfuse("GET", `/api/catalog/${encodeURIComponent(args.slug)}`);
}

async function handleGenerateTrackedLink(args) {
  if (!args.program_slug) {
    throw new McpError(ErrorCode.InvalidParams, "program_slug is required");
  }
  if (!args.end_user_id) {
    throw new McpError(ErrorCode.InvalidParams, "end_user_id is required");
  }

  // Step 1: resolve slug -> UUID
  const catalogData = await agentfuse("GET", `/api/catalog/${encodeURIComponent(args.program_slug)}`);
  const program_id = catalogData?.data?.id;
  if (!program_id) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Program not found for slug "${args.program_slug}". Use list_affiliate_programs to check available slugs.`
    );
  }

  // Step 2: generate the tracked link
  const body = {
    program_id,
    end_user_id: args.end_user_id,
  };
  if (args.metadata) body.metadata = args.metadata;

  return agentfuse("POST", "/api/links/generate", body);
}

async function handleListTrackedLinks(args) {
  const params = new URLSearchParams();
  if (args.end_user_id) params.set("end_user_id", args.end_user_id);
  if (args.limit)       params.set("limit", String(args.limit));
  if (args.cursor)      params.set("cursor", args.cursor);

  // Optional: resolve program_slug -> program_id UUID for filtering
  if (args.program_slug) {
    const catalogData = await agentfuse("GET", `/api/catalog/${encodeURIComponent(args.program_slug)}`);
    const program_id = catalogData?.data?.id;
    if (!program_id) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Program not found for slug "${args.program_slug}". Use list_affiliate_programs to check available slugs.`
      );
    }
    params.set("program_id", program_id);
  }

  const qs = params.toString();
  return agentfuse("GET", `/api/links${qs ? "?" + qs : ""}`);
}

async function handleGetStats() {
  return agentfuse("GET", "/api/stats");
}

async function handleRecordSignup(args) {
  if (!args.tracking_code) {
    throw new McpError(ErrorCode.InvalidParams, "tracking_code is required");
  }
  if (!args.network) {
    throw new McpError(ErrorCode.InvalidParams, "network is required (partnerstack, impact, or direct)");
  }
  if (!args.network_event_id) {
    throw new McpError(ErrorCode.InvalidParams, "network_event_id is required");
  }

  const body = {
    tracking_code: args.tracking_code,
    network: args.network,
    network_event_id: args.network_event_id,
  };
  if (args.signup_email) body.signup_email = args.signup_email;
  if (args.metadata)     body.metadata     = args.metadata;

  return agentfuse("POST", "/api/webhooks/signup", body);
}

async function handleRecordCommission(args) {
  if (!args.tracking_code) {
    throw new McpError(ErrorCode.InvalidParams, "tracking_code is required");
  }
  if (!args.network) {
    throw new McpError(ErrorCode.InvalidParams, "network is required (partnerstack, impact, or direct)");
  }
  if (!args.network_event_id) {
    throw new McpError(ErrorCode.InvalidParams, "network_event_id is required");
  }
  if (args.amount === undefined) {
    throw new McpError(ErrorCode.InvalidParams, "amount is required");
  }

  const body = {
    tracking_code: args.tracking_code,
    network: args.network,
    network_event_id: args.network_event_id,
    amount: args.amount,
  };
  if (args.currency)        body.currency        = args.currency;
  if (args.commission_type) body.commission_type = args.commission_type;
  if (args.period_start)    body.period_start    = args.period_start;
  if (args.period_end)      body.period_end      = args.period_end;
  if (args.metadata)        body.metadata        = args.metadata;

  return agentfuse("POST", "/api/webhooks/commission", body);
}

// ---------------------------------------------------------------------------
// Dispatch map
// ---------------------------------------------------------------------------

export const HANDLERS = {
  list_affiliate_programs: handleListAffiliatePrograms,
  get_affiliate_program:   handleGetAffiliateProgram,
  generate_tracked_link:   handleGenerateTrackedLink,
  list_tracked_links:      handleListTrackedLinks,
  get_stats:               handleGetStats,
  record_signup:           handleRecordSignup,
  record_commission:       handleRecordCommission,
};

// ---------------------------------------------------------------------------
// Server setup + start (only when run directly)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

/* v8 ignore start */

if (isMain) {
  if (process.argv.includes("--test")) {
    console.log("AgentFuse MCP Server v1.1.0 -- tool list:\n");
    TOOLS.forEach((t) => console.log(`  [${t.name}] ${t.description.split(".")[0]}.`));
    console.log(`\nTotal: ${TOOLS.length} tools`);
    process.exit(0);
  }

  const server = new Server(
    { name: "agentfuse-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    const handler = HANDLERS[name];
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    try {
      const result = await handler(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      throw new McpError(
        ErrorCode.InternalError,
        `Tool "${name}" failed: ${err.message}`
      );
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
/* v8 ignore end */
