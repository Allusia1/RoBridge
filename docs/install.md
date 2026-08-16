# Install / first run

RoBridge is a local checkout: build the Node server, copy the plugin into Studio’s plugins folder, then point your MCP client at `dist/index.js`.

Server **0.1.6**, plugin **0.1.8**.

## Steps

1. **Install dependencies and build**

   ```bash
   npm install
   npm run build
   ```

2. **Install the Studio plugin**

   ```bash
   npm run install-plugin
   ```

   Copies `plugin/RoBridge.lua` into the local Roblox plugins folder (macOS: `~/Documents/Roblox/Plugins`; Windows: `%LOCALAPPDATA%\Roblox\Plugins`).

3. **Restart Roblox Studio** (or refresh the Plugins folder). A **RoBridge** toolbar button appears under Plugins and auto-connects.

4. **Allow HTTP to `127.0.0.1`** when Studio prompts. The plugin long-polls `http://127.0.0.1:3737`.

5. **Allow Mesh / Image APIs** if you want viewport screenshots or recordings: File → Game Settings → Security → Allow Mesh / Image APIs. Needed for `manage_camera.screenshot` / `record` (CaptureService + EditableImage).

6. **Allow HTTP Requests** in Game Settings → Security if you will playtest. Play-mode agents poll the same local server; `play_start` also tries to set `HttpService.HttpEnabled`.

7. **Register MCP** in `~/.cursor/mcp.json` — see [MCP setup](mcp.md). Reload the RoBridge MCP server in Cursor after each rebuild.

8. **Open the dashboard** at [http://127.0.0.1:3737](http://127.0.0.1:3737). Studio connected + place name means you are done.

## Dashboard-only (no agent)

```bash
node dist/index.js --no-mcp
```

HTTP dashboard and plugin bridge without stdio MCP. Useful to confirm the plugin before wiring Cursor.

## One process owns the port

The first RoBridge process binds `127.0.0.1:3737`. A second `node dist/index.js` on the same port does not start another dashboard — it **forwards** MCP tool calls to the instance that already holds the port. Quit the owner if you need a clean restart.

## Verify

- Plugin toolbar button is visible; dashboard shows the place name.
- From an agent: create a blue Part in Workspace. If it appears in Studio, the loop works.
- Optional: `system_info` action `preflight` (HttpService, loadstring, Mesh/Image APIs).

This is not a crate game and not a hosted cloud service. Keep the place you actually want to edit open in Studio.
