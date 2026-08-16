# Changelog

Versions follow the MCP server in `package.json` / `src/index.ts`. The Studio plugin version lives in `plugin/RoBridge.lua` (`VERSION`) and can move independently.

## [Unreleased]

### Fixed

- Studio plugin **0.1.9** no longer warns `Lost connection` on expected long-poll idle timeouts (HttpService was racing the 20s park). Idle polls stay quiet; only real HTTP errors log a drop.
- Dashboard topology marks Cursor **Active** when a forwarded stdio MCP heartbeats to the `:3737` owner or when proxied tool calls are recent — not only when this Node process is the stdio MCP. Idle copy distinguishes **Cursor config missing** vs **No MCP client calling tools**.

### Added

- Dummy-proof `npx robridge init` / `install`: Node 18+ check, build if `dist/index.js` is missing, copy the Studio plugin, and **write** Cursor + Claude MCP configs (merge, never wipe other servers). Uses `process.execPath` so GUI apps can spawn Node.
- `npx robridge mcp` writes the same configs (no plugin). `install-plugin` remains plugin-only. Empty argv still starts the stdio MCP server.
- `npm install` postinstall builds the server and runs `init`. Skips when `CI` or `GITHUB_ACTIONS` is set (so CI does not write `~/.cursor/mcp.json`). Re-run with `npx robridge init`.
- `npx robridge doctor` (also `node dist/index.js doctor`) prints an OK/FAIL/SKIP checklist (Node, dist, plugin, MCP configs, :3737, Studio) and exactly one **Next:** action. Does not start the server.
- Docs + doctor note for Roblox’s **built-in** Studio MCP (`Roblox_Studio` / `StudioMCP`): optional complement, no `:3737` clash; warn if Quick connect overwrote the RoBridge spawn.

## [0.1.6] — 2026-08-16

First GitHub release. Server **0.1.6**, plugin **0.1.8**.

### Added

- Local MCP server (stdio) with **24 tools** for DataModel, scripts, terrain, lighting, UI, assets, playtests, camera capture, and `execute_luau`
- Studio plugin that long-polls `http://127.0.0.1:3737` at plugin security
- Dashboard at [http://127.0.0.1:3737](http://127.0.0.1:3737) (Overview, Activity, UI Studio, Console, Logs)
- `manage_studio.run_test` — stop leftover Play, inject Luau, collect `[ROBRIDGE_TEST]` logs, stop, write a report
- Port-owner forwarding: the first process binds `:3737`; extra MCP clients forward to that owner
- `system_info.preflight` checklist (edit mode, HttpService, loadstring, Mesh/Image APIs)
- GitHub-native docs in [`docs/`](docs/README.md) (install, MCP, playtesting, dashboard, tools catalog, troubleshooting, limits)
- MCP client configs for Cursor, Claude Desktop, Claude Code, and generic stdio clients ([`docs/mcp.md`](docs/mcp.md))
- Schema parity (`npm run test:schema`) and error-hint (`npm run test:hints`) tests that do not need Studio

### Fixed

- Stdio protocol hygiene for Claude-class clients: logs stay on stderr; no `tools/list_changed` before initialize (that notification broke Claude Desktop / Claude Code)

### Notes

- Clone, `npm install` (postinstall builds + init). MCP clients spawn `node` with an absolute path to `dist/index.js`.
- Open Cloud asset upload is not included. `upload_asset` is Studio `AssetService:CreateAssetAsync` (`confirm=true`).
