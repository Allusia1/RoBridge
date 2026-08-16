# Dashboard

The MCP server serves a local dashboard at [http://127.0.0.1:3737](http://127.0.0.1:3737). It binds `127.0.0.1` only — not reachable from other machines.

## What you see

- **Overview** — live topology (MCP ↔ server ↔ plugin session(s) ↔ place), every Studio session, tool registry by genre, uptime, port, versions.
- **Activity** — tool execution history (time, tool, action, duration, OK / failed / no Studio) and per-tool stats.
- **UI Studio** — inspect and iterate on GUI trees the agent built.
- **Console** — run Luau against the connected place (plugin security).
- **Logs** — Studio Output captured by the plugin (and play-agent logs during Play).

## Connection check

After install, confirm in this order:

1. Your MCP client actually spawned RoBridge — dashboard loads.
2. Roblox Studio is open on the place you care about; plugin toolbar button exists.
3. Dashboard Overview shows the place name, not “No Studio connected”.

Plugin not listed? Restart Studio after `npm run install-plugin`. HTTP prompt denied? Allow requests to `127.0.0.1`.

## Port already in use

One RoBridge process owns `3737`. If a second client (Cursor + Claude, two windows) starts another copy, that copy forwards MCP tools to the owner and does not bind HTTP again. Open the dashboard on the original process. To restart cleanly, quit the owner (stop the MCP server in the first client, or kill the Node process) and start once.

## Live tool catalog

[GET /api/tools](http://127.0.0.1:3737/api/tools) returns the same registrations as MCP `tools/list` (names, actions, param keys, server version).
