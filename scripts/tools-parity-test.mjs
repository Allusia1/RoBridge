#!/usr/bin/env node
// Live parity suite: new WEPPY/Lemonade-inspired actions against connected Studio.
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

const ROOT = "game.Workspace.RoBridgeParity";

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

await test("cleanup old parity folder", async () => {
  try {
    await call("mutate_instances", { action: "delete", path: ROOT });
  } catch {
    /* ok */
  }
});

await test("system_info.ping", async () => {
  const r = await call("system_info", { action: "ping" });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return `${r.latencyMs}ms`;
});

await test("system_info.place_info", async () => {
  const r = await call("system_info", { action: "place_info" });
  if (!r.placeName) throw new Error("missing placeName");
  return r.placeName;
});

await test("mutate_instances.create_tree", async () => {
  const r = await call("mutate_instances", {
    action: "create_tree",
    parentPath: "game.Workspace",
    tree: {
      className: "Folder",
      name: "RoBridgeParity",
      children: [
        {
          className: "Part",
          name: "Anchor",
          properties: { Size: [3, 3, 3], Position: [40, 6, 40], Anchored: true, Color: "#4f8cff" },
        },
      ],
    },
  });
  if (!r.root || r.instanceCount < 2) throw new Error(JSON.stringify(r));
  return r.root.path;
});

await test("query_instances.ancestors", async () => {
  const r = await call("query_instances", { action: "ancestors", path: `${ROOT}.Anchor` });
  if (!r.items?.some((i) => i.name === "RoBridgeParity" || i.className === "Workspace")) throw new Error(JSON.stringify(r));
  return r.items.length;
});

await test("query_instances.wait_for_child", async () => {
  const r = await call("query_instances", { action: "wait_for_child", path: ROOT, childName: "Anchor", timeout: 3 });
  if (r.name !== "Anchor") throw new Error(JSON.stringify(r));
});

await test("query_instances.search_property", async () => {
  const r = await call("query_instances", {
    action: "search_property",
    path: ROOT,
    propertyName: "Anchored",
    propertyValue: true,
  });
  if (!r.items?.length) throw new Error("no matches");
  return r.items.length;
});

await test("query_instances.search_tag + get_tagged", async () => {
  await call("manage_properties", { action: "add_tag", path: `${ROOT}.Anchor`, tag: "RoBridgeParity" });
  const tagged = await call("query_instances", { action: "search_tag", path: ROOT, tag: "RoBridgeParity" });
  if (!tagged.items?.length) throw new Error("search_tag miss");
  const got = await call("manage_properties", { action: "get_tagged", tag: "RoBridgeParity" });
  if (!got.items?.length) throw new Error("get_tagged miss");
  const check = await call("manage_properties", { action: "check_tag", path: `${ROOT}.Anchor`, tag: "RoBridgeParity" });
  if (!check.has) throw new Error("check_tag false");
});

await test("query_instances.file_tree + project_structure", async () => {
  const tree = await call("query_instances", { action: "file_tree", path: ROOT, maxDepth: 3 });
  if (tree.name !== "RoBridgeParity") throw new Error(JSON.stringify(tree));
  const proj = await call("query_instances", { action: "project_structure" });
  if (!proj.services?.length) throw new Error("no services");
  return `${proj.services.length} services`;
});

await test("mutate_instances.pivot", async () => {
  const r = await call("mutate_instances", { action: "pivot", path: `${ROOT}.Anchor`, position: [42, 7, 42] });
  return r.name;
});

