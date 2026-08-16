#!/usr/bin/env node
// Live WEPPY-parity suite: every action added to match/beat WEPPY, against connected Studio.
const BASE = `http://127.0.0.1:${process.env.ROBRIDGE_PORT ?? 3737}`;

async function call(tool, args = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

const results = [];
async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - start, detail: detail == null ? "" : String(detail).slice(0, 160) });
    console.log(`OK   ${name} (${Date.now() - start}ms)${detail != null ? " — " + String(detail).slice(0, 110) : ""}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - start, detail: err.message });
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

const ROOT = "game.Workspace.RoBridgeWeppyParity";
const TX = 600; // far-away terrain test corner, away from the crate build area

await test("wait studio", async () => {
  for (let i = 0; i < 12; i++) {
    const s = await fetch(BASE + "/api/status").then((r) => r.json());
    if (s.studioConnected) return s.bridge.sessions[0]?.placeName;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Studio not connected");
});

await test("stop leftover playtest", async () => {
  try {
    await call("manage_studio", { action: "play_stop" }, 15000);
  } catch {
    /* ok */
  }
});

await test("setup probe folder", async () => {
  try {
    await call("mutate_instances", { action: "delete", path: ROOT });
  } catch {
    /* ok */
  }
  const r = await call("mutate_instances", {
    action: "create_tree",
    parentPath: "game.Workspace",
    tree: {
      className: "Folder",
      name: "RoBridgeWeppyParity",
      children: [
        {
          className: "Model",
          name: "ProbeModel",
          children: [
            { className: "Part", name: "ProbeBase", properties: { Size: [20, 1, 20], Position: [200, 3, 200], Anchored: true } },
            { className: "Part", name: "ProbeCube", properties: { Size: [3, 3, 3], Position: [200, 6, 200], Anchored: true, Color: "#ff8800" } },
          ],
        },
        { className: "Part", name: "OffGrid", properties: { Size: [2, 2, 2], Position: [211.3, 8.7, 197.2], Anchored: true } },
        { className: "IntValue", name: "Config", properties: { Value: 10 } },
      ],
    },
  });
  if (!r.root) throw new Error(JSON.stringify(r));
  return r.root.path;
});

// -------- manage_properties --------
await test("manage_properties.set_relative multiply", async () => {
  const r = await call("manage_properties", {
    action: "set_relative",
    path: `${ROOT}.ProbeModel.ProbeCube`,
    propertyName: "Transparency",
    operation: "add",
    amount: 0.25,
  });
  if (Math.abs(r.Transparency - 0.25) > 1e-4) throw new Error(JSON.stringify(r));
  const m = await call("manage_properties", {
    action: "set_relative",
    path: `${ROOT}.ProbeModel.ProbeCube`,
    property: "Transparency",
    operation: "multiply",
    value: 2,
  });
  if (Math.abs(m.Transparency - 0.5) > 1e-4) throw new Error(JSON.stringify(m));
  await call("manage_properties", { action: "set", path: `${ROOT}.ProbeModel.ProbeCube`, property: "Transparency", value: 0 });
  return `add+multiply ok (${m.operation})`;
});

await test("manage_properties.set_calculated", async () => {
  const r = await call("manage_properties", {
    action: "set_calculated",
    path: `${ROOT}.ProbeModel.ProbeCube`,
    propertyName: "Reflectance",
    expression: "base / 100 + bonus",
    variables: { base: `${ROOT}.Config.Value`, bonus: 0.05 },
  });
  if (Math.abs(r.computed - 0.15) > 1e-4) throw new Error(JSON.stringify(r));
  return `computed=${r.computed}`;
});

// -------- manage_scripts --------
await test("manage_scripts.get_dependencies", async () => {
  await call("manage_scripts", {
    action: "create",
    className: "ModuleScript",
    parentPath: ROOT,
    name: "DepTarget",
    source: "return { hello = true }",
  });
  await call("manage_scripts", {
    action: "create",
    className: "Script",
    parentPath: ROOT,
    name: "DepUser",
    source: 'local RS = game:GetService("ReplicatedStorage")\nlocal TS = game:GetService("TweenService")\nlocal mod = require(script.Parent.DepTarget)\nprint(mod.hello)',
  });
  const r = await call("manage_scripts", { action: "get_dependencies", path: `${ROOT}.DepUser` });
  if (!r.requires?.length) throw new Error("no requires found");
  if (!r.services?.includes("TweenService")) throw new Error(JSON.stringify(r.services));
  return `${r.requires.length} requires, ${r.services.length} services (${r.requires[0].resolvedPath ?? r.requires[0].expression})`;
});

await test("manage_scripts.validate raw source", async () => {
  const good = await call("manage_scripts", { action: "validate", source: "local x = 1\nreturn x" });
  if (!good.valid) throw new Error(good.error);
  const bad = await call("manage_scripts", { action: "validate", source: "local x = = 1" });
  if (bad.valid) throw new Error("bad source passed validation");
  return "good+bad detected";
});

// -------- query_instances --------
await test("query_instances.class_info upgraded", async () => {
  const r = await call("query_instances", { action: "class_info", className: "Part" });
  if (!r.creatable || !r.defaultProps || !r.isA?.includes("BasePart")) throw new Error(JSON.stringify(r).slice(0, 200));
  return `isA=${r.isA.join(",")}`;
});

// -------- manage_selection --------
await test("manage_selection.cached", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.ProbeModel.ProbeCube`] });
  await call("manage_selection", { action: "get" });
  const c = await call("manage_selection", { action: "cached", maxAge: 30000 });
  if (!c.cached || !c.items?.length) throw new Error(JSON.stringify(c).slice(0, 200));
  return `ageMs=${c.ageMs}`;
});

