#!/usr/bin/env node
/**
 * Adds the agentfuse MCP server entry to ~/.claude.json
 * Run once: node add-to-claude.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const configPath = join(homedir(), ".claude.json");

let config = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("Could not parse ~/.claude.json:", e.message);
    process.exit(1);
  }
}

if (!config.mcpServers) config.mcpServers = {};

if (config.mcpServers.agentfuse) {
  console.log("agentfuse MCP server already configured in ~/.claude.json -- updating.");
}

config.mcpServers.agentfuse = {
  command: "node",
  args: [
    join(homedir(), "Claude Workspace/AgentStack/agentfuse-mcp/src/index.js")
  ],
  env: {
    AGENTFUSE_API_KEY: "af_live_3f0bda3678737cd86a3b8b0a1c84b3519b06c2502716463b45b3b788dfb2c321"
  }
};

writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
console.log("Done. agentfuse MCP server added to ~/.claude.json");
console.log("Entry written:");
console.log(JSON.stringify({ agentfuse: config.mcpServers.agentfuse }, null, 2));
console.log("\nRestart Claude Code / Cowork for the change to take effect.");