await test("mutate_instances.mass_create + smart_duplicate", async () => {
  const mass = await call("mutate_instances", {
    action: "mass_create",
    instances: [
      { className: "Part", name: "MassA", parentPath: ROOT, properties: { Size: [2, 2, 2], Position: [48, 5, 40], Anchored: true } },
      { className: "Part", name: "MassB", parentPath: ROOT, properties: { Size: [2, 2, 2], Position: [52, 5, 40], Anchored: true } },
    ],
  });
  if (mass.created?.length !== 2) throw new Error(JSON.stringify(mass));
  const dup = await call("mutate_instances", {
    action: "smart_duplicate",
    path: `${ROOT}.MassA`,
    count: 2,
    offset: [0, 0, 4],
  });
  if (dup.created?.length !== 2) throw new Error(JSON.stringify(dup));
  return `mass=${mass.created.length} dup=${dup.created.length}`;
});

await test("mutate_instances.mass_duplicate + mass_delete", async () => {
  const dup = await call("mutate_instances", { action: "mass_duplicate", paths: [`${ROOT}.MassB`] });
  if (!dup.created?.length) throw new Error("mass_duplicate empty");
  const del = await call("mutate_instances", { action: "mass_delete", paths: [dup.created[0].path] });
  if (!del.deleted?.length) throw new Error("mass_delete empty");
});

await test("mutate_instances.scatter", async () => {
  const r = await call("mutate_instances", {
    action: "scatter",
    templatePaths: [`${ROOT}.Anchor`],
    region: { min: [30, -10, 30], max: [50, 80, 50] },
    count: 2,
    seed: 7,
    parentName: "RoBridgeScatterParity",
  });
  if (!r.placed?.length) throw new Error(JSON.stringify(r));
  return `${r.placed.length} in ${r.folder}`;
});

await test("manage_properties aliases + set_relative + mass_set", async () => {
  await call("manage_properties", { action: "set_attr", path: `${ROOT}.Anchor`, attribute: "parity", value: 1 });
  const attrs = await call("manage_properties", { action: "get_attr", path: `${ROOT}.Anchor`, attribute: "parity" });
  if (attrs.parity !== 1) throw new Error(JSON.stringify(attrs));
  await call("manage_properties", { action: "delete_attr", path: `${ROOT}.Anchor`, attribute: "parity" });
  const rel = await call("manage_properties", { action: "set_relative", path: `${ROOT}.Anchor`, property: "Transparency", value: 0.1 });
  if (typeof rel.Transparency !== "number") throw new Error(JSON.stringify(rel));
  const mass = await call("manage_properties", {
    action: "mass_set",
    paths: [`${ROOT}.MassA`, `${ROOT}.MassB`],
    properties: { Material: "Enum.Material.Neon" },
  });
  if (mass.updated?.length !== 2) throw new Error(JSON.stringify(mass));
  const kids = await call("manage_properties", {
    action: "modify_children",
    path: ROOT,
    className: "Part",
    properties: { CastShadow: false },
  });
  return `kids=${kids.updated}`;
});

await test("manage_scripts.validate + edit_replace + delete", async () => {
  await call("manage_scripts", {
    action: "create",
    className: "Script",
    parentPath: ROOT,
    name: "ParityScript",
    source: 'print("parity-old")\nreturn 1',
  });
  const ok = await call("manage_scripts", { action: "validate", path: `${ROOT}.ParityScript` });
  if (!ok.valid) throw new Error(ok.error);
  const edited = await call("manage_scripts", {
    action: "edit_replace",
    path: `${ROOT}.ParityScript`,
    query: "parity-old",
    replacement: "parity-new",
  });
  const src = await call("manage_scripts", { action: "get_source", path: `${ROOT}.ParityScript` });
  if (!src.source.includes("parity-new")) throw new Error(src.source);
  await call("manage_scripts", { action: "edit_insert", path: `${ROOT}.ParityScript`, startLine: 1, source: "-- header" });
  const del = await call("manage_scripts", { action: "delete", path: `${ROOT}.ParityScript` });
  return `${edited.lines} then ${del.deleted}`;
});