await test("manage_selection.context", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.DepUser`] });
  const r = await call("manage_selection", { action: "context", includeSource: true, includeChildren: true });
  if (!r.items?.[0]?.source?.includes("TweenService")) throw new Error(JSON.stringify(r).slice(0, 200));
  return "source included";
});

await test("manage_selection.watch", async () => {
  const first = await call("manage_selection", { action: "watch" });
  if (!first.watching) throw new Error(JSON.stringify(first));
  await call("manage_selection", { action: "set", paths: [`${ROOT}.OffGrid`] });
  await new Promise((r) => setTimeout(r, 300));
  const second = await call("manage_selection", { action: "watch" });
  if (!second.events?.length) throw new Error("no selection events captured");
  await call("manage_selection", { action: "clear" });
  return `${second.events.length} events`;
});

// -------- manage_camera --------
await test("manage_camera.suggest", async () => {
  const r = await call("manage_camera", { action: "suggest", path: `${ROOT}.ProbeModel` });
  if (!r.views?.length || !r.views.find((v) => v.name === "iso")) throw new Error(JSON.stringify(r).slice(0, 200));
  return `${r.views.length} views`;
});

// -------- manage_tween --------
await test("manage_tween.create + tweenId lifecycle", async () => {
  const created = await call("manage_tween", {
    action: "create",
    path: `${ROOT}.ProbeModel.ProbeCube`,
    duration: 2,
    properties: { Transparency: 0.6 },
  });
  if (!created.tweenId || created.playing) throw new Error(JSON.stringify(created));
  const played = await call("manage_tween", { action: "play", tweenId: created.tweenId });
  if (!played.playing) throw new Error(JSON.stringify(played));
  await call("manage_tween", { action: "pause", tweenId: created.tweenId });
  await call("manage_tween", { action: "resume", tweenId: created.tweenId });
  const cancelled = await call("manage_tween", { action: "cancel" });
  await call("manage_properties", { action: "set", path: `${ROOT}.ProbeModel.ProbeCube`, property: "Transparency", value: 0 });
  return `${created.tweenId} stopped=${cancelled.stopped}`;
});

// -------- manage_audio --------
await test("manage_audio.set_listener", async () => {
  const obj = await call("manage_audio", { action: "set_listener", listenerType: "ObjectPosition", listenerPath: `${ROOT}.ProbeModel.ProbeCube` });
  if (!String(obj.listenerType).includes("ObjectPosition")) throw new Error(JSON.stringify(obj));
  const cam = await call("manage_audio", { action: "set_listener", listenerType: "Camera" });
  if (!String(cam.listenerType).includes("Camera")) throw new Error(JSON.stringify(cam));
  return obj.target;
});

// -------- manage_terrain --------
await test("manage_terrain.colors_get + colors_set", async () => {
  const before = await call("manage_terrain", { action: "colors_get", material: "Grass" });
  if (!before.color?.hex) throw new Error(JSON.stringify(before));
  const set = await call("manage_terrain", { action: "colors_set", material: "Grass", color: [100, 120, 80] });
  if (!set.color?.hex) throw new Error(JSON.stringify(set));
  await call("manage_terrain", { action: "colors_set", material: "Grass", color: before.color.hex });
  return `restored ${before.color.hex}`;
});

await test("manage_terrain.read_voxel + read_voxels", async () => {
  await call("manage_terrain", { action: "fill_block", center: [TX, 8, TX], size: [16, 8, 16], material: "Sand" });
  const one = await call("manage_terrain", { action: "read_voxel", position: [TX, 8, TX] });
  if (one.material !== "Sand") throw new Error(JSON.stringify(one));
  const many = await call("manage_terrain", {
    action: "read_voxels",
    region: { min: [TX - 8, 4, TX - 8], max: [TX + 8, 12, TX + 8] },
  });
  if (!many.materials?.length) throw new Error("no voxel data");
  return `voxel=${one.material} occ=${one.occupancy}`;
});

await test("manage_terrain.write_voxels", async () => {
  const dim = 2; // 8x8x8 studs at res 4
  const mats = [], occ = [];
  for (let x = 0; x < dim; x++) {
    mats[x] = []; occ[x] = [];
    for (let y = 0; y < dim; y++) {
      mats[x][y] = []; occ[x][y] = [];
      for (let z = 0; z < dim; z++) {
        mats[x][y][z] = "Slate";
        occ[x][y][z] = 1;
      }
    }
  }
  const r = await call("manage_terrain", {
    action: "write_voxels",
    region: { min: [TX + 40, 4, TX + 40], max: [TX + 48, 12, TX + 48] },
    materials: mats,
    occupancy: occ,
  });
  if (r.voxels !== 8) throw new Error(JSON.stringify(r));
  const check = await call("manage_terrain", { action: "read_voxel", position: [TX + 42, 6, TX + 42] });
  if (check.material !== "Slate") throw new Error(JSON.stringify(check));
  return `${r.voxels} voxels written`;
});

await test("manage_terrain.generate + smooth", async () => {
  const region = { min: [TX + 80, 0, TX + 80], max: [TX + 144, 40, TX + 144] };
  const gen = await call("manage_terrain", { action: "generate", region, preset: "hills", seed: 42, baseHeight: 16, amplitude: 12 }, 90000);
  if (!gen.ok || gen.voxels <= 0) throw new Error(JSON.stringify(gen));
  const probe = await call("manage_terrain", { action: "read_voxel", position: [TX + 112, 8, TX + 112] });
  if (probe.material === "Air" && probe.occupancy === 0) throw new Error("generate produced no terrain at center");
  const sm = await call("manage_terrain", { action: "smooth", region, intensity: 0.5 }, 90000);
  if (!sm.ok) throw new Error(JSON.stringify(sm));
  return `gen=${gen.voxels}vox smooth=${sm.voxels}vox`;
});

await test("manage_terrain.clear_bounds", async () => {
  const r = await call("manage_terrain", { action: "clear_bounds", min: [TX - 20, 0, TX - 20], max: [TX + 160, 48, TX + 160] }, 90000);
  if (!r.ok) throw new Error(JSON.stringify(r));
  const check = await call("manage_terrain", { action: "read_voxel", position: [TX, 8, TX] });
  if (check.material !== "Air") throw new Error(JSON.stringify(check));
  return "cleared";
});

// -------- spatial_query --------
await test("spatial_query.check_placement", async () => {
  const blocked = await call("spatial_query", {
    action: "check_placement",
    position: [200, 6, 200],
    size: [3, 3, 3],
  });
  if (blocked.canPlace) throw new Error("expected blocked at ProbeCube position");
  const open = await call("spatial_query", {
    action: "check_placement",
    position: [200, 5, 220],
    size: [2, 2, 2],
    checkGround: false,
  });
  if (!open.canPlace) throw new Error(`expected open air placeable: ${JSON.stringify(open.blockers)}`);
  return `blockers=${blocked.blockers.length}`;
});

await test("spatial_query.multi_raycast", async () => {
  const r = await call("spatial_query", {
    action: "multi_raycast",
    rays: [
      { origin: [200, 30, 200], direction: [0, -60, 0] },
      { origin: [200, 30, 220], direction: [0, -60, 0] },
    ],
  });
  if (r.count !== 2 || !r.items[0].hit) throw new Error(JSON.stringify(r).slice(0, 200));
  return `hits=${r.items.filter((i) => i.hit).length}/2`;
});

await test("spatial_query.scan_area", async () => {
  const r = await call("spatial_query", { action: "scan_area", center: [200, 10, 200], size: [24, 40, 24], resolution: 8 });
  if (!r.cells?.length) throw new Error("no cells");
  const withGround = r.cells.filter((c) => c.y != null).length;
  if (!withGround) throw new Error("no ground samples");
  return `${r.cells.length} cells, ${withGround} grounded`;
});

await test("spatial_query.find_flat", async () => {
  const r = await call("spatial_query", {
    action: "find_flat",
    searchArea: { min: [190, 0, 190], max: [214, 20, 214] },
    minSize: [8, 8],
    maxSlope: 15,
    tolerance: 4,
  });
  if (!r.items?.length) throw new Error(`no flat areas found (scanned ${r.scanned})`);
  return `${r.items.length} flat areas, best range=${r.items[0].heightRange}`;
});

await test("spatial_query.find_spawn", async () => {
  const r = await call("spatial_query", {
    action: "find_spawn",
    searchArea: { min: [185, 0, 185], max: [215, 20, 215] },
    count: 3,
    minSpacing: 6,
  });
  if (!r.items?.length) throw new Error("no spawn points");
  return `${r.count} spawns`;
});

await test("spatial_query.analyze_walkable", async () => {
  const r = await call("spatial_query", {
    action: "analyze_walkable",
    area: { min: [192, 0, 192], max: [208, 20, 208] },
    resolution: 4,
  });
  if (!r.totalCells || r.walkableCount === 0) throw new Error(JSON.stringify({ total: r.totalCells, walkable: r.walkableCount }));
  return `${r.walkableCount}/${r.totalCells} walkable`;
});

await test("spatial_query.spatial_map", async () => {
  const r = await call("spatial_query", { action: "spatial_map", rootPath: ROOT, includeModels: true });
  if (!r.items?.length || !r.items.some((i) => i.className === "Model")) throw new Error(JSON.stringify(r).slice(0, 200));
  return `${r.items.length} entries`;
});

await test("spatial_query.find_space", async () => {
  const r = await call("spatial_query", {
    action: "find_space",
    size: [2, 2, 2],
    searchArea: { min: [185, 0, 185], max: [215, 25, 215] },
    padding: 1,
  });
  if (!r.found || !r.items?.length) throw new Error(JSON.stringify(r).slice(0, 200));
  return `pos=${r.items[0].position.map((n) => Math.round(n)).join(",")}`;
});

await test("spatial_query.snap_grid", async () => {
  const r = await call("spatial_query", { action: "snap_grid", path: `${ROOT}.OffGrid`, gridSize: 4 });
  if (!r.after || r.after.x % 4 !== 0 || r.after.z % 4 !== 0) throw new Error(JSON.stringify(r));
  return `snapped to ${r.after.x},${r.after.y},${r.after.z}`;
});

await test("spatial_query.bounds batch", async () => {
  const r = await call("spatial_query", { action: "bounds", paths: [`${ROOT}.ProbeModel`, `${ROOT}.OffGrid`] });
  if (r.items?.length !== 2) throw new Error(JSON.stringify(r).slice(0, 200));
  return `${r.items.length} bounds`;
});

// -------- spatial raycast upgrade --------
await test("spatial_query.raycast with filterList", async () => {
  const noFilter = await call("spatial_query", { action: "raycast", origin: [200, 30, 200], direction: [0, -60, 0] });
  if (!noFilter.hit) throw new Error("expected hit");
  const filtered = await call("spatial_query", {
    action: "raycast",
    origin: [200, 30, 200],
    direction: [0, -8, 0],
    filterList: [ROOT],
    filterType: "Exclude",
  });
  if (filtered.hit && filtered.instance.includes("RoBridgeWeppyParity")) throw new Error("filter ignored");
  return `unfiltered hit ${noFilter.instance}`;
});

// -------- manage_assets --------
let libraryAssetId = null;
await test("manage_assets.export_selection_json", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.ProbeModel`] });
  const r = await call("manage_assets", { action: "export_selection_json", includeProperties: true, includeChildren: true });
  if (!r.items?.[0]?.children?.length) throw new Error(JSON.stringify(r).slice(0, 200));
  return `${r.count} roots, ${r.items[0].children.length} children`;
});

