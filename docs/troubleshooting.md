# Troubleshooting

Tool errors append a `Fix:` line when RoBridge recognizes the failure. `system_info` action `preflight` is the read-only checklist (mode, HttpService, loadstring, Mesh/Image APIs).

## No Studio session

Symptom: `No Roblox Studio session connected` or `Studio plugin not connected`.

1. Open the place in Roblox Studio with the RoBridge plugin installed (`npm run install-plugin`).
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

Rebuild (`npm run build`) and restart the RoBridge MCP server in Cursor so `tools/list` refreshes.

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