await test("manage_lighting.atmosphere + sky + mood", async () => {
  const atm = await call("manage_lighting", { action: "atmosphere", properties: { Density: 0.25 }, createIfMissing: true });
  if (atm.className !== "Atmosphere") throw new Error(JSON.stringify(atm));
  const sky = await call("manage_lighting", { action: "sky", createIfMissing: true });
  if (sky.className !== "Sky") throw new Error(JSON.stringify(sky));
  const mood = await call("manage_lighting", { action: "mood", mood: "day" });
  if (mood.mood !== "day") throw new Error(JSON.stringify(mood));
  return mood.mood;
});

await test("manage_camera.focus_position + info", async () => {
  await call("manage_camera", { action: "focus_position", lookAt: [42, 7, 42], distance: 18 });
  const info = await call("manage_camera", { action: "info" });
  if (!info.position) throw new Error(JSON.stringify(info));
});

await test("manage_terrain.fill_wedge + replace_material + clear_region", async () => {
  await call("manage_terrain", { action: "fill_wedge", center: [320, 4, 320], size: [12, 8, 12], material: "Sand" });
  await call("manage_terrain", {
    action: "replace_material",
    center: [320, 4, 320],
    size: [16, 12, 16],
    fromMaterial: "Sand",
    material: "Grass",
  });
  await call("manage_terrain", { action: "clear_region", center: [320, 4, 320], size: [20, 16, 20] });
  return "ok";
});

await test("spatial_query.find_ground + bounds", async () => {
  const g = await call("spatial_query", { action: "find_ground", x: 42, z: 42 });
  if (!g.hit) throw new Error("no ground");
  const b = await call("spatial_query", { action: "bounds", path: `${ROOT}.Anchor` });
  if (!b.size) throw new Error(JSON.stringify(b));
  return `y=${g.height}`;
});

await test("manage_effects.emit + toggle", async () => {
  await call("manage_effects", {
    action: "create",
    path: `${ROOT}.Anchor`,
    effectType: "ParticleEmitter",
    name: "Sparks",
    properties: { Rate: 0, Enabled: true },
  });
  const emitted = await call("manage_effects", { action: "emit", path: `${ROOT}.Anchor`, count: 8 });
  if (!emitted.emitted) throw new Error(JSON.stringify(emitted));
  const tog = await call("manage_effects", { action: "toggle", path: `${ROOT}.Anchor` });
  return `emit=${emitted.emitted} tog=${tog.toggled}`;
});

await test("manage_physics.collision groups", async () => {
  const g = await call("manage_physics", { action: "register_group", group: "RoBridgeParity" });
  if (g.group !== "RoBridgeParity") throw new Error(JSON.stringify(g));
  const groups = await call("manage_physics", { action: "get_groups" });
  if (!groups.groups) throw new Error(JSON.stringify(groups));
});

await test("manage_audio.pause + resume", async () => {
  const s = await call("manage_audio", {
    action: "create",
    parentPath: ROOT,
    name: "ParityTone",
    soundId: 12222216,
    properties: { Volume: 0 },
  });
  await call("manage_audio", { action: "play", path: s.path });
  await call("manage_audio", { action: "pause", path: s.path });
  await call("manage_audio", { action: "resume", path: s.path });
  await call("manage_audio", { action: "stop", path: s.path });
  return s.name;
});

await test("manage_tween.pause + cancel", async () => {
  await call("manage_tween", { action: "play", path: `${ROOT}.Anchor`, duration: 2, goal: { Transparency: 0.5 } });
  const paused = await call("manage_tween", { action: "pause" });
  const cancelled = await call("manage_tween", { action: "cancel" });
  return `paused=${paused.paused} cancelled=${cancelled.stopped}`;
});

await test("manage_selection.remove + details", async () => {
  await call("manage_selection", { action: "set", paths: [`${ROOT}.Anchor`, `${ROOT}.MassA`] });
  await call("manage_selection", { action: "remove", paths: [`${ROOT}.MassA`] });
  const d = await call("manage_selection", { action: "details" });
  if (!d.items?.length) throw new Error("details empty");
  await call("manage_selection", { action: "clear" });
  return d.items[0].name;
});