await test("manage_assets.export_path_rbxm + import_rbxm roundtrip", async () => {
  const exp = await call("manage_assets", {
    action: "export_path_rbxm",
    sourcePath: `${ROOT}.ProbeModel`,
    category: "parity-test",
    displayName: "Parity probe",
  });
  if (!exp.assetLibraryAssetId) throw new Error(JSON.stringify(exp).slice(0, 200));
  libraryAssetId = exp.assetLibraryAssetId;
  const imp = await call("manage_assets", {
    action: "import_rbxm",
    category: "parity-test",
    assetLibraryAssetId: libraryAssetId,
    targetParent: ROOT,
    name: "ImportedProbe",
  });
  if (!imp.imported?.length) throw new Error(JSON.stringify(imp).slice(0, 200));
  const check = await call("query_instances", { action: "find_descendant", path: `${ROOT}.ImportedProbe`, name: "ProbeCube" });
  if (!check?.name) throw new Error("imported tree missing ProbeCube");
  await call("mutate_instances", { action: "delete", path: `${ROOT}.ImportedProbe` });
  return `${exp.assetLibraryAssetId} → reimported`;
});

await test("manage_assets.review_model", async () => {
  const r = await call("manage_assets", {
    action: "review_model",
    sourcePath: `${ROOT}.ProbeModel`,
    expectedGroups: ["ProbeBase", "ProbeCube"],
    expectedUse: "decorative",
  });
  if (!r.readiness || !r.stats) throw new Error(JSON.stringify(r).slice(0, 200));
  if (r.readiness === "blocked") throw new Error(`blocked: ${JSON.stringify(r.issues)}`);
  return `readiness=${r.readiness} parts=${r.stats.parts}`;
});

