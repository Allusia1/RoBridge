#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bridge } from "./bridge.js";
import { History } from "./history.js";
import { createHttpApp } from "./server.js";
import { catalogPayload, type ToolContext } from "./tools/helpers.js";
import { registerCoreTools } from "./tools/core.js";
import { registerSceneTools } from "./tools/scene.js";
import { registerMediaTools } from "./tools/media.js";
import { registerUiTools } from "./tools/ui.js";
import { registerStudioTools } from "./tools/studio.js";
import { registerExecuteTools } from "./tools/execute.js";
import { dispatchCli, isCliCommand } from "./cli.js";

const VERSION = "0.1.6";
const PORT = Number(process.env.ROBRIDGE_PORT ?? 3737);
const ARGV = process.argv.slice(2);

/** Tell the :3737 owner that a forwarded stdio MCP client is alive (Cursor, Claude, …). */
function startOwnerHeartbeat(port: number) {
  const beat = async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/mcp/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-robridge-proxy": "1" },
        body: JSON.stringify({ pid: process.pid }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      /* owner down or restarting */
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), 10_000);
  timer.unref();
}

async function main() {
  // Subcommands print to stdout and exit. Empty / unknown argv starts MCP (client spawn).
  if (isCliCommand(ARGV)) {
    process.exit(await dispatchCli(ARGV));
  }

  const NO_MCP = ARGV.includes("--no-mcp"); // HTTP dashboard/bridge only — never put this in an MCP client spawn
  const DUMP_CATALOG = ARGV.includes("--dump-catalog"); // CLI JSON dump — never put this in an MCP client spawn

  // MCP stdio clients (Claude Desktop, Claude Code, Cursor, …) require stdout = JSON-RPC only.
  // Any console.log banner or catalog dump on the MCP path breaks the handshake.
  const log = (...args: unknown[]) => console.error("[RoBridge]", ...args);
  console.log = log;
  console.info = log;
  console.debug = log;

  const bridge = new Bridge();
  const history = new History();
  const server = new McpServer({ name: "RoBridge", version: VERSION });

  const ctx: ToolContext = {
    server,
    bridge,
    history,
    registry: new Map(),
    actions: new Map(),
    catalog: new Map(),
    config: {
      port: PORT,
      version: VERSION,
      startedAt: Date.now(),
      httpBound: false,
      mcp: {
        transport: NO_MCP ? "none" : "stdio",
        stdioConnected: false,
        lastClientAt: null,
        lastClientSource: null,
        proxyCalls: 0,
        lastHeartbeatAt: null,
      },
    },
  };

  registerCoreTools(ctx);
  registerSceneTools(ctx);
  registerMediaTools(ctx);
  registerUiTools(ctx);
  registerStudioTools(ctx);
  registerExecuteTools(ctx);

  if (DUMP_CATALOG) {
    process.stdout.write(JSON.stringify(catalogPayload(ctx), null, 2) + "\n");
    process.exit(0);
  }

  const app = createHttpApp(ctx, bridge, history);
  await new Promise<void>((resolve) => {
    const httpServer = app.listen(PORT, "127.0.0.1", () => {
      ctx.config.httpBound = true;
      log(`Dashboard + Studio bridge listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log(`Port ${PORT} is already in use — forwarding MCP tools to that instance.`);
        resolve();
      } else {
        log("HTTP server error:", err.message);
        resolve();
      }
    });
  });

  if (!NO_MCP) {
    await server.connect(new StdioServerTransport());
    ctx.config.mcp.stdioConnected = true;
    ctx.config.mcp.lastClientAt = Date.now();
    ctx.config.mcp.lastClientSource = "stdio";
    // Do not send tools/list_changed here — that notification before initialize
    // breaks Claude Desktop / Claude Code. tools/list after handshake is enough.
    log(`MCP server connected via stdio (${ctx.registry.size} tools)`);
    if (!ctx.config.httpBound) {
      startOwnerHeartbeat(PORT);
    }
  } else {
    log("Running in HTTP-only mode (--no-mcp)");
  }
}

main().catch((err) => {
  console.error("[RoBridge] Fatal:", err);
  process.exit(1);
});
