# Limits

Honest constraints. RoBridge does not pretend to be a hosted cloud or a Pro SKU.

## One port

Dashboard + plugin bridge bind `127.0.0.1:3737` (override with `ROBRIDGE_PORT`). The first process owns the port. Later MCP clients on the same port forward tool calls to that owner — they do not start a second dashboard. Cursor and Claude can share one Studio session this way. Not a multi-Studio router: keep the place you want to edit open.

## Open Cloud upload is not included

There is no Open Cloud API-key pipeline, no `manage_open_cloud_assets`, and no hosted asset CDN. `manage_assets.upload_asset` is Studio `AssetService:CreateAssetAsync` (requires `confirm=true` and a logged-in Studio session). Creator Store insert still uses `InsertService:LoadAsset`.

## InsertService ownership

`manage_assets` insert / insert_free / insert_package only works for assets that are free or owned by the logged-in Studio user. Always `search` first, then insert an `assetId` from those results — never invent ids.

## Local only

HTTP is localhost. The filesystem next to the server (`sync/`, `asset-library/`, `test-reports/`, `gallery/`) is on the machine running Node, not Roblox’s cloud.

## CaptureService

One in-flight screenshot/record. Effective capture rate is often ~1.5–2 fps even if you request a higher `fps`. Mesh / Image APIs must be enabled.

## Player Emulator / experience language

`test_profile_*` and `experience_language_set` return `manual_required` — Roblox does not expose a public Player Emulator API to plugins. Set those in Studio’s Test menu.

## What this project is not

- Not a VS Code Roblox explorer extension.
- Not a paid Pro tier with gated tools.