await test("manage_assets.upload_asset requires confirm", async () => {
  const r = await call("manage_assets", { action: "upload_asset", sourcePath: `${ROOT}.ProbeModel` });
  if (r.ok !== false || r.code !== "upload_confirmation_required") throw new Error(JSON.stringify(r).slice(0, 200));
  return r.code;
});

await test("manage_assets.generate_model requires prompt", async () => {
  try {
    await call("manage_assets", { action: "generate_model" });
    throw new Error("expected prompt error");
  } catch (err) {
    if (!err.message.includes("prompt")) throw err;
    return "prompt validation ok";
  }
});

await test("manage_assets.generate_thumbnail", async () => {
  if (!libraryAssetId) throw new Error("no library asset from export test");
  try {
    const r = await call("manage_assets", { action: "generate_thumbnail", category: "parity-test", assetLibraryAssetId: libraryAssetId }, 90000);
    if (!r.thumbnail) throw new Error(JSON.stringify(r).slice(0, 200));
    return r.thumbnail;
  } catch (err) {
    if (/Mesh|Image|Edit-mode|CaptureService/i.test(err.message)) return `skipped (needs Mesh/Image APIs): ${err.message.slice(0, 60)}`;
    throw err;
  }
});

await test("manage_assets.search_insert", async () => {
  try {
    const r = await call("manage_assets", { action: "search_insert", query: "wooden crate", assetType: "Model", parent: ROOT, name: "SearchInserted" }, 90000);
    if (!r.inserted?.length) throw new Error(JSON.stringify(r).slice(0, 200));
    await call("mutate_instances", { action: "delete", path: `${ROOT}.SearchInserted` }).catch(() => {});
    return `inserted assetId=${r.assetId}`;
  } catch (err) {
    if (/Toolbox|HTTP|network|fetch/i.test(err.message)) return `skipped (toolbox unavailable): ${err.message.slice(0, 60)}`;
    throw err;
  }
});

