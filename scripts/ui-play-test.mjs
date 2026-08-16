#!/usr/bin/env node
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
    results.push({ name, ok: true, detail });
    console.log(`OK   ${name} (${Date.now() - start}ms) ${detail != null ? "— " + String(detail).slice(0, 120) : ""}`);
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

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
  await new Promise((r) => setTimeout(r, 800));
});

await test("cleanup old test gui", async () => {
  try {
    await call("manage_ui", { action: "delete", path: "game.StarterGui.RoBridgeMenu" });
  } catch {
    /* ok */
  }
  try {
    await call("manage_ui", { action: "hide_preview" });
  } catch {
    /* ok */
  }
});

await test("design_brief + create", async () => {
  const r = await call("manage_ui", {
    action: "design_brief",
    kind: "menu",
    brief: "RoBridge UI Test",
    create: true,
  });
  if (!r.created?.parent) throw new Error(JSON.stringify(r));
  return r.created.parent;
});

await test("add click logger LocalScript", async () => {
  await call("manage_scripts", {
    action: "create",
    className: "LocalScript",
    parentPath: "game.StarterGui.RoBridgeMenu",
    name: "ClickLogger",
    source: `local gui = script.Parent
local function mark(name)
  gui:SetAttribute("LastClick", name)
  print("[RoBridgeUI] " .. name .. " clicked")
end
local btn = gui:WaitForChild("Root"):WaitForChild("PrimaryButton")
btn.Activated:Connect(function() mark("PrimaryButton") end)
btn.MouseButton1Click:Connect(function() mark("PrimaryButton") end)
btn:GetAttributeChangedSignal("RoBridgeClicked"):Connect(function() mark("PrimaryButton") end)
`,
  });
});

await test("list_interactive", async () => {
  const r = await call("manage_ui", { action: "list_interactive", path: "game.StarterGui.RoBridgeMenu" });
  const names = (r.items || []).map((i) => i.name);
  if (!names.includes("PrimaryButton")) throw new Error("PrimaryButton missing: " + names.join(","));
  return names.join(",");
});

await test("click PrimaryButton (edit Activate)", async () => {
  const r = await call("manage_ui", { action: "click", path: "game.StarterGui.RoBridgeMenu.Root.PrimaryButton" });
  if (!r.clicked) throw new Error(JSON.stringify(r));
  return r.method + " " + r.mode;
});

await test("type_text Input", async () => {
  const r = await call("manage_ui", {
    action: "type_text",
    path: "game.StarterGui.RoBridgeMenu.Root.Input",
    text: "hello-mvp",
  });
  if (r.text !== "hello-mvp") throw new Error(JSON.stringify(r));
  return r.text;
});

await test("update title", async () => {
  const r = await call("manage_ui", {
    action: "update",
    path: "game.StarterGui.RoBridgeMenu.Root.Title",
    properties: { Text: "Updated Title" },
  });
  return r.name;
});

await test("check heuristics", async () => {
  const r = await call("manage_ui", { action: "check", path: "game.StarterGui.RoBridgeMenu" });
  return `${r.issueCount} issues`;
});

await test("preview + hide", async () => {
  const p = await call("manage_ui", { action: "preview", path: "game.StarterGui.RoBridgeMenu" });
  await call("manage_ui", { action: "hide_preview" });
  return p.previewed;
});

await test("manage_input click_path edit", async () => {
  const r = await call("manage_input", { action: "click_path", path: "game.StarterGui.RoBridgeMenu.Root.SecondaryButton" });
  return r.method;
});

console.log("\n--- playtest ---");

await test("play_start", async () => {
  const r = await call("manage_studio", { action: "play_start", mode: "play" }, 45000);
  return JSON.stringify(r);
});

await test("play_status", async () => {
  const r = await call("manage_studio", { action: "play_status" });
  return JSON.stringify(r);
});

await test("list_interactive play", async () => {
  const r = await call("manage_ui", { action: "list_interactive" });
  return JSON.stringify(r).slice(0, 200);
});

await test("click PrimaryButton play", async () => {
  const r = await call("manage_ui", { action: "click", path: "RoBridgeMenu.Root.PrimaryButton" });
  if (!r.clicked) throw new Error(JSON.stringify(r));
  return JSON.stringify(r);
});

await test("type_text play", async () => {
  const r = await call("manage_ui", { action: "type_text", path: "RoBridgeMenu.Root.Input", text: "play-ok" });
  return JSON.stringify(r);
});

await test("manage_logs after play click", async () => {
  const r = await call("manage_logs", { action: "get", limit: 40, containsFilter: "RoBridgeUI" });
  if ((r.items?.length || 0) > 0) return `${r.items.length} matching (${r.source || "edit"})`;
  const inspect = await call("manage_ui", { action: "inspect", path: "RoBridgeMenu" });
  if (inspect.lastClick === "PrimaryButton") return "attribute LastClick=PrimaryButton";
  throw new Error("No RoBridgeUI logs and LastClick=" + inspect.lastClick);
});

await test("play_stop", async () => {
  const r = await call("manage_studio", { action: "play_stop" }, 20000);
  return JSON.stringify(r);
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  for (const f of failed) console.log("  FAIL", f.name, f.detail);
  process.exit(1);
}
