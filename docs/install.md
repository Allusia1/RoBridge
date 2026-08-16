# Install / first run

RoBridge is a local checkout. One command after clone configures the Studio plugin and MCP clients.

Server **0.1.6**, plugin **0.1.8**. Requires Node **18+**.

## One-liners

After clone:

```bash
npm install && npm run build && npx robridge init
```

That copies `plugin/RoBridge.lua` into Studio’s Plugins folder **and writes** Cursor / Claude MCP configs (merge — other servers are kept). It uses the absolute Node binary (`process.execPath`) so GUI apps can spawn the server.

| Command | What it does |
| --- | --- |
| `npx robridge init` (or `install`) | Dummy-proof: plugin + write MCP configs |
| `npx robridge install-plugin` | Plugin only |
| `npx robridge mcp` | Write MCP configs only (same merge) + short summary |
| `robridge` (no args) | MCP stdio server — **Cursor / Claude spawn this** |

If `dist/index.js` is missing, `init` runs `npm run build` for you. If Node is older than 18, it exits with “Install Node 18+”.

Plugin destination: macOS `~/Documents/Roblox/Plugins/RoBridge.lua`; Windows `%LOCALAPPDATA%\Roblox\Plugins\RoBridge.lua`. Then **refresh Plugins in Studio** (or restart Studio).

## Steps

1. **Install, build, and init**

   ```bash
   npm install && npm run build && npx robridge init
   ```

   Same as `npm run init` after a build. You should see a summary: plugin path, Cursor config path, Claude Desktop written or skipped, Claude Code added or skipped.

2. **Reload the MCP client**

   Cursor: Settings → MCP. Claude Desktop: fully quit and reopen. You do **not** start `node dist/index.js` in a terminal.

3. **Open Roblox Studio** (or refresh the Plugins folder). A **RoBridge** toolbar button appears under Plugins and auto-connects.

4. **Allow HTTP to `127.0.0.1`** when Studio prompts. The plugin long-polls `http://127.0.0.1:3737`.

5. **Allow Mesh / Image APIs** if you want viewport screenshots or recordings: File → Game Settings → Security → Allow Mesh / Image APIs. Needed for `manage_camera.screenshot` / `record` (CaptureService + EditableImage).

6. **Allow HTTP Requests** in Game Settings → Security if you will playtest. Play-mode agents poll the same local server; `play_start` also tries to set `HttpService.HttpEnabled`.

7. **Unusual clients** (VS Code Copilot, Cline, Windsurf) are not auto-written. Fallback JSON: [MCP setup](mcp.md).

8. **Open the dashboard** at [http://127.0.0.1:3737](http://127.0.0.1:3737). Studio connected + place name means you are done.

## Dashboard-only (no agent)

```bash
node dist/index.js --no-mcp
```

HTTP dashboard and plugin bridge without stdio MCP. Useful to confirm the plugin before wiring a client. Do not add `--no-mcp` to an MCP client spawn.

## One process owns the port

The first RoBridge process binds `127.0.0.1:3737`. A second spawn on the same port does not start another dashboard — it **forwards** MCP tool calls to the instance that already holds the port. Cursor and Claude can run at once against the same Studio session. Quit the owner if you need a clean restart.

## Verify

- Plugin toolbar button is visible; dashboard shows the place name.
- From an agent: create a blue Part in Workspace. If it appears in Studio, the loop works.
- Optional: `system_info` action `preflight` (HttpService, loadstring, Mesh/Image APIs).

This is not a crate game and not a hosted cloud service. Keep the place you actually want to edit open in Studio.