await test("manage_logs.errors", async () => {
  const r = await call("manage_logs", { action: "errors", limit: 5 });
  if (!Array.isArray(r.items)) throw new Error(JSON.stringify(r));
  return r.items.length;
});

await test("manage_studio.play_pause structured", async () => {
  const r = await call("manage_studio", { action: "play_pause" });
  if (r.ok !== true && r.code !== "play_pause_manual_required") throw new Error(JSON.stringify(r));
  return r.ok ? r.method : r.code;
});

await test("manage_studio.get_mode reports play fields", async () => {
  const r = await call("manage_studio", { action: "get_mode" });
  if (typeof r.isEdit !== "boolean") throw new Error("missing isEdit: " + JSON.stringify(r));
  if (typeof r.playConnected !== "boolean") throw new Error("missing playConnected: " + JSON.stringify(r));
  if (!r.mode) throw new Error("missing mode: " + JSON.stringify(r));
  return `${r.mode} isEdit=${r.isEdit} playConnected=${r.playConnected}`;
});

await test("manage_studio.play_status leftover play fields", async () => {
  const r = await call("manage_studio", { action: "play_status" });
  if (typeof r.isEdit !== "boolean") throw new Error("missing isEdit: " + JSON.stringify(r));
  if (typeof r.playConnected !== "boolean") throw new Error("missing playConnected");
  if (!r.mode) throw new Error("missing mode");
  return `${r.mode} isEdit=${r.isEdit} playConnected=${r.playConnected}`;
});

await test("play_start stop-before-start recovery", async () => {
  const first = await call("manage_studio", { action: "play_start", mode: "play" }, 70000);
  if (first.wedged) throw new Error(first.warning || JSON.stringify(first));
  if (!first.started && !first.playConnected) throw new Error("first start failed: " + JSON.stringify(first));
  const second = await call("manage_studio", { action: "play_start", mode: "play" }, 70000);
  if (second.wedged) throw new Error(second.warning || JSON.stringify(second));
  if (!second.started && !second.playConnected) throw new Error("second start failed (recovery): " + JSON.stringify(second));
  const status = await call("manage_studio", { action: "play_status" });
  const stopped = await call("manage_studio", { action: "play_stop" }, 20000);
  const after = await call("manage_studio", { action: "play_status" });
  if (after.playConnected) throw new Error("play still connected after stop: " + JSON.stringify(after));
  return `second.started=${second.started} midPlay=${status.playConnected} stopped=${stopped.stopped} after.isEdit=${after.isEdit}`;
});

await test("batch_execute waypoint + stopOnError", async () => {
  const r = await call("batch_execute", {
    waypoint: "parity-batch",
    stopOnError: true,
    commands: [
      { tool: "query_instances", args: { action: "find_child", path: ROOT, name: "Anchor" } },
      { tool: "system_info", args: { action: "connection" } },
    ],
  });
  if (r.completed !== 2 || r.failed !== 0) throw new Error(JSON.stringify(r));
  return r.waypoint;
});

await test("manage_studio.run_test", async () => {
  const r = await call(
    "manage_studio",
    {
      action: "run_test",
      test_name: "ParitySmoke",
      timeout: 45,
      mode: "play",
      script: 'print("parity-run-test-body")',
    },
    90000
  );
  if (!r.passed) throw new Error(JSON.stringify({ timedOut: r.timedOut, failMessage: r.failMessage, logs: r.logs }));
  if (!r.reportPath) throw new Error("missing reportPath");
  const after = await call("manage_studio", { action: "play_status" });
  if (after.playConnected) throw new Error("run_test left Play running: " + JSON.stringify(after));
  return r.reportPath;
});

await test("cleanup parity folder + scatter", async () => {
  try {
    await call("mutate_instances", { action: "delete", path: ROOT });
  } catch {
    /* ok */
  }
  try {
    await call("mutate_instances", { action: "delete", path: "game.Workspace.RoBridgeScatterParity" });
  } catch {
    /* ok */
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
