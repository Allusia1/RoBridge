#!/usr/bin/env node
// Live MVP acceptance test against the RoBridge HTTP bridge + connected Studio.
const BASE = `http://127.0.0.1:${process.env.ROBRIDGE_PORT ?? 3737}`;

async function call(tool, args = {}) {
  const res = await fetch(`${BASE}/api/tool`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.result;
}

const results = [];
async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - start, detail: detail == null ? "" : String(detail).slice(0, 160) });
    console.log(`OK   ${name} (${Date.now() - start}ms)${detail != null ? " — " + String(detail).slice(0, 100) : ""}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - start, detail: err.message });
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

const ROOT = "game.Workspace.RoBridgeMVP";

await test("system_info", async () => {
  const r = await call("system_info");
  if (!r.studioConnected) throw new Error("studioConnected=false");
  return `${r.sessions?.[0]?.placeName} v${r.version}`;
});

await test("workspace_state.summary", async () => {
  const r = await call("workspace_state", { action: "summary" });
  if (!r.placeName) throw new Error("missing placeName");
  return `${r.placeName} ${r.descendantCount} instances`;
});

await test("workspace_state.counts", async () => {
  const r = await call("workspace_state", { action: "counts", path: "game.Workspace", topN: 5 });
  return `${r.total} descendants`;
});

await test("query_instances.children", async () => {
  const r = await call("query_instances", { action: "children", path: "game.Workspace", maxResults: 5 });
  if (!Array.isArray(r.items)) throw new Error("no items");
  return `${r.items.length} children`;
});

await test("mutate_instances.create folder", async () => {
  const r = await call("mutate_instances", {
    action: "create",
    className: "Folder",
    parentPath: "game.Workspace",
    name: "RoBridgeMVP",
  });
  return r.path;
});

await test("mutate_instances.create part", async () => {
  const r = await call("mutate_instances", {
    action: "create",
    className: "Part",
    parentPath: ROOT,
    name: "Probe",
    properties: { Size: [4, 4, 4], Position: [20, 8, 20], Anchored: true, Material: "Enum.Material.Neon", Color: "#4f8cff" },
  });
  if (r.className !== "Part") throw new Error("not a Part");
  return r.path;
});

await test("query_instances.get", async () => {
  const r = await call("query_instances", { action: "get", path: `${ROOT}.Probe` });
  if (r.name !== "Probe") throw new Error("wrong name");
  return r.path;
});

await test("query_instances.find_child", async () => {
  const r = await call("query_instances", { action: "find_child", path: ROOT, name: "Probe" });
  if (!r || r.name !== "Probe") throw new Error("not found");
});

await test("query_instances.search_class", async () => {
  const r = await call("query_instances", { action: "search_class", path: ROOT, className: "Part" });
  if (!r.items?.length) throw new Error("empty");
  return r.items.length;
});

await test("query_instances.search_name", async () => {
  const r = await call("query_instances", { action: "search_name", path: ROOT, name: "Probe" });
  if (!r.items?.length) throw new Error("empty");
});

await test("manage_properties.get", async () => {
  const r = await call("manage_properties", { action: "get", path: `${ROOT}.Probe`, property: "Anchored" });
  if (r.Anchored !== true) throw new Error(`Anchored=${r.Anchored}`);
});

await test("manage_properties.set", async () => {
  const r = await call("manage_properties", { action: "set", path: `${ROOT}.Probe`, property: "Transparency", value: 0.25 });
  return JSON.stringify(r);
});

await test("manage_properties.set_attribute + tags", async () => {
  await call("manage_properties", { action: "set_attribute", path: `${ROOT}.Probe`, attribute: "mvp", value: true });
  await call("manage_properties", { action: "add_tag", path: `${ROOT}.Probe`, tag: "RoBridgeMVP" });
  const tags = await call("manage_properties", { action: "get_tags", path: `${ROOT}.Probe` });
  if (!tags.includes("RoBridgeMVP")) throw new Error("tag missing");
});

await test("mutate_instances.clone + rename", async () => {
  await call("mutate_instances", { action: "clone", path: `${ROOT}.Probe`, name: "ProbeClone", parentPath: ROOT });
  const r = await call("mutate_instances", { action: "rename", path: `${ROOT}.ProbeClone`, newName: "ProbeCopy" });
  return r.name;
});

await test("manage_selection.set/get/clear", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.Probe`] });
  const g = await call("manage_selection", { action: "get" });
  if (!g.items?.length) throw new Error("selection empty");
  await call("manage_selection", { action: "clear" });
  return g.items[0].name;
});

await test("manage_scripts.create + get_source + search", async () => {
  await call("manage_scripts", {
    action: "create",
    className: "Script",
    parentPath: ROOT,
    name: "Hello",
    source: 'print("RoBridgeMVP")\nreturn 1',
  });
  const src = await call("manage_scripts", { action: "get_source", path: `${ROOT}.Hello` });
  if (!src.source.includes("RoBridgeMVP")) throw new Error("source mismatch");
  const found = await call("manage_scripts", { action: "search", path: ROOT, query: "RoBridgeMVP" });
  if (!found.items?.length) throw new Error("search miss");
  return `${src.lines} lines`;
});

await test("manage_lighting.get + set_time", async () => {
  const g = await call("manage_lighting", { action: "get" });
  const s = await call("manage_lighting", { action: "set_time", clockTime: 14 });
  return `was ${g.ClockTime} now ${s.ClockTime}`;
});

await test("manage_camera.get + focus", async () => {
  await call("manage_camera", { action: "focus", path: `${ROOT}.Probe`, distance: 16 });
  const g = await call("manage_camera", { action: "get" });
  return JSON.stringify(g.position);
});

