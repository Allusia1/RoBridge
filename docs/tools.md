# Tools

24 tools from `defineTool` in `src/tools`. Server **0.1.6**, plugin **0.1.9**. Same shapes as MCP `tools/list` and `GET /api/tools`. All free.

Regenerate this page: `node scripts/extract-tool-catalog.mjs`.

## Index

### Instances

- [`manage_properties`](#manage_properties)
- [`manage_scripts`](#manage_scripts)
- [`mutate_instances`](#mutate_instances)
- [`query_instances`](#query_instances)

### World

- [`manage_camera`](#manage_camera)
- [`manage_effects`](#manage_effects)
- [`manage_lighting`](#manage_lighting)
- [`manage_physics`](#manage_physics)
- [`manage_terrain`](#manage_terrain)
- [`spatial_query`](#spatial_query)

### Studio

- [`manage_assets`](#manage_assets)
- [`manage_input`](#manage_input)
- [`manage_logs`](#manage_logs)
- [`manage_selection`](#manage_selection)
- [`manage_studio`](#manage_studio)
- [`manage_sync`](#manage_sync)
- [`system_info`](#system_info)
- [`workspace_state`](#workspace_state)

### Media

- [`manage_animation`](#manage_animation)
- [`manage_audio`](#manage_audio)
- [`manage_tween`](#manage_tween)

### UI

- [`manage_ui`](#manage_ui)

### Execute

- [`batch_execute`](#batch_execute)
- [`execute_luau`](#execute_luau)

## Instances

### `manage_properties`

`core.ts`

Get/set properties, attributes and tags. Actions: get, get_all, set (property + value), set_many/set_multiple (properties map — also used if you pass action 'set' with a properties map and no property), get_attributes/get_attr/get_all_attrs, set_attribute/set_attr, delete_attr, get_tags, add_tag, remove_tag, check_tag, get_tagged, set_relative (add/subtract/multiply/divide via operation, or plain delta), set_calculated (evaluate a math expression with variables that may be values or instance property paths), mass_set, mass_get, modify_children (set props on matching children).

`get` · `get_all` · `set` · `set_many` · `set_multiple` · `get_attributes` · `get_attr` · `get_all_attrs` · `set_attribute` · `set_attr` · `delete_attr` · `get_tags` · `add_tag` · `remove_tag` · `check_tag` · `get_tagged` · `set_relative` · `set_calculated` · `mass_set` · `mass_get` · `modify_children`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Instance path. An RBId GUID is also accepted. |
| `rbId` | `string` | optional | RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id |
| `id` | `string` | optional | Alias for rbId |
| `paths` | `string[]` | optional | Paths for mass_set / mass_get |
| `property` | `string` | optional | Property name for get/set/set_relative/set_calculated. Alias: propertyName |
| `propertyName` | `string` | optional | Alias for property |
| `properties` | `string[]` | optional | Property name list (get) or map (set_many) |
| `value` | `any` | optional | Value for set / set_attribute / set_relative. Alias: amount |
| `amount` | `any` | optional | Alias for value (set_relative) |
| `operation` | `enum (add \| subtract \| multiply \| divide)` | optional | Math operation for set_relative (default add) |
| `expression` | `string` | optional | Math expression for set_calculated, e.g. 'base * multiplier + 2' |
| `variables` | `object` | optional | set_calculated variables: name -> number or 'path.to.Instance.Property' string |
| `attribute` | `string` | optional | Attribute name |
| `tag` | `string` | optional | Tag name |
| `className` | `string` | optional | Optional ClassName filter for modify_children |

### `manage_scripts`

`core.ts`

Work with Script/LocalScript/ModuleScript sources. Actions: get_source, set_source, create, delete, list, search, replace (substring across scripts), edit_lines, edit_replace (find/replace in one script), edit_insert (insert at line), edit_delete (delete line range), validate (loadstring syntax check of a script path or raw source), get_dependencies (require() targets and services a script references). Prefer these over execute_luau for script edits.

`get_source` · `set_source` · `create` · `delete` · `list` · `search` · `replace` · `edit_lines` · `edit_replace` · `edit_insert` · `edit_delete` · `validate` · `get_dependencies`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Script path (or root path for list/search, defaults to game). An RBId GUID is also accepted. |
| `rbId` | `string` | optional | RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id |
| `id` | `string` | optional | Alias for rbId |
| `source` | `string` | optional | New source for set_source/create, or replacement text for edit_lines/edit_insert |
| `className` | `enum (Script \| LocalScript \| ModuleScript)` | optional | Class for create (default Script) |
| `parentPath` | `string` | optional | Parent for create |
| `name` | `string` | optional | Name for create |
| `query` | `string` | optional | Substring to search for / find text for replace |
| `replacement` | `string` | optional | Replacement text for replace / edit_replace |
| `startLine` | `number` | optional | — |
| `endLine` | `number` | optional | — |
| `maxResults` | `number` | optional | — |

### `mutate_instances`

`core.ts`

Create, delete, clone, move, rename, or pivot instances. Also: create_with_props (create+properties), create_tree (nested hierarchy in one waypoint), mass_create, mass_delete, mass_duplicate, smart_duplicate (N copies with offset), scatter (ray-snap clones onto ground in a region). Property values: numbers/strings/booleans, Vector3 [x,y,z], CFrame [x,y,z] or 12 numbers, Color3 hex '#ff0000' or [r,g,b] 0-1, UDim2 [xs,xo,ys,yo], enum strings like 'Enum.Material.Neon'.

`create` · `create_with_props` · `delete` · `clone` · `move` · `rename` · `pivot` · `create_tree` · `mass_create` · `mass_delete` · `mass_duplicate` · `smart_duplicate` · `scatter`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Target instance path (delete/clone/move/rename/pivot/smart_duplicate). An RBId GUID is also accepted. |
| `rbId` | `string` | optional | RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id |
| `id` | `string` | optional | Alias for rbId |
| `className` | `string` | optional | ClassName to create |
| `parentPath` | `string` | optional | Parent path for create/clone/move. Alias: parent |
| `parent` | `string` | optional | Alias for parentPath |
| `name` | `string` | optional | Name for created/cloned instance |
| `newName` | `string` | optional | New name for rename |
| `properties` | `object` | optional | Properties to set |
| `position` | `number[]` | optional | [x,y,z] position for move/pivot |
| `cframe` | `number[]` | optional | CFrame as [x,y,z] or 12 numbers for pivot |
| `offset` | `number[]` | optional | [x,y,z] relative offset for pivot/smart_duplicate |
| `tree` | `object` | optional | Nested instance tree for create_tree |
| `instances` | `object` | optional | Specs for mass_create |
| `paths` | `string[]` | optional | Paths for mass_delete / mass_duplicate |
| `count` | `number` | optional | Copy count for smart_duplicate / scatter |
| `templatePaths` | `string[]` | optional | Templates to clone for scatter |
| `region` | `number[]` | optional | World AABB {min,max} for scatter |
| `seed` | `number` | optional | — |
| `maxSlope` | `number` | optional | Max ground slope degrees for scatter (default 30) |
| `avoidWater` | `boolean` | optional | — |
| `parentName` | `string` | optional | Folder name that groups scatter results |

### `query_instances`

`core.ts`

Query instances in the Roblox place. Prefer a typed action over execute_luau. Actions: get, children, descendants, ancestors, find_child, find_descendant, wait_for_child, search_class, search_name, search_property, search_tag, class_info, file_tree (nested outline), project_structure (service/script counts). Paths: 'game.Workspace.Model.Part' or 'Workspace/Model/Part'. Prefer rbId (from a prior summary) over path when both are set — names like Part are not unique. Aliases: childName/descendantName/query→name, root→path, propertyName→property, id→rbId.

`get` · `children` · `descendants` · `ancestors` · `find_child` · `find_descendant` · `wait_for_child` · `search_class` · `search_name` · `search_property` · `search_tag` · `class_info` · `file_tree` · `project_structure`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Instance path. Defaults to game. Alias: root. An RBId GUID is also accepted. |
| `root` | `string` | optional | Alias for path |
| `rbId` | `string` | optional | RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id |
| `id` | `string` | optional | Alias for rbId |
| `name` | `string` | optional | Child/descendant name or name substring for searches |
| `childName` | `string` | optional | Alias for name (find_child / wait_for_child) |
| `descendantName` | `string` | optional | Alias for name (find_descendant) |
| `query` | `string` | optional | Alias for name (search_name) |
| `className` | `string` | optional | ClassName for search_class / class_info |
| `property` | `string` | optional | Property name for search_property |
| `propertyName` | `string` | optional | Alias for property |
| `value` | `any` | optional | Optional property value to match (search_property) |
| `propertyValue` | `any` | optional | Alias for value |
| `tag` | `string` | optional | Tag for search_tag |
| `timeout` | `number` | optional | Seconds to wait (wait_for_child, default 5, max 30) |
| `maxDepth` | `number` | optional | Max depth for file_tree (default 5) / project_structure (default 3) |
| `depth` | `number` | optional | Alias for maxDepth |
| `maxResults` | `number` | optional | Max results for searches/descendants (default 100) |
| `includeProps` | `boolean` | optional | Include common properties in results |

## World

### `manage_camera`

`scene.ts`

Control the Studio viewport camera. Actions: get/info, set, focus/focus_path, focus_position (look at a world point), suggest (recommended views for a target or the selection — does not move the camera), zoom_extents, screenshot, record, record_stop. screenshot captures the Edit-mode viewport via Roblox CaptureService (works even if Studio is in the background). record captures a short viewport clip (CaptureService frame burst → Node stitch). CaptureService allows only one in-flight shot and typically lands around 1.5–2 fps; that cap is expected. record_stop aborts an in-flight recording. Requires File → Game Settings → Security → Allow Mesh / Image APIs.

`get` · `info` · `set` · `focus` · `focus_path` · `focus_position` · `suggest` · `zoom_extents` · `screenshot` · `record` · `record_stop`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `position` | `number[]` | optional | [x,y,z] camera position |
| `lookAt` | `number[]` | optional | [x,y,z] point to look at |
| `path` | `string` | optional | Instance to focus for focus/screenshot/record |
| `distance` | `number` | optional | Distance from target when focusing |
| `maxDimension` | `number` | optional | Longest screenshot/record side in pixels (screenshot default 1024, record default 480) |
| `seconds` | `number` | optional | record duration in seconds (default 4, max 12) |
| `fps` | `number` | optional | record target frames per second (default 15, range 4–24). Actual rate is CaptureService-limited (~1.5–2 fps). |

### `manage_effects`

`scene.ts`

Add visual effects to parts. Actions: create (ParticleEmitter, Fire, Smoke, Sparkles, Trail, Beam, PointLight, SpotLight, SurfaceLight, Highlight), remove/clear, list, emit (ParticleEmitter:Emit), toggle (Enabled).

`create` · `remove` · `clear` · `list` · `emit` · `toggle`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | required | Target part/instance path |
| `effectType` | `string` | optional | — |
| `name` | `string` | optional | — |
| `properties` | `object` | optional | — |
| `count` | `number` | optional | Particle count for emit (default 16) |

### `manage_lighting`

`scene.ts`

Inspect or change Lighting and environment. Actions: get, set/lighting (Lighting properties), set_time/time (clockTime 0-24 or time 'HH:MM:SS'), atmosphere (get/set Atmosphere, createIfMissing), sky, terrain_props (Terrain water/visuals), mood (preset: day/night/sunset/foggy/horror plus optional overrides), add_effect, clear_effects. Do not invent skybox asset IDs.

`get` · `set` · `lighting` · `set_time` · `time` · `atmosphere` · `sky` · `terrain_props` · `mood` · `add_effect` · `clear_effects`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `properties` | `object` | optional | — |
| `clockTime` | `number` | optional | — |
| `time` | `string` | optional | HH:MM:SS for time action |
| `effectType` | `string` | optional | e.g. Atmosphere, BloomEffect |
| `createIfMissing` | `boolean` | optional | Create Atmosphere/Sky if missing (default true) |
| `mood` | `enum (day \| night \| sunset \| foggy \| horror)` | optional | — |
| `overrides` | `object` | optional | Optional Lighting property overrides for mood |

### `manage_physics`

`scene.ts`

Physics helpers. Actions: anchor / unanchor, set_collide, weld, get_mass, set_physical_properties, create_constraint, register_group, set_collidable, get_groups (PhysicsService collision groups).

`anchor` · `unanchor` · `set_collide` · `weld` · `get_mass` · `set_physical_properties` · `create_constraint` · `register_group` · `set_collidable` · `get_groups`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | — |
| `otherPath` | `string` | optional | — |
| `canCollide` | `boolean` | optional | — |
| `constraintType` | `string` | optional | — |
| `properties` | `object` | optional | — |
| `density` | `number` | optional | — |
| `friction` | `number` | optional | — |
| `elasticity` | `number` | optional | — |
| `group` | `string` | optional | Collision group name |
| `groupA` | `string` | optional | — |
| `groupB` | `string` | optional | — |
| `collidable` | `boolean` | optional | — |

### `manage_terrain`

`scene.ts`

Edit Terrain. Actions: fill_block, fill_ball, fill_cylinder, fill_wedge, clear, clear_region (center+size or region {min,max}), clear_bounds (min+max), replace_material (fromMaterial→material), colors_get / colors_set (per-material terrain colors), read_voxel (position), read_voxels / write_voxels (bulk region voxels), generate (procedural fBm terrain with presets mountains/hills/plains/dunes/islands/canyon), smooth (blur occupancy in a region), get_info. Regions: {min:[x,y,z], max:[x,y,z]}. Materials: Grass, Sand, Rock, Water, Snow, Mud, Asphalt, Basalt, Brick, Cobblestone, Concrete, CrackedLava, Glacier, Ground, Ice, LeafyGrass, Limestone, Pavement, Salt, Sandstone, Slate, WoodPlanks.

`fill_block` · `fill_ball` · `fill_cylinder` · `fill_wedge` · `clear` · `clear_region` · `clear_bounds` · `replace_material` · `colors_get` · `colors_set` · `read_voxel` · `read_voxels` · `write_voxels` · `generate` · `smooth` · `get_info`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `center` | `number[]` | optional | — |
| `size` | `number[]` | optional | — |
| `region` | `number[]` | optional | World AABB for clear_region/replace_material/read_voxels/write_voxels/generate/smooth |
| `min` | `number[]` | optional | Min corner for clear_bounds |
| `max` | `number[]` | optional | Max corner for clear_bounds |
| `radius` | `number` | optional | — |
| `height` | `number` | optional | — |
| `material` | `string` | optional | — |
| `fromMaterial` | `string` | optional | Source material for replace_material. Alias: sourceMaterial |
| `sourceMaterial` | `string` | optional | Alias for fromMaterial |
| `targetMaterial` | `string` | optional | Alias for material (replace_material) |
| `color` | `number[]` | optional | Color for colors_set: [r,g,b] 0-255 or '#hex' |
| `position` | `number[]` | optional | [x,y,z] for read_voxel |
| `resolution` | `number` | optional | Voxel resolution in studs (always 4 in Roblox; other values are rejected) |
| `materials` | `any` | optional | write_voxels: 3D array of material names [x][y][z] |
| `occupancy` | `any` | optional | write_voxels: 3D array of occupancy 0-1 [x][y][z] |
| `preset` | `enum (mountains \| hills \| plains \| dunes \| islands \| canyon)` | optional | — |
| `seed` | `number` | optional | — |
| `baseHeight` | `number` | optional | generate: base terrain height in studs (default 32) |
| `amplitude` | `number` | optional | generate: height variation in studs |
| `frequency` | `number` | optional | generate: noise frequency (default 0.01) |
| `octaves` | `number` | optional | generate: fBm octaves 1-8 (default 4) |
| `persistence` | `number` | optional | generate: amplitude decay per octave (default 0.5) |
| `waterLevel` | `number` | optional | generate: absolute water surface height |
| `materialPalette` | `string` | optional | — |
| `intensity` | `number` | optional | smooth: 0-1 blend strength (default 0.5) |

### `spatial_query`

`scene.ts`

Spatial queries in workspace. Actions: raycast (filterList/filterType/ignoreWater), multi_raycast (rays[], max 50), in_radius, in_box, ground_height/find_ground (position or x/z), check_placement (is a box placeable at position), scan_area (heightmap grid), find_flat (flat build spots), find_spawn (clear spawn positions), analyze_walkable (walkability grid), spatial_map (all BasePart/Model positions), find_space (empty spot for a box), bounds (one path or paths[]), snap_grid (snap an instance pivot to a grid), collision. Areas: searchArea/area/region are {min:[x,y,z], max:[x,y,z]}.

`raycast` · `multi_raycast` · `in_radius` · `in_box` · `ground_height` · `find_ground` · `check_placement` · `scan_area` · `find_flat` · `find_spawn` · `analyze_walkable` · `spatial_map` · `find_space` · `bounds` · `snap_grid` · `collision`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Instance path for bounds / collision / snap_grid / spatial_map root. Alias: rootPath |
| `rootPath` | `string` | optional | Alias for path (spatial_map) |
| `paths` | `string[]` | optional | Multiple paths for bounds |
| `otherPath` | `string` | optional | Second instance for collision |
| `origin` | `number[]` | optional | — |
| `direction` | `number[]` | optional | — |
| `rays` | `number[]` | optional | Ray list for multi_raycast (max 50) |
| `center` | `number[]` | optional | — |
| `position` | `number[]` | optional | [x,y,z] for find_ground / check_placement / collision / find_space result bias |
| `radius` | `number` | optional | — |
| `size` | `number[]` | optional | [x,y,z] box size for in_box / check_placement / find_space / scan_area (x,z used) |
| `rotation` | `number[]` | optional | [rx,ry,rz] degrees for check_placement |
| `searchArea` | `number[]` | optional | World AABB for find_flat / find_spawn / find_space / analyze_walkable. Alias: area |
| `area` | `number[]` | optional | Alias for searchArea |
| `filterList` | `string[]` | optional | Instance paths to exclude/include in raycasts. Alias: filterInstances |
| `filterInstances` | `string[]` | optional | Alias for filterList |
| `filterType` | `enum (Exclude \| Include)` | optional | Raycast filter type (default Exclude) |
| `ignoreWater` | `boolean` | optional | — |
| `checkGround` | `boolean` | optional | check_placement: also require ground support (default true) |
| `resolution` | `number` | optional | Grid resolution in studs for scan_area/analyze_walkable/find_flat (default 4) |
| `maxDistance` | `number` | optional | find_ground max cast distance (default 1000) |
| `offset` | `number` | optional | find_ground vertical offset added to result (default 0) |
| `maxSlope` | `number` | optional | Max slope degrees for find_flat (default 10) / analyze_walkable (default 45) |
| `tolerance` | `number` | optional | find_flat height variation tolerance in studs (default 2) |
| `minSize` | `number[]` | optional | find_flat minimum flat area size [x,z] (default [8,8]) |
| `spawnSize` | `number[]` | optional | find_spawn entity size (default [4,5,4]) |
| `minSpacing` | `number` | optional | find_spawn min distance between results (default 10) |
| `preferOutdoor` | `boolean` | optional | find_spawn: require open sky (default false) |
| `count` | `number` | optional | find_spawn result count (default 10) |
| `characterHeight` | `number` | optional | analyze_walkable clearance height (default 5) |
| `maxStepHeight` | `number` | optional | analyze_walkable max step between cells (default 2) |
| `includeModels` | `boolean` | optional | spatial_map: include Model bounding boxes (default true) |
| `gridSize` | `number` | optional | snap_grid / find_space grid size (default 4). Alias: gridSnap |
| `gridSnap` | `number` | optional | Alias for gridSize |
| `axes` | `enum (x \| y \| z)` | optional | snap_grid axes (default all) |
| `padding` | `number` | optional | find_space clearance around the box (default 1) |
| `x` | `number` | optional | — |
| `z` | `number` | optional | — |
| `maxResults` | `number` | optional | — |

## Studio

### `manage_assets`

`studio.ts`

Roblox Toolbox/Creator Store assets plus a local asset library. ALWAYS search first, then insert using an assetId from those results — never invent or hardcode IDs. Actions: search (keyword/query + assetType), preview / info (metadata for a search-result assetId), insert / insert_free / insert_package (assetId into parentPath), search_insert (search then insert the first match), export_selection_json (JSON snapshot of the Studio selection), export_selection_rbxm / export_path_rbxm (serialize selection or a path into the local ./asset-library as a re-importable asset), import_rbxm (rebuild a library asset in Studio), review_model (QA a model: anchoring, PrimaryPart, naming, size, expected groups; readiness verdict), generate_model (Roblox GenerationService, if this Studio has access), upload_asset (AssetService:CreateAssetAsync — requires confirm=true), generate_thumbnail (render a library asset to a PNG thumbnail).

`search` · `preview` · `info` · `insert` · `insert_free` · `insert_package` · `search_insert` · `export_selection_json` · `export_selection_rbxm` · `export_path_rbxm` · `import_rbxm` · `review_model` · `generate_model` · `upload_asset` · `generate_thumbnail`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | search first, then insert/preview with an assetId from results |
| `keyword` | `string` | optional | Toolbox search text (required for search). Alias: query |
| `query` | `string` | optional | Alias for keyword |
| `assetType` | `enum (Model \| Decal \| Audio \| Mesh \| Plugin)` | optional | Toolbox category. Model=props, Audio=Sounds, Decal=images, Mesh=MeshParts |
| `limit` | `number` | optional | Max search results (default 10, max 30). Alias: maxResults |
| `maxResults` | `number` | optional | Alias for limit |
| `assetId` | `unknown` | optional | Toolbox asset id from a search/preview result. Do not invent this. |
| `parentPath` | `string` | optional | Insert parent (default Workspace). Aliases: parent, targetParent |
| `parent` | `string` | optional | Alias for parentPath |
| `targetParent` | `string` | optional | Alias for parentPath (import_rbxm/generate_model) |
| `position` | `number[]` | optional | Optional [x,y,z] pivot for models/meshes |
| `name` | `string` | optional | Optional name for the inserted instance (especially Sounds) |
| `play` | `boolean` | optional | If true and the insert is audio, play the Sound once |
| `sourcePath` | `string` | optional | Instance path for export_path_rbxm / review_model / upload_asset |
| `category` | `string` | optional | Library category folder for export/import/review/thumbnail (default 'models') |
| `displayName` | `string` | optional | Library asset display name |
| `description` | `string` | optional | Library asset description |
| `includeProperties` | `boolean` | optional | export_selection_json: include common properties (default true) |
| `includeChildren` | `boolean` | optional | export_selection_json: include children (default true) |
| `maxDepth` | `number` | optional | Export child depth (default 10) |
| `assetLibraryAssetId` | `string` | optional | Local library asset id from an export action (import_rbxm / generate_thumbnail) |
| `exportToLibrary` | `boolean` | optional | review_model: also save to the library when review passes |
| `expectedUse` | `enum (decorative \| interactive \| vehicle \| character \| unknown)` | optional | — |
| `expectedGroups` | `string[]` | optional | review_model: child names that must exist |
| `maxDescendants` | `number` | optional | review_model descendant budget (default 500) |
| `prompt` | `string` | optional | generate_model: text prompt for Roblox GenerationService |
| `confirm` | `boolean` | optional | upload_asset: must be true to actually upload to Roblox |

### `manage_input`

`studio.ts`

Simulate input. In playtest: walk_to (Humanoid:MoveTo a path/position), click_world (VirtualInput at a 3D instance screen pos), walk_and_click (walk then click — use this to verify world clicks), click_at (viewport pixels), click_path (PlayerGui GuiButton), key, type_text. Clicks use UserInputService:CreateVirtualInput, not VirtualInputManager. In edit: click_path uses VirtualInput plus a LastClick attribute on the ScreenGui.

`click_at` · `click_path` · `key` · `type_text` · `walk_to` · `click_world` · `walk_and_click`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | 3D instance (walk_to/click_world) or GuiButton (click_path) |
| `position` | `number[]` | optional | Optional [x,y,z] walk target if path is omitted |
| `standOff` | `number` | optional | How far to stand from the target when walking (default 4) |
| `timeout` | `number` | optional | Walk timeout seconds (default 8) |
| `x` | `number` | optional | — |
| `y` | `number` | optional | — |
| `key` | `string` | optional | Enum.KeyCode name, e.g. E, Space, W |
| `text` | `string` | optional | — |
| `duration` | `number` | optional | — |

### `manage_logs`

`studio.ts`

Read the Roblox Studio output log (captured by the plugin via LogService; play-mode logs come from the play agent). Actions: get (recent entries, optional levelFilter: Print/Warning/Error, containsFilter, since unix-seconds cursor), errors (Error-level only), clear.

`get` · `errors` · `clear`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `limit` | `number` | optional | Max entries (default 100) |
| `levelFilter` | `string` | optional | Print, Warning, or Error |
| `containsFilter` | `string` | optional | Only entries containing this substring |
| `since` | `number` | optional | Only entries at/after this unix timestamp in seconds |

### `manage_selection`

`studio.ts`

Get or set the Studio selection. Actions: get, set (paths array), add, remove, clear, details (selection + common properties, optional maxDepth descendants + includeAncestors), cached (last known selection without a Studio round-trip; maxAge ms), context (selection with script source, properties, and children), watch (install a selection-change watcher; call again to collect changes).

`get` · `set` · `add` · `remove` · `clear` · `details` · `cached` · `context` · `watch`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `paths` | `string[]` | optional | — |
| `maxAge` | `number` | optional | cached: max cache age in ms (default 30000, 0 = any age) |
| `maxDepth` | `number` | optional | details: descendant depth (default 1) |
| `includeAncestors` | `boolean` | optional | details: include ancestor chain |
| `includeSource` | `boolean` | optional | context: include script sources (default true) |
| `includeProperties` | `boolean` | optional | context: include common properties (default true) |
| `includeChildren` | `boolean` | optional | context: include immediate children (default false) |

### `manage_studio`

`studio.ts`

Studio-level operations. Actions: get_mode, play_status, play_start (F5 Play or F8 Run), play_stop, play_pause, play_resume, run_test (inject Luau, play, collect [ROBRIDGE_TEST] logs, stop, write report; auto-records a short viewport clip unless record=false), toggle_ui_preview (StarterGui.ShowDevelopmentGui), test_profile_get/set/reset (Player Emulator — no public API; returns manual_required with instructions), experience_language_get (locale info) / experience_language_set (manual_required), undo, redo, set_waypoint, save_prompt. After adding a player-facing feature (UI, clicks, shop, movement, leaderstats), playtest with run_test or play_start before reporting done. Prefer run_test over manually sequencing play_start + logs + play_stop. Viewport clips: manage_camera.record, or run_test (attaches clip metadata).

`get_mode` · `play_status` · `play_start` · `play_stop` · `play_pause` · `play_resume` · `run_test` · `toggle_ui_preview` · `test_profile_get` · `test_profile_set` · `test_profile_reset` · `experience_language_get` · `experience_language_set` · `undo` · `redo` · `set_waypoint` · `save_prompt`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `name` | `string` | optional | — |
| `mode` | `enum (play \| run)` | optional | play_start / run_test mode: play (F5) or run (F8) |
| `script` | `string` | optional | Luau test body for run_test |
| `test_name` | `string` | optional | Display name for run_test |
| `timeout` | `number` | optional | run_test timeout in seconds (default 60, max 300) |
| `enabled` | `boolean` | optional | toggle_ui_preview: explicit value; omit to toggle |
| `testProfile` | `object` | optional | test_profile_set: Player Emulator profile patch |
| `locale` | `string` | optional | experience_language_set: locale id, e.g. en-us |
| `testSource` | `string` | optional | play_start: optional run_test script injected with play agents (not saved) |
| `testName` | `string` | optional | play_start: name for testSource script (default t0) |
| `record` | `boolean` | optional | run_test: attach a viewport clip (default true) |
| `recordSeconds` | `number` | optional | run_test / record duration in seconds (default 4) |
| `recordPath` | `string` | optional | run_test: optional instance to focus while recording |

### `manage_sync`

`studio.ts`

Sync between Studio and the local filesystem. Actions: export_scripts (dump every script source under a path to ./sync/<place>/ on disk), status / status_current_place (place + sync dir + last export), history (recent sync operations), directions (get or set per-type sync directions), read_file (read a synced script file by instancePath), write_file (write content to the synced file AND apply it to the Studio script), progress (last export stats).

`export_scripts` · `status` · `status_current_place` · `history` · `directions` · `read_file` · `write_file` · `progress`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | Root to export from (default game) |
| `outDir` | `string` | optional | Output directory (default ./sync) |
| `instancePath` | `string` | optional | Script instance path for read_file/write_file, e.g. game.ServerScriptService.Main |
| `content` | `string` | optional | New file content for write_file |
| `directions` | `object` | optional | directions: set map, e.g. {scripts: 'studio_to_file'} |
| `limit` | `number` | optional | history: max entries (default 50) |

### `system_info`

`studio.ts`

RoBridge + Studio status. No action (or action=info) returns the full snapshot. Actions: ping (latency), connection (edit/play sessions), place_info, services (DataModel services), usage (per-tool call statistics for this server session), preflight (read-only Studio diagnostics: mode, publish status, HttpService, loadstring, Mesh/Image APIs — with fix instructions).

`info` · `ping` · `connection` · `place_info` · `services` · `usage` · `preflight`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | optional | Action enum |

### `workspace_state`

`studio.ts`

Snapshot of the place. Actions: summary (place info, top-level services, selection, camera), counts (instance counts by ClassName under a path), sync (hierarchy outline + metadata + change stats), snapshot (instance tree under a path, maxDepth), changes (recent added/removed instances — installs a watcher on first call), clear_history (reset the change log), viewport (camera + viewport size + selection bounds), metadata (place ids, counts, timestamps), scripts (all script paths with line counts), selection_info (selection with bounds), clear_cache (drop watchers and cached plugin state).

`summary` · `counts` · `sync` · `snapshot` · `changes` · `clear_history` · `viewport` · `metadata` · `scripts` · `selection_info` · `clear_cache`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | — |
| `topN` | `number` | optional | — |
| `maxDepth` | `number` | optional | snapshot depth (default 4) |
| `limit` | `number` | optional | changes: max events returned (default 20) |
| `includeMetadata` | `boolean` | optional | sync: include metadata block (default true) |
| `includeCameraInfo` | `boolean` | optional | viewport: include camera (default true) |
| `includeSelectionBounds` | `boolean` | optional | viewport: include selection bounds (default true) |

## Media

### `manage_animation`

`media.ts`

Manage animations. Actions: create (Animation with animationId — do not invent IDs), list, load (load onto a rig without playing), play, stop, stop_all, get_tracks (tracks on a rig). Prefer user-provided or search-accepted animation IDs.

`create` · `list` · `load` · `play` · `stop` · `stop_all` · `get_tracks`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `animationId` | `union` | optional | — |
| `parentPath` | `string` | optional | — |
| `name` | `string` | optional | — |
| `path` | `string` | optional | Animation instance path for play |
| `rigPath` | `string` | optional | Model with Humanoid or AnimationController |

### `manage_audio`

`media.ts`

Manage Sound instances. Actions: create (soundId number or 'rbxassetid://...' — do not invent IDs), play, pause, resume, stop, stop_all, list, set, set_listener (SoundService listener: Camera, CFrame, ObjectPosition, or ObjectCFrame). Prefer user-provided or search-accepted asset IDs.

`create` · `play` · `pause` · `resume` · `stop` · `stop_all` · `list` · `set` · `set_listener`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | — |
| `parentPath` | `string` | optional | — |
| `soundId` | `union` | optional | — |
| `name` | `string` | optional | — |
| `properties` | `object` | optional | — |
| `listenerType` | `enum (Camera \| CFrame \| ObjectPosition \| ObjectCFrame)` | optional | For set_listener (default Camera) |
| `listenerPath` | `string` | optional | Instance path for ObjectPosition/ObjectCFrame listener |
| `cframe` | `number[]` | optional | [x,y,z] for CFrame listener |

### `manage_tween`

`media.ts`

Animate properties with TweenService (plays live in the Studio viewport). Actions: create (build a tween without playing; returns tweenId), play (tweenId from create, or path+goal to create-and-play), pause, resume, cancel/stop_all. pause/resume/cancel accept tweenId or affect all tracked tweens. goal/properties map e.g. {"Position": [0,10,0], "Transparency": 0.5}.

`create` · `play` · `pause` · `resume` · `cancel` · `stop_all`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `path` | `string` | optional | — |
| `goal` | `object` | optional | Property goal map. Alias: properties |
| `properties` | `object` | optional | Alias for goal |
| `tweenId` | `string` | optional | Tween id returned by create; targets one tween for play/pause/resume/cancel |
| `duration` | `number` | optional | — |
| `easingStyle` | `string` | optional | — |
| `easingDirection` | `string` | optional | — |
| `repeatCount` | `number` | optional | — |
| `reverses` | `boolean` | optional | — |
| `tweenInfo` | `boolean` | optional | Alias object for duration/easing fields |

## UI

### `manage_ui`

`ui.ts`

Create, inspect, preview, and interact with Roblox UI. Actions: design_brief (plan a UI from a text brief; set create=true to build it), create_tree, update, list, inspect, list_interactive, preview (clone into CoreGui in Edit), hide_preview, click (VirtualInput / attribute click — PlayerGui during playtest, StarterGui in Edit), type_text, get_abs, check, delete.

`design_brief` · `create_tree` · `update` · `list` · `inspect` · `list_interactive` · `preview` · `hide_preview` · `click` · `type_text` · `get_abs` · `check` · `delete`

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `action` | `enum` | required | Action enum |
| `parentPath` | `string` | optional | — |
| `screenGuiName` | `string` | optional | — |
| `tree` | `object` | optional | — |
| `path` | `string` | optional | — |
| `properties` | `object` | optional | — |
| `depth` | `number` | optional | — |
| `brief` | `string` | optional | Natural-language UI brief for design_brief |
| `kind` | `enum (hud \| menu \| shop \| inventory \| dialog \| settings \| custom)` | optional | — |
| `text` | `string` | optional | Text for type_text |
| `create` | `boolean` | optional | If true, design_brief also creates the tree |

## Execute

### `batch_execute`

`execute.ts`

Run several RoBridge tool calls in one request as a single undo waypoint. Each command is {tool, args}. Stops on first error unless continueOnError is true (stopOnError is the inverse alias). Nested batch_execute is rejected. Prefer this over many round-trips for related mutations.

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `commands` | `object` | optional | Ordered list of tool calls |
| `continueOnError` | `boolean` | optional | — |
| `stopOnError` | `boolean` | optional | Alias (default true). Inverse of continueOnError. |
| `waypoint` | `string` | optional | ChangeHistoryService waypoint name for the batch |

### `execute_luau`

`execute.ts`

Run arbitrary Luau code in Roblox Studio (plugin security level, Edit-only). During Play use manage_studio.run_test / play agents instead — plugin loadstring is unavailable in Play. The code may `return` a value, which is JSON-encoded (Instances become path strings, Roblox types become typed tables). A helper table `RB` is available with RB.resolve(path or rbId), RB.encode(value), RB.summary(instance) (includes rbId), RB.setProp(instance, name, value), RB.stripIds().

| Param | Type | | Notes |
| --- | --- | --- | --- |
| `code` | `string` | required | Luau source to run |
| `timeoutSeconds` | `number` | optional | Max wait (default 30) |

## Value conventions

| Roblox type | JSON |
| --- | --- |
| Vector3 / CFrame position | `[x, y, z]` |
| CFrame (full) | 12 numbers |
| Color3 | `"#ff0000"` or `[r, g, b]` in 0–1 |
| UDim2 | `[xs, xo, ys, yo]` |
| Enum | `"Enum.Material.Neon"` or `"Neon"` |
| Instance | path string |

Paths: `game.Workspace.Model.Part` or `Workspace/Model/Part`. Prefer `rbId` from a prior summary when names collide. Never invent `rbxassetid` values — `manage_assets.search` first.
