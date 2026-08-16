#!/usr/bin/env node
// Focused live test: Play session lifecycle recovery (stop-before-start, run_test cleanup, honest status).
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
    results.push({ name, ok: true, ms: Date.now() - start, detail: detail == null ? "" : String(detail).slice(0, 200) });
    console.log(`OK   ${name} (${Date.now() - start}ms)${detail != null ? " — " + String(detail).slice(0, 140) : ""}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - start, detail: err.message });
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

await test("get_mode + play_status fields", async () => {
  const mode = await call("manage_studio", { action: "get_mode" });
  const status = await call("manage_studio", { action: "play_status" });
  for (const [name, r] of [
    ["get_mode", mode],
    ["play_status", status],
  ]) {
    if (typeof r.isEdit !== "boolean") throw new Error(`${name} missing isEdit: ${JSON.stringify(r)}`);
    if (typeof r.playConnected !== "boolean") throw new Error(`${name} missing playConnected`);
    if (!r.mode) throw new Error(`${name} missing mode`);
  }
  return `mode=${mode.mode} isEdit=${mode.isEdit} playConnected=${mode.playConnected}`;
});

await test("stop leftover playtest", async () => {
  const r = await call("manage_studio", { action: "play_stop" }, 20000);
  return JSON.stringify({ stopped: r.stopped, playConnected: r.playConnected, isEdit: r.isEdit });
});

await test("play_start recovers leftover Play", async () => {
  const first = await call("manage_studio", { action: "play_start", mode: "play" }, 70000);
  if (first.wedged) throw new Error(first.warning || JSON.stringify(first));
  if (!first.playConnected) throw new Error("first start did not connect play agent: " + JSON.stringify(first));
  const mid = await call("manage_studio", { action: "play_status" });
  if (mid.playConnected !== true) {
    throw new Error("play_status hid leftover Play: " + JSON.stringify(mid));
  }
  const second = await call("manage_studio", { action: "play_start", mode: "play" }, 70000);
  if (second.wedged) throw new Error("second start wedged (recovery failed): " + (second.warning || JSON.stringify(second)));
  if (!second.playConnected) throw new Error("second start did not connect play agent: " + JSON.stringify(second));
  return `first.playConnected=${first.playConnected} second.started=${second.started} second.playConnected=${second.playConnected}`;
});

await test("run_test always stops Play", async () => {
  const r = await call(
    "manage_studio",
    {
      action: "run_test",
      test_name: "LifecycleCleanup",
      timeout: 30,
      mode: "play",
      record: false,
      script: 'print("lifecycle-run-test")',
    },
    90000
  );
  if (!r.passed) throw new Error(JSON.stringify({ timedOut: r.timedOut, failMessage: r.failMessage, logs: r.logs }));
  const after = await call("manage_studio", { action: "play_status" });
  if (after.playConnected) throw new Error("run_test left Play running: " + JSON.stringify(after));
  const mode = await call("manage_studio", { action: "get_mode" });
  if (mode.playConnected) throw new Error("get_mode still reports play after run_test");
  return `passed=${r.passed} after.mode=${mode.mode} isEdit=${mode.isEdit}`;
});

await test("final play_stop", async () => {
  const r = await call("manage_studio", { action: "play_stop" }, 20000);
  return JSON.stringify({ stopped: r.stopped, playConnected: r.playConnected, isEdit: r.isEdit, wedged: r.wedged });
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