await test("manage_effects.create Highlight", async () => {
  const r = await call("manage_effects", {
    action: "create",
    path: `${ROOT}.Probe`,
    effectType: "Highlight",
    name: "Glow",
    properties: { FillColor: "#4f8cff", OutlineColor: "#ffffff" },
  });
  return r.className;
});

await test("manage_physics.anchor", async () => {
  const r = await call("manage_physics", { action: "anchor", path: `${ROOT}.Probe` });
  return `affected ${r.affected}`;
});

await test("spatial_query.raycast", async () => {
  const r = await call("spatial_query", { action: "raycast", origin: [20, 50, 20], direction: [0, -80, 0] });
  return r.hit ? r.instance : "no hit";
});

await test("manage_ui.create_tree + list", async () => {
  const r = await call("manage_ui", {
    action: "create_tree",
    screenGuiName: "RoBridgeMVPGui",
    tree: {
      className: "Frame",
      name: "Root",
      properties: { Size: [0, 200, 0, 80], Position: [0, 20, 0, 20], BackgroundColor3: "#151d2e" },
      children: [{ className: "TextLabel", name: "Title", properties: { Size: [1, 0, 1, 0], Text: "RoBridge MVP", BackgroundTransparency: 1, TextColor3: "#ffffff" } }],
    },
  });
  const list = await call("manage_ui", { action: "list" });
  const found = (list.screenGuis || []).some((g) => g.name === "RoBridgeMVPGui");
  if (!found) throw new Error("ScreenGui not listed");
  return r.parent;
});

await test("manage_tween.play", async () => {
  const r = await call("manage_tween", {
    action: "play",
    path: `${ROOT}.Probe`,
    duration: 0.4,
    goal: { Transparency: 0 },
  });
  return r.playing;
});

await test("manage_audio.create + list", async () => {
  const r = await call("manage_audio", {
    action: "create",
    parentPath: ROOT,
    name: "Beep",
    soundId: 12222216,
    properties: { Volume: 0 },
  });
  const list = await call("manage_audio", { action: "list" });
  return `${r.name} listed=${list.items?.some((s) => s.path.includes("Beep"))}`;
});

await test("manage_animation.create + list", async () => {
  const r = await call("manage_animation", {
    action: "create",
    parentPath: ROOT,
    name: "Wave",
    animationId: 507770239,
  });
  const list = await call("manage_animation", { action: "list" });
  return `${r.name} listed=${!!list.items?.length}`;
});

await test("manage_terrain.get_info + fill_ball", async () => {
  const info = await call("manage_terrain", { action: "get_info" });
  await call("manage_terrain", { action: "fill_ball", center: [200, 4, 200], radius: 6, material: "Grass" });
  return info.maxExtents ? "info+fill" : "fill";
});

await test("manage_assets.search", async () => {
  const r = await call("manage_assets", { action: "search", keyword: "sword", limit: 2 });
  if (!r.items?.length) throw new Error("no marketplace results");
  return r.items[0].name;
});

await test("manage_studio.get_mode", async () => {
  const r = await call("manage_studio", { action: "get_mode" });
  if (r.mode !== "edit") throw new Error(`mode=${r.mode}`);
  return r.placeName;
});

await test("manage_logs.get", async () => {
  const r = await call("manage_logs", { action: "get", limit: 5 });
  return `${r.items?.length ?? 0} entries`;
});

await test("execute_luau", async () => {
  const r = await call("execute_luau", { code: 'return game.Name .. ":" .. #workspace.RoBridgeMVP:GetChildren()' });
  return JSON.stringify(r);
});

await test("batch_execute", async () => {
  const r = await call("batch_execute", {
    commands: [
      { tool: "query_instances", args: { action: "find_child", path: ROOT, name: "Probe" } },
      { tool: "system_info" },
    ],
  });
  if (r.completed !== 2 || r.results.some((x) => !x.ok)) throw new Error(JSON.stringify(r.results));
  return r.completed;
});

await test("manage_sync.export_scripts", async () => {
  const r = await call("manage_sync", { action: "export_scripts", path: ROOT, outDir: "sync" });
  if (!r.exported) throw new Error("exported=0");
  return `${r.exported} -> ${r.directory}`;
});

await test("manage_camera.screenshot + gallery", async () => {
  const cap = await fetch(`${BASE}/api/screenshots/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: `${ROOT}.Probe` }),
  }).then((r) => r.json());
  if (!cap.ok) throw new Error(cap.error);
  const png = await fetch(`${BASE}${cap.url}`);
  if (!png.ok) throw new Error(`png HTTP ${png.status}`);
  const bytes = (await png.arrayBuffer()).byteLength;
  if (bytes < 1000) throw new Error(`png too small (${bytes})`);
  return `${cap.width}x${cap.height} ${bytes}b`;
});

await test("dashboard pages", async () => {
  for (const p of ["/", "/style.css", "/app.js"]) {
    const res = await fetch(BASE + p);
    if (!res.ok) throw new Error(`${p} ${res.status}`);
  }
  const hist = await fetch(BASE + "/api/history?limit=5").then((r) => r.json());
  if (!hist.items?.length) throw new Error("empty history");
  return `${hist.items.length} history`;
});

await test("cleanup delete MVP folder + gui", async () => {
  await call("mutate_instances", { action: "delete", path: ROOT });
  try {
    await call("manage_ui", { action: "delete", path: "game.StarterGui.RoBridgeMVPGui" });
  } catch {
    /* gui may already be gone */
  }
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
