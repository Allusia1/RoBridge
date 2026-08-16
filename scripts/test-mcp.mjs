#!/usr/bin/env node
// Verifies the MCP stdio interface: lists tools and calls system_info.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, ROBRIDGE_PORT: "3799" },
});
const client = new Client({ name: "test", version: "0.0.1" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Tools exposed over MCP: ${tools.length}`);
console.log(tools.map((t) => t.name).join(", "));

const result = await client.callTool({ name: "system_info", arguments: {} });
console.log("\nsystem_info result:");
console.log(result.content[0].text);

await client.close();
process.exit(0);
