# MCP setup

RoBridge is a **local stdio** MCP server. The client spawns `node dist/index.js` (Node **18+**). That process serves the dashboard at `http://127.0.0.1:3737` and talks to the Studio plugin.

This repo is **not** on the public npm registry. Do not use `npx robridge`. After `npm run build`, point every client at the **absolute path** to `dist/index.js`. `package.json` `bin.robridge` is that same file if you `npm link` locally.

Never add `--dump-catalog` or `--no-mcp` to a client spawn. Those flags are CLI-only: catalog dump writes JSON to stdout (which would break JSON-RPC), and `--no-mcp` skips stdio entirely.

## First run (before any client)

```bash
npm install
npm run build
npm run install-plugin
```

Restart Roblox Studio, **Allow HTTP** to `127.0.0.1`, and (for screenshots) **Allow Mesh / Image APIs**. Then register the server in your client and reload it.

## Spawn shape (all stdio clients)

```json
{
  "command": "node",
  "args": ["/absolute/path/to/RoBridge/dist/index.js"],
  "env": {
    "ROBRIDGE_PORT": "3737"
  }
}
```

- Replace the path with your checkout. Windows JSON needs escaped backslashes (`C:\\Users\\you\\RoBridge\\dist\\index.js`).
- `env.ROBRIDGE_PORT` is optional (default `3737`).
- GUI apps (Claude Desktop especially) often do not inherit your shell `PATH`. If `node` is not found, use the full binary: macOS `which node` (often `/usr/local/bin/node` or nvm’s path); Windows `where.exe node` (often `C:\\Program Files\\nodejs\\node.exe`).

## Cursor

**macOS / Linux:** `~/.cursor/mcp.json`  
**Windows:** `%USERPROFILE%\.cursor\mcp.json`  
Project override: `.cursor/mcp.json` in the workspace.

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

Reload: Settings → MCP → RoBridge → restart (after every `npm run build`).

## Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Open it from Claude → Settings → Developer → Edit Config.

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

Fully quit Claude Desktop (macOS: Cmd+Q, not just close the window) and reopen. Logs: macOS `~/Library/Logs/Claude/mcp-server-RoBridge.log`; Windows `%APPDATA%\Claude\logs`.

## Claude Code

Official CLI (stdio is the default transport). User scope = every project; omit `--scope user` for this project only (`~/.claude.json`). `--scope project` writes `.mcp.json` in the repo — only useful if every clone uses the same absolute path.

```bash
claude mcp add --scope user RoBridge -- node /absolute/path/to/RoBridge/dist/index.js
```

Optional port:

```bash
claude mcp add --scope user --env ROBRIDGE_PORT=3737 RoBridge -- node /absolute/path/to/RoBridge/dist/index.js
```

Check: `claude mcp list`. Inside a session: `/mcp`.

Equivalent JSON (`.mcp.json` project file, or `mcpServers` in `~/.claude.json` for user scope). On Windows, `~/.claude.json` is `%USERPROFILE%\.claude.json`.

```json
{
  "mcpServers": {
    "RoBridge": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}
```

## Generic stdio client

Any client that spawns a process and speaks MCP on stdin/stdout:

| Field | Value |
| --- | --- |
| `command` | `node` (or absolute `node.exe` / node binary) |
| `args` | `[absolutePathToDistIndexJs]` — no extra flags |
| `env.ROBRIDGE_PORT` | optional, default `3737` |

## VS Code Copilot / Cline / Windsurf

Same spawn (`node` + absolute `dist/index.js`). Only the file and top-level key differ:

| Client | Config | Top-level key |
| --- | --- | --- |
| VS Code Copilot | `.vscode/mcp.json` (workspace) or **MCP: Open User Configuration** | `servers` (not `mcpServers`) |
| Cline | `cline_mcp_settings.json` (Cline → MCP Servers → Configure) | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |

VS Code example:

```json
{
  "servers": {
    "RoBridge": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}
```

## Two clients, one Studio session

The first RoBridge process binds `127.0.0.1:3737` (dashboard + plugin). A second spawn (Cursor **and** Claude, two windows, etc.) sees `EADDRINUSE` and **forwards** MCP tool calls to that owner over HTTP. Both clients share the same Studio plugin session, history, and dashboard.

Do not put `--no-mcp` on a client spawn if you still want tools. Dashboard-only (no agent): run `node dist/index.js --no-mcp` yourself.

To restart cleanly, stop the **owner** process (the client that bound the port) and start once.

## What the client should see

- Server name `RoBridge`
- 24 tools — see [Tools](tools.md)
- No Pro / tier fields

## Catalog without Studio

```bash
node dist/index.js --dump-catalog
```

Prints JSON of every registered tool to stdout (not used as an MCP spawn). Live HTTP copy while the dashboard is up: [http://127.0.0.1:3737/api/tools](http://127.0.0.1:3737/api/tools). Schema drift check: `npm run test:schema`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROBRIDGE_PORT` | `3737` | Dashboard + plugin bridge port |

The plugin reads `RoBridgeHost` / `RoBridgePort` plugin settings if you need a non-default port. Keep host at `127.0.0.1`.
