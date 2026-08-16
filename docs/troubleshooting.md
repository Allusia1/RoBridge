# Troubleshooting

Tool errors append a `Fix:` line when RoBridge recognizes the failure. `system_info` action `preflight` is the read-only checklist (mode, HttpService, loadstring, Mesh/Image APIs).

## No Studio session

Symptom: `No Roblox Studio session connected` or `Studio plugin not connected`.

1. Open the place in Roblox Studio with the RoBridge plugin installed (`npx robridge install-plugin`).
2. Click **Allow** if Studio asks to talk to `127.0.0.1`.
3. Confirm the dashboard at :3737 shows the place name.
4. Fully quit Studio and relaunch if the toolbar button is missing.

## loadstring / execute_luau in Play

`execute_luau` is Edit-only (plugin `loadstring`). In Play use `manage_studio.run_test` or play agents, or `play_stop` first. The plugin itself does not run inside the Play DataModel.

## Stuck Play

Press **Stop** in Studio (or `manage_studio.play_stop`), then retry. `run_test` already stops leftover Play before starting. If Play started but the play agent never polls: Game Settings → Security → Allow HTTP Requests.

## CaptureService / screenshots

`manage_camera.screenshot` and `record` need File → Game Settings → Security → **Allow Mesh / Image APIs**. CaptureService allows only one in-flight shot and typically lands around 1.5–2 fps; that cap is expected. `record_stop` aborts an in-flight recording. Screenshot works in Edit even if Studio is in the background.

## HTTP / play agent

Game Settings → Security → Allow HTTP Requests. Needed for play-mode agents to poll localhost.

## Port 3737 already in use

One process owns the dashboard. A second MCP spawn forwards tools to that owner. Stop the first Node/MCP process if the dashboard looks stale.

## MCP client does not see new tools

Rebuild (`npm run build`) and restart the RoBridge MCP server in the client so `tools/list` refreshes. Cursor: Settings → MCP → restart. Claude Desktop: fully quit and reopen. Claude Code: `/mcp` or restart the session.

## Claude Desktop / Claude Code fails to connect

Stdout must be JSON-RPC only. RoBridge logs to stderr; do not add `--dump-catalog` or `--no-mcp` to the client spawn. `npx robridge init` writes the absolute Node binary (`process.execPath`) so GUI apps do not need `node` on `PATH`. Re-run `npx robridge mcp` after a rebuild. Claude Desktop logs: macOS `~/Library/Logs/Claude/mcp-server-RoBridge.log`.

## Official Roblox Studio MCP vs RoBridge

Studio **Assistant → … → Manage MCP Servers → Enable Studio as MCP server** is Roblox’s **built-in** MCP (`Roblox_Studio` / `StudioMCP`). It does **not** use port 3737 and is **not** required for RoBridge.

If Cursor/Claude tools look like `script_read` / `search_game_tree` instead of `query_instances` / `manage_scripts`, the client is talking to official MCP. Keep `mcpServers.RoBridge` pointing at Node + `dist/index.js`. Re-run `npx robridge init`. Both servers can be listed at once; init merge will not delete `Roblox_Studio`.

## Two clients, one Studio

Expected. The first process owns `:3737`; the second forwards to it. Both share the plugin session. Stop the owner if the dashboard looks stale.

## Common messages

| Error | Fix |
| --- | --- |
| No Roblox Studio session | Open Studio with the plugin; Allow HTTP to 127.0.0.1. |
| Studio did not respond / timeout | If Play is running, press Stop. execute_luau is Edit-only. |
| CreateEditableImage failed / CaptureService | Allow Mesh / Image APIs. |
| HttpEnabled / HTTP requests are not enabled | Allow HTTP Requests in Game Settings. |
| loadstring blocked | Stay in Edit, or use run_test during Play. |
| InsertService / LoadAsset failed | Asset must be free or owned by you. Search first; do not invent ids. |
| Failed to set `Something.nil` | Use `set_many` with a `properties` map, or `set` with `property` + `value`. |
