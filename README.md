# RoBridge

A free, open, local MCP server that bridges AI agents (Cursor, Claude, any MCP client) to **Roblox Studio** — with a Studio plugin and a local web dashboard. All tools included, no Pro tier.

**MCP server `{package.json, src/index.ts}`: 0.1.6** · **Studio plugin `plugin/RoBridge.lua`: 0.1.8** · **24 tools**

```
AI Agent (MCP over stdio) ──► RoBridge server ──► HTTP long-poll ──► Studio plugin ──► your place
                                    │
                                    └──► Web dashboard at http://127.0.0.1:3737
```

Docs (this repo): [`web/`](web/) — `cd web && npm install && npm run dev` then open [http://localhost:4000/docs](http://localhost:4000/docs). `/en/docs` is an English alias for `/docs`. No public deploy URL yet.

## First run

1. **Install dependencies and build**

   ```bash
   npm install
   npm run build
   ```

2. **Install the Studio plugin**

   ```bash
   npm run install-plugin
   ```

   Then **restart Roblox Studio**. A **RoBridge** toolbar button appears under Plugins — it auto-connects.

3. **Allow HTTP to `127.0.0.1`** when Studio prompts. The plugin long-polls `http://127.0.0.1:3737`.

4. **Allow Mesh / Image APIs** if you use viewport screenshots or recordings: File → Game Settings → Security → Allow Mesh / Image APIs (`manage_camera.screenshot` / `record`, CaptureService).

5. **Register the MCP server** in `~/.cursor/mcp.json` (or your MCP client's config). Use an **absolute path**:

   ```json
   {
     "mcpServers": {
       "RoBridge": {
         "command": "node",
         "args": ["/absolute/path/to/RoBridge/dist/index.js"]
       }
     }
   }
   ```

   After `npm run build`, **reload the RoBridge MCP server in Cursor** (Settings → MCP → RoBridge → restart) so `tools/list` picks up new schemas.

6. **Open the dashboard** at [http://127.0.0.1:3737](http://127.0.0.1:3737) — connection status, tool history and stats, a live Luau console, and Studio output logs.

One server owns the port. A second `node dist/index.js` on the same port **forwards** tool calls to the process that already bound `3737` (it does not start a second dashboard).

Dashboard only (no MCP client): `node dist/index.js --no-mcp`.

Dump the shipped catalog (no Studio needed): `node dist/index.js --dump-catalog`. Live HTTP copy: [http://127.0.0.1:3737/api/tools](http://127.0.0.1:3737/api/tools). Schema drift check: `npm run test:schema`.

## Tools (24, all free)

MCP `tools/list` and HTTP `/api/tools` share the same `defineTool` Zod shapes. Action lists below are the shipped enums (aliases included). Full param tables: [docs → Tools](web/).

| Tool | Actions |
| --- | --- |
| `query_instances` | get, children, descendants, ancestors, find_child, find_descendant, wait_for_child, search_class, search_name, search_property, search_tag, class_info, file_tree, project_structure |
| `mutate_instances` | create, create_with_props, delete, clone, move, rename, pivot, create_tree, mass_create, mass_delete, mass_duplicate, smart_duplicate, scatter |
| `manage_properties` | get, get_all, set, set_many / set_multiple, attributes/tags (incl. get_tagged, check_tag), set_relative, set_calculated, mass_set, mass_get, modify_children |
| `manage_scripts` | get_source, set_source, create, delete, list, search, replace, edit_lines, edit_replace, edit_insert, edit_delete, validate, get_dependencies |
| `manage_ui` | design_brief, create_tree, update, list, inspect, list_interactive, preview, hide_preview, click, type_text, get_abs, check, delete |
| `manage_lighting` | get, set / lighting, set_time / time, atmosphere, sky, terrain_props, mood, add_effect, clear_effects |
| `manage_selection` | get, set, add, remove, clear, details, cached, context, watch |
| `manage_camera` | get / info, set, focus / focus_path, focus_position, suggest, zoom_extents, screenshot, record, record_stop |
| `manage_tween` | create, play, pause, resume, cancel / stop_all |
| `manage_audio` | create, play, pause, resume, stop, stop_all, list, set, set_listener |
| `manage_animation` | create, list, load, play, stop, stop_all, get_tracks |
| `manage_physics` | anchor, unanchor, set_collide, weld, get_mass, set_physical_properties, create_constraint, register_group, set_collidable, get_groups |
| `manage_effects` | create, remove / clear, list, emit, toggle |
| `manage_terrain` | fill_block/ball/cylinder/wedge, clear, clear_region, clear_bounds, replace_material, colors_get/set, read/write voxels, generate, smooth, get_info |
| `spatial_query` | raycast, multi_raycast, in_radius, in_box, ground_height / find_ground, check_placement, scan_area, find_flat, find_spawn, analyze_walkable, spatial_map, find_space, bounds, snap_grid, collision |
| `manage_assets` | search, preview / info, insert / insert_free / insert_package, search_insert, export/import library, review_model, generate_model, upload_asset, generate_thumbnail |
| `manage_sync` | export_scripts, status / status_current_place, history, directions, read_file, write_file, progress |
| `workspace_state` | summary, counts, sync, snapshot, changes, clear_history, viewport, metadata, scripts, selection_info, clear_cache |
| `manage_logs` | get, errors, clear |
| `system_info` | info (default), ping, connection, place_info, services, usage, preflight |
| `manage_studio` | get_mode, play_status, play_start, play_stop, play_pause, play_resume, **run_test**, toggle_ui_preview, test_profile_get/set/reset, experience_language_get/set, undo, redo, set_waypoint, save_prompt |
| `manage_input` | click_at, click_path, key, type_text, walk_to, click_world, walk_and_click |
| `batch_execute` | run several tool calls in one request (optional waypoint / stopOnError) |
| `execute_luau` | run arbitrary Luau at plugin security level |

`manage_studio.run_test` injects Luau, **stops leftover Play first**, starts Play (or Run), collects `[ROBRIDGE_TEST]` logs, stops, and writes a report. Prefer it over manually sequencing `play_start` + `manage_logs` + `play_stop`. Args: `script`, `test_name`, `timeout`, `mode` (`play` \| `run`), `record`, `recordSeconds`, `recordPath`.

`system_info.preflight` is a read-only Studio checklist (edit mode, HttpService, loadstring, Mesh/Image APIs) with fix instructions.

### Value conventions

Property values accept plain JSON: `[x,y,z]` for Vector3/CFrame position, 12 numbers for full CFrame, `"#ff0000"` or `[r,g,b]` for Color3, `[xs,xo,ys,yo]` for UDim2, `"Enum.Material.Neon"` or `"Neon"` for enums, path strings for Instance references.

Instance paths look like `game.Workspace.Model.Part` or `Workspace/Model/Part`. Prefer `rbId` from a prior summary when names collide. Never invent `rbxassetid` values — `manage_assets.search` first.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `ROBRIDGE_PORT` | `3737` | Dashboard + plugin bridge port |

The plugin reads `RoBridgeHost`/`RoBridgePort` plugin settings if you need a non-default port.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| No Studio session | Open the place in Studio with the plugin; click **Allow** for HTTP to `127.0.0.1`. |
| `execute_luau` / loadstring in Play | Edit-only. Use `run_test` / play agents, or `play_stop` first. |
| Stuck Play | Press **Stop** in Studio (or `manage_studio.play_stop`), then retry. |
| CaptureService / screenshot failed | File → Game Settings → Security → Allow Mesh / Image APIs. One in-flight shot; ~1.5–2 fps is expected. |
| Play started but agent never polls | Game Settings → Security → Allow HTTP Requests. |
| Stale dashboard / port in use | One process owns `:3737`. Stop the owner MCP/Node process and start once. |

Tool errors append a `Fix:` line when the server recognizes the failure. Run `system_info` `preflight` for a checklist.

## Limits

- One RoBridge instance owns `:3737`; extra MCP clients **forward** to that owner (they do not bind a second dashboard).
- `manage_assets` insert uses `InsertService:LoadAsset`, which requires the asset to be free or owned by you.
- Open Cloud asset upload is not included. `upload_asset` is Studio `AssetService:CreateAssetAsync` (`confirm=true`), not an Open Cloud API-key flow.
- Not a crate game. The product is the local MCP bridge.

## License

MIT. See [LICENSE](LICENSE).
