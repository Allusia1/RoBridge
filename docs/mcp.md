# MCP setup

RoBridge is a **local stdio** MCP server. After clone, **do not paste JSON by hand** unless your client is not Cursor, Claude Desktop, or Claude Code.

```bash
npm install && npm run build && npx robridge init
```

That uses the local `bin.robridge` (`dist/index.js`) to:

- Copy the Studio plugin
- Merge `RoBridge` into `~/.cursor/mcp.json` and the repo’s `.cursor/mcp.json`
- Merge `RoBridge` into Claude Desktop’s config if the app is installed
- Run `claude mcp add --scope user` when the `claude` CLI is on `PATH` (otherwise skip)

Spawn is the **absolute Node binary** (`process.execPath`) plus the absolute path to `dist/index.js`. Empty argv starts MCP. GUI apps (Cursor from the Dock, Claude Desktop) often have no `node` on `PATH`; bare `node` fails there.

Configs only (no plugin): `npx robridge mcp`. Same merge; other MCP servers are kept. If the RoBridge key already exists, only that entry is updated (paths after rebuild).

Never add `install-plugin`, `init`, `mcp`, `--help`, `--dump-catalog`, or `--no-mcp` to a client spawn. Catalog dump writes JSON to stdout (which would break JSON-RPC); `--no-mcp` skips stdio entirely.

## First run (before any client)

```bash
npm install && npm run build && npx robridge init
```

Refresh Plugins in Studio (or restart Studio), **Allow HTTP** to `127.0.0.1`, and (for screenshots) **Allow Mesh / Image APIs**. Then **reload MCP in Cursor** (Settings → MCP). Fully quit Claude Desktop if you use it. Clients spawn the server; do not start it in a terminal.

## What init writes

| Client | File | Notes |
| --- | --- | --- |
| Cursor (user) | `~/.cursor/mcp.json` (Windows `%USERPROFILE%\.cursor\mcp.json`) | Always merge |
| Cursor (project) | `<repo>/.cursor/mcp.json` | Created if needed |
| Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows `%APPDATA%\Claude\claude_desktop_config.json` | Written if the app config dir exists; otherwise skipped |
| Claude Code | `claude mcp add --scope user RoBridge -- <execPath> <dist/index.js>` | If that fails, merge `~/.claude.json` `mcpServers` with `{ type: "stdio", command, args }`. If `claude` is not on `PATH`: skipped |

Malformed files are copied to `*.bak` once, then replaced with a valid object that still contains the RoBridge entry.

## Spawn shape (all stdio clients)

`init` writes this (with real absolute paths):

```json
{
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/RoBridge/dist/index.js"]
}
```

- Windows JSON needs escaped backslashes (`C:\\Program Files\\nodejs\\node.exe`).
- `env.ROBRIDGE_PORT` is optional (default `3737`).
- Prefer the full Node binary, not the word `node`.

## Cursor

**macOS / Linux:** `~/.cursor/mcp.json`  
**Windows:** `%USERPROFILE%\.cursor\mcp.json`  
Project override: `.cursor/mcp.json` in the workspace.

`npx robridge init` writes both. Reload: Settings → MCP → RoBridge → restart (after every `npm run build`; run `npx robridge mcp` so paths stay current).

Fallback if you must paste:

```json
{
  "mcpServers": {
    "RoBridge": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}
```

## Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

`init` merges `mcpServers.RoBridge` when that folder exists. Fully quit Claude Desktop (macOS: Cmd+Q, not just close the window) and reopen. Logs: macOS `~/Library/Logs/Claude/mcp-server-RoBridge.log`; Windows `%APPDATA%\Claude\logs`.

Fallback JSON is the same Cursor object above.

## Claude Code

Official CLI (stdio is the default transport). User scope = every project.

```bash
claude mcp add --scope user RoBridge -- /absolute/path/to/node /absolute/path/to/RoBridge/dist/index.js
```

`npx robridge init` runs that for you. If it fails, it merges `mcpServers` in `~/.claude.json` (`%USERPROFILE%\.claude.json` on Windows). If Claude Code is not installed, init prints “Claude Code not found, skipped.” and continues.

Check: `claude mcp list`. Inside a session: `/mcp`.

Fallback JSON:

```json
{
  "mcpServers": {
    "RoBridge": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}
```

## Generic stdio client

Any client that spawns a process and speaks MCP on stdin/stdout:

| Field | Value |
| --- | --- |
| `command` | Absolute Node binary (`process.execPath`) |
| `args` | `[absolutePathToDistIndexJs]` — no extra flags |
| `env.ROBRIDGE_PORT` | optional, default `3737` |

## VS Code Copilot / Cline / Windsurf

Same spawn (absolute Node + absolute `dist/index.js`). Init does **not** write these files. Only the file and top-level key differ:

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
      "command": "/absolute/path/to/node",
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
