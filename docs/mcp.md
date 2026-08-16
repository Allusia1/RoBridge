# MCP setup (Cursor)

RoBridge speaks MCP over stdio. Cursor (or any MCP client) spawns `node dist/index.js`. That process serves the dashboard and talks to the Studio plugin.

## Cursor config

Edit `~/.cursor/mcp.json` (macOS / Linux) or the equivalent MCP config in Cursor Settings. Use an **absolute path** to this repo’s built server:

```json
{
  "mcpServers": {
    "RoBridge": {
      "command": "node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}
```

After `npm run build`, reload the RoBridge MCP server in Cursor (Settings → MCP → RoBridge → restart) so `tools/list` picks up new schemas.

## What Cursor should see

- Server name `RoBridge`
- The full tool list (24 tools — see [Tools](tools.md))
- No Pro / tier fields; everything is available

## Other MCP clients

Any client that can run a stdio MCP server works. Point `command` at `node` and `args` at `dist/index.js`. Claude Desktop, Claude Code, Codex, and similar apps use the same pattern with their own config files.

## Catalog without Studio

```bash
node dist/index.js --dump-catalog
```

Prints JSON of every registered tool (names, actions, param keys). Live HTTP copy while the dashboard is up: [http://127.0.0.1:3737/api/tools](http://127.0.0.1:3737/api/tools). Schema drift check: `npm run test:schema`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROBRIDGE_PORT` | `3737` | Dashboard + plugin bridge port |

The plugin reads `RoBridgeHost` / `RoBridgePort` plugin settings if you need a non-default port. Keep host at `127.0.0.1`.