// -------- manage_sync --------
await test("manage_sync.export + status_current_place + progress", async () => {
  const exp = await call("manage_sync", { action: "export_scripts", path: ROOT });
  if (!exp.exported) throw new Error(JSON.stringify(exp));
  const status = await call("manage_sync", { action: "status_current_place" });
  if (!status.lastExport) throw new Error(JSON.stringify(status).slice(0, 200));
  const prog = await call("manage_sync", { action: "progress" });
  if (prog.inProgress !== false) throw new Error(JSON.stringify(prog));
  return `${exp.exported} scripts → ${exp.directory}`;
});

await test("manage_sync.read_file + write_file", async () => {
  const read = await call("manage_sync", { action: "read_file", instancePath: `${ROOT}.DepUser` });
  if (!read.content?.includes("TweenService")) throw new Error(JSON.stringify(read).slice(0, 200));
  const newSrc = read.content + '\nprint("sync-written")';
  const write = await call("manage_sync", { action: "write_file", instancePath: `${ROOT}.DepUser`, content: newSrc });
  if (!write.appliedToStudio) throw new Error(JSON.stringify(write));
  const src = await call("manage_scripts", { action: "get_source", path: `${ROOT}.DepUser` });
  if (!src.source.includes("sync-written")) throw new Error("write_file did not apply to Studio");
  return `${write.bytes} bytes applied`;
});

