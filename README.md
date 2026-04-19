# agentfuse-mcp

MCP server for [AgentFuse](https://agentfuse.io) -- the affiliate API middleware for AI agents.

Lets any MCP-compatible AI agent (Claude Code, Cowork, custom agents) browse affiliate
programs, generate tracked links, and record conversions without writing HTTP code.

---

## Tools

| Tool | Description |
|---|---|
| `list_affiliate_programs` | Browse all programs in the catalog (filterable by category) |
| `get_affiliate_program` | Get full details for one program by slug |
| `generate_tracked_link` | Create an attribution-tagged short link for a user |
| `get_stats` | Dashboard summary: clicks, signups, commissions |
| `record_signup` | Log a conversion event when a user signs up |
| `list_tracked_links` | List all tracked links generated for your users |
| `record_commission` | Log a commission event (purchase or renewal) |

---

## Requirements

- Node.js >= 18
- An AgentFuse API key -- get one at [agentfuse.io](https://agentfuse.io)

---

## Usage

### Option 1 -- Claude Code (recommended)

Add to your project's `.claude/mcp.json` (or your global `~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "agentfuse": {
      "command": "npx",
      "args": ["-y", "agentfuse-mcp"],
      "env": {
        "AGENTFUSE_API_KEY": "af_live_your_key_here"
      }
    }
  }
}
```

Or, if you've cloned this repo locally:

```json
{
  "mcpServers": {
    "agentfuse": {
      "command": "node",
      "args": ["/path/to/agentfuse-mcp/src/index.js"],
      "env": {
        "AGENTFUSE_API_KEY": "af_live_your_key_here"
      }
    }
  }
}
```

### Option 2 -- Run directly

```bash
npm install
AGENTFUSE_API_KEY=af_live_... node src/index.js
```

### Option 3 -- Test the tool list (no API key needed)

```bash
node src/index.js --test
```

---

## Example agent interactions

**Browse programs:**
> "List all affiliate programs in the AI tools category"
> -> calls `list_affiliate_programs({ category: "ai-voice" })`

**Generate a link:**
> "Create a tracked Webflow affiliate link for user alice@example.com"
> -> calls `generate_tracked_link({ program_slug: "webflow", user_id: "alice@example.com" })`

**Check stats:**
> "How many clicks and signups have we had this month?"
> -> calls `get_stats()`

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENTFUSE_API_KEY` | Yes | -- | Your AgentFuse API key (`af_live_...`) |
| `AGENTFUSE_API_URL` | No | `https://api.agentfuse.io` | Override the API base URL |

---

## License

MIT (c) AgentFuse / GSK AIOrch LLC
