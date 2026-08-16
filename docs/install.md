# Install / first run

RoBridge is a local checkout. After clone, **`npm install`** is enough: postinstall builds the server and runs `init` (plugin copy + Cursor/Claude/VS Code Copilot MCP configs).

Server **0.1.7**, plugin **0.1.9**. Requires Node **18+**.

## One-liners

After clone:

```bash
npm install
```

Then reload MCP and open Studio. Postinstall runs `npm run build` and `node dist/index.js init` (same as `npx robridge init`): copies `plugin/RoBridge.lua` into Studio’s Plugins folder **and writes** Cursor / Claude / VS Code Copilot MCP configs (merge — other servers are kept). Copilot gets `.vscode/mcp.json` (`servers` key). It uses the absolute Node binary (`process.execPath`) so GUI apps can spawn the server. CI (`CI` / `GITHUB_ACTIONS`) skips postinstall so runners do not write homedir configs.

| Command | What it does |
| --- | --- |
| `npm install` | First run: install deps, build, init |
| `npx robridge init` (or `install`) | Re-run: plugin + write MCP configs |
| `npx robridge install-plugin` | Plugin only |
| `npx robridge mcp` | Write MCP configs only (same merge) + short summary |
| `npx robridge doctor` | Checklist (Node, dist, plugin, MCP, :3737, Studio) + one next step |
| `robridge` (no args) | MCP stdio server — **Cursor / Claude spawn this** |

If something looks wrong, run `npx robridge doctor` (or `node dist/index.js doctor`). It checks Node 18+, `dist/index.js`, the Studio plugin, Cursor MCP config, optional Claude Desktop, and whether `:3737` / Studio are up, then prints one **Next:** click. It does not start the server.

If `dist/index.js` is missing, `init` runs `npm run build` for you. If Node is older than 18, it exits with “Install Node 18+”.

Plugin destination: macOS `~/Documents/Roblox/Plugins/RoBridge.lua`; Windows `%LOCALAPPDATA%\Roblox\Plugins\RoBridge.lua`. Then **refresh Plugins in Studio** (or restart Studio).

## Steps

1. **Install** (builds + init via postinstall)

   ```bash
   npm install
   ```

   You should see a summary: plugin path, Cursor config path, Claude Desktop written or skipped, Claude Code added or skipped. Re-run later with `npx robridge init` (or `npm run init` after a build).

2. **Reload the MCP client**

   Cursor: Settings → MCP. Claude Desktop: fully quit and reopen. You do **not** start `node dist/index.js` in a terminal.

3. **Open Roblox Studio** (or refresh the Plugins folder). A **RoBridge** toolbar button appears under Plugins and auto-connects.

4. **Allow HTTP to `127.0.0.1`** when Studio prompts. The plugin long-polls `http://127.0.0.1:3737`.

   Official **Enable Studio as MCP server** (Assistant → **…** → **Manage MCP Servers**) is **optional** and is **not** RoBridge. Leave it off unless you want Roblox’s built-in MCP **beside** us. Do not replace the `RoBridge` MCP entry with `Roblox_Studio`. Details: [MCP setup](mcp.md#official-roblox-studio-mcp-optional-complement).

5. **Allow Mesh / Image APIs** if you want viewport screenshots or recordings: File → Game Settings → Security → Allow Mesh / Image APIs. Needed for `manage_camera.screenshot` / `record` (CaptureService + EditableImage).

6. **Allow HTTP Requests** in Game Settings → Security if you will playtest. Play-mode agents poll the same local server; `play_start` also tries to set `HttpService.HttpEnabled`.

7. **Unusual clients** (Cline, Windsurf) are not auto-written. VS Code Copilot is written to `.vscode/mcp.json` by init. Fallback JSON: [MCP setup](mcp.md).

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

This is not a hosted cloud service. Keep the place you actually want to edit open in Studio.