await test("manage_sync.history + directions", async () => {
  const hist = await call("manage_sync", { action: "history" });
  if (!hist.items?.length) throw new Error("empty history");
  const dir = await call("manage_sync", { action: "directions", directions: { scripts: "two_way" } });
  if (dir.directions.scripts !== "two_way") throw new Error(JSON.stringify(dir));
  await call("manage_sync", { action: "directions", directions: { scripts: "studio_to_file" } });
  return `${hist.items.length} history entries`;
});

// -------- workspace_state --------
await test("workspace_state.sync + metadata + snapshot", async () => {
  const sync = await call("workspace_state", { action: "sync" });
  if (!sync.hierarchy?.length || !sync.metadata?.placeName) throw new Error(JSON.stringify(sync).slice(0, 200));
  const meta = await call("workspace_state", { action: "metadata" });
  if (!meta.serviceCounts) throw new Error(JSON.stringify(meta).slice(0, 200));
  const snap = await call("workspace_state", { action: "snapshot", path: ROOT, maxDepth: 3 });
  if (!snap.root?.children?.length) throw new Error(JSON.stringify(snap).slice(0, 200));
  return `${snap.nodes} nodes, place=${meta.placeName}`;
});

await test("workspace_state.changes + clear_history", async () => {
  await call("workspace_state", { action: "changes" }); // install watcher
  await call("mutate_instances", {
    action: "create",
    className: "Part",
    name: "ChangeProbe",
    parentPath: ROOT,
    properties: { Anchored: true, Position: [204, 10, 204] },
  });
  await new Promise((r) => setTimeout(r, 400));
  const changes = await call("workspace_state", { action: "changes", limit: 50 });
  if (!changes.events?.some((e) => e.path?.includes("ChangeProbe"))) throw new Error(`ChangeProbe not seen in ${changes.events?.length} events`);
  const cleared = await call("workspace_state", { action: "clear_history" });
  if (typeof cleared.cleared !== "number") throw new Error(JSON.stringify(cleared));
  return `${changes.events.length} events, cleared=${cleared.cleared}`;
});

