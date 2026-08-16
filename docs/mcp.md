# MCP setup

RoBridge is a **local stdio** MCP server. After clone, **`npm install`** is enough — **do not paste JSON by hand** unless your client is not Cursor, Claude Desktop, Claude Code, or VS Code Copilot.

```bash
npm install
```

Postinstall builds and runs `init` (re-run with `npx robridge init`). That uses the local `bin.robridge` (`dist/index.js`) to:

- Copy the Studio plugin
- Merge `RoBridge` into `~/.cursor/mcp.json` and the repo’s `.cursor/mcp.json`
- Merge `RoBridge` into the repo’s `.vscode/mcp.json` for VS Code Copilot (`servers`, not `mcpServers`)
- Merge `RoBridge` into Claude Desktop’s config if the app is installed
- Run `claude mcp add --scope user` when the `claude` CLI is on `PATH` (otherwise skip)

Spawn is the **absolute Node binary** (`process.execPath`) plus the absolute path to `dist/index.js`. Empty argv starts MCP. GUI apps (Cursor from the Dock, Claude Desktop) often have no `node` on `PATH`; bare `node` fails there.

Configs only (no plugin): `npx robridge mcp`. Same merge; other MCP servers are kept. If the RoBridge key already exists, only that entry is updated (paths after rebuild).

Never add `install-plugin`, `init`, `mcp`, `doctor`, `--help`, `--dump-catalog`, or `--no-mcp` to a client spawn. Catalog dump writes JSON to stdout (which would break JSON-RPC); `--no-mcp` skips stdio entirely.

## First run (before any client)

```bash
npm install
```

Then **reload MCP in Cursor** (Settings → MCP), **open Studio** (or refresh Plugins), **Allow HTTP** to `127.0.0.1`, and (for screenshots) **Allow Mesh / Image APIs**. Fully quit Claude Desktop if you use it. Clients spawn the server; do not start it in a terminal. Re-run setup with `npx robridge init`.

## What init writes

| Client | File | Notes |
| --- | --- | --- |
| Cursor (user) | `~/.cursor/mcp.json` (Windows `%USERPROFILE%\.cursor\mcp.json`) | Always merge |
| Cursor (project) | `<repo>/.cursor/mcp.json` | Created if needed |
| VS Code Copilot (workspace) | `<repo>/.vscode/mcp.json` | Always merge `servers.RoBridge` (`type: stdio`). Gitignored (absolute paths). User-level: **MCP: Open User Configuration** (`~/Library/Application Support/Code/User/mcp.json`; Windows `%APPDATA%\Code\User\mcp.json`) |
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

Same spawn (absolute Node + absolute `dist/index.js`). `init` writes workspace `.vscode/mcp.json` for Copilot (merge `servers.RoBridge`). Cline and Windsurf are not auto-written.

| Client | Config | Top-level key |
| --- | --- | --- |
| VS Code Copilot | `.vscode/mcp.json` (workspace; written by init) or **MCP: Open User Configuration** | `servers` (not `mcpServers`) |
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

## Official Roblox Studio MCP (optional complement)

Roblox ships a **separate** MCP server **inside Studio**. It is not RoBridge. You do not need it for this repo.

Official docs: [Connect to the Roblox Studio MCP server](https://create.roblox.com/docs/studio/mcp).

| | Official Studio MCP | RoBridge |
| --- | --- | --- |
| What it is | Built into Studio (`StudioMCP` / `mcp.bat`) | This repo: Node `dist/index.js` + plugin |
| Transport | Client stdio → Studio binary | Client stdio → Node; plugin long-polls `http://127.0.0.1:3737` |
| HTTP port | None (not a localhost HTTP server) | `3737` (dashboard + plugin). No clash with official MCP |
| Enable in Studio | Assistant → **…** → **Manage MCP Servers** → **Enable Studio as MCP server** | Install the RoBridge plugin; **Allow HTTP** to `127.0.0.1` |
| Client key | `Roblox_Studio` | `RoBridge` |
| Clients they document | Quick connect: Cursor, VS Code, Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Antigravity | Cursor, Claude Desktop, Claude Code, VS Code Copilot (init-written) |

You **can run both**. `npx robridge init` **merges** `RoBridge` and leaves `Roblox_Studio` alone. Official MCP does not steal `:3737` and does not replace the plugin.

You do **not** need to turn **Enable Studio as MCP server** on for RoBridge. Turn it on only if you want Roblox’s own tools (`script_read`, `generate_mesh`, `list_roblox_studios`, …) next to ours.

Do **not** use Studio **Quick connect** in a way that deletes the `RoBridge` entry. If `RoBridge` starts pointing at `StudioMCP` or `mcp.bat`, re-run `npx robridge init`. `npx robridge doctor` warns when both are configured, and when RoBridge was overwritten.

Official security note: MCP clients can read and modify open places — only connect clients you trust. Official `http_get` is limited to Roblox documentation URLs. RoBridge still needs the Studio plugin HTTP prompt (and Game Settings **Allow HTTP Requests** for play-mode agents).
