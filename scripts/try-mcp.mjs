#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFile } from "node:fs/promises";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, ROBRIDGE_PORT: "3737" },
});
const client = new Client({ name: "try-mcp", version: "0.0.1" });
await client.connect(transport);

const info = await client.callTool({ name: "system_info", arguments: {} });
console.log("system_info:\n", info.content[0].text);

const ws = await client.callTool({ name: "workspace_state", arguments: { action: "summary" } });
console.log("\nworkspace_state:\n", ws.content[0].text.slice(0, 500));

const probe = await client.callTool({
  name: "query_instances",
  arguments: { action: "get", path: "game.Workspace.RoBridgeProbe" },
});
console.log("\nRoBridgeProbe:\n", probe.content[0].text);

const shot = await client.callTool({
  name: "manage_camera",
  arguments: { action: "screenshot", path: "game.Workspace.RoBridgeProbe", distance: 18 },
});
for (const part of shot.content) {
  if (part.type === "text") console.log("\nscreenshot meta:\n", part.text);
  if (part.type === "image") {
    const file = "sync/studio-screenshot.png";
    await writeFile(file, Buffer.from(part.data, "base64"));
    console.log(`\nwrote ${file} (${part.data.length} b64 chars, ${part.mimeType})`);
  }
}

await client.close();
process.exit(0);