await test("workspace_state.viewport + selection_info + scripts", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.ProbeModel`] });
  const vp = await call("workspace_state", { action: "viewport" });
  if (!vp.camera || !vp.viewportSize || !vp.selectionBounds?.length) throw new Error(JSON.stringify(vp).slice(0, 200));
  const sel = await call("workspace_state", { action: "selection_info" });
  if (!sel.items?.[0]?.bounds) throw new Error(JSON.stringify(sel).slice(0, 200));
  const scripts = await call("workspace_state", { action: "scripts", path: ROOT });
  if (scripts.count < 2) throw new Error(JSON.stringify(scripts).slice(0, 200));
  await call("manage_selection", { action: "clear" });
  return `viewport=${vp.viewportSize.join("x")} scripts=${scripts.count}`;
});

await test("workspace_state.clear_cache", async () => {
  const r = await call("workspace_state", { action: "clear_cache" });
  if (!Array.isArray(r.cleared)) throw new Error(JSON.stringify(r));
  return `cleared: ${r.cleared.join(",") || "(nothing cached)"}`;
});

// -------- system_info --------
await test("system_info.usage", async () => {
  const r = await call("system_info", { action: "usage" });
  if (r.tier !== "free" || !r.tools?.length) throw new Error(JSON.stringify(r).slice(0, 200));
  return `${r.tools.length} tools tracked`;
});

await test("system_info.preflight", async () => {
  const r = await call("system_info", { action: "preflight" });
  if (!r.studioConnected || !r.checks?.length) throw new Error(JSON.stringify(r).slice(0, 200));
  const failing = r.checks.filter((c) => !c.ok).map((c) => c.name);
  return `${r.checks.length} checks, mode=${r.mode}${failing.length ? `, needs: ${failing.join(",")}` : ""}`;
});

// -------- manage_studio --------
await test("manage_studio.toggle_ui_preview", async () => {
  const a = await call("manage_studio", { action: "toggle_ui_preview" });
  const b = await call("manage_studio", { action: "toggle_ui_preview" });
  if (typeof a.enabled !== "boolean" || a.enabled === b.enabled) throw new Error(JSON.stringify({ a, b }));
  return `toggled ${a.enabled} → ${b.enabled}`;
});

await test("manage_studio.test_profile structured manual_required", async () => {
  const r = await call("manage_studio", { action: "test_profile_get" });
  if (r.code !== "player_emulator_manual_required") throw new Error(JSON.stringify(r));
  return r.code;
});

await test("manage_studio.experience_language_get + set", async () => {
  const get = await call("manage_studio", { action: "experience_language_get" });
  if (!get.systemLocaleId) throw new Error(JSON.stringify(get).slice(0, 200));
  const set = await call("manage_studio", { action: "experience_language_set", locale: "fr-fr" });
  if (set.code !== "experience_language_manual_required") throw new Error(JSON.stringify(set));
  return `locale=${get.systemLocaleId}`;
});

// -------- manage_logs --------
await test("manage_logs.get with since", async () => {
  const since = Math.floor(Date.now() / 1000) - 1;
  await call("execute_luau", { code: 'print("weppy-parity-log-marker") return 1' });
  await new Promise((r) => setTimeout(r, 300));
  const r = await call("manage_logs", { action: "get", since, containsFilter: "weppy-parity-log-marker" });
  if (!r.items?.length) throw new Error("marker not found with since filter");
  const none = await call("manage_logs", { action: "get", since: Math.floor(Date.now() / 1000) + 3600, limit: 5 });
  if (none.items?.length) throw new Error("future since returned entries");
  return `${r.items.length} matched`;
});

// -------- cleanup --------
await test("cleanup probe folder", async () => {
  await call("mutate_instances", { action: "delete", path: ROOT }).catch(() => {});
  await call("manage_selection", { action: "clear" }).catch(() => {});
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
