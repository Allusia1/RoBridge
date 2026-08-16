# Playtesting

After a player-facing change (UI, clicks, shop, movement, leaderstats), run a playtest before calling the work done. Prefer `manage_studio.run_test` over hand-rolling `play_start` + logs + `play_stop`.

## run_test

`manage_studio` action `run_test` will:

1. Call `play_stop` first (clears a leftover Play session).
2. Inject your Luau body into a short runner that prints `[ROBRIDGE_TEST]` markers.
3. Start Play (F5) or Run (F8) via `play_start`.
4. Collect Output lines containing `[ROBRIDGE_TEST]` until PASS/FAIL + END, or timeout.
5. Stop Play, write a JSON report under `test-reports/`.
6. Unless `record=false`, attach a short viewport clip via `manage_camera.record`.

### Arguments

| Arg | Meaning |
| --- | --- |
| `script` | Luau test body (required). Runs inside ServerScriptService during play. |
| `test_name` | Display name for the report (default RoBridgeTest). |
| `timeout` | Seconds to wait (default 60, max 300). |
| `mode` | `play` (F5) or `run` (F8). |
| `record` | Attach a viewport clip (default true). |
| `recordSeconds` / `recordPath` | Clip duration (default 4s) and optional instance to focus. |

### What the test body should print

The wrapper already prints `[ROBRIDGE_TEST] START`, `PASS` or `FAIL`, and `END`. Inside the body, print your own checks with the same prefix so they show up in the report:

```lua
print("[ROBRIDGE_TEST] PASS")
-- or
print("[ROBRIDGE_TEST] FAIL expected SpawnLocation above ground")
```

A typical body asserts something, then prints PASS or FAIL. Uncaught errors in the body become FAIL.

## Manual Play

- `play_start` — F5 Play or F8 Run. Optional `testSource` injects a script with the play agents.
- `play_stop` — EndTest + strip play agents. If Studio looks stuck in Play, press **Stop** in Studio, then retry.
- `play_status` / `get_mode` — edit vs play, whether the play agent is polling.
- `play_pause` / `play_resume`

Play agents need HTTP: Game Settings → Security → Allow HTTP Requests. If Play starts but the agent never polls, that setting is the usual cause.

## Input during Play

`manage_input`: `walk_to`, `click_world`, `walk_and_click` (3D objects), `click_path` (PlayerGui buttons), `key`, `type_text`. Screen buttons can also use `manage_ui.click`. Clicks use `UserInputService:CreateVirtualInput`.

## execute_luau vs Play

`execute_luau` is Edit-only (plugin `loadstring`). In Play, use `run_test` / play agents, or `play_stop` first. Errors include a Fix: line pointing at that.
