#!/usr/bin/env node
// Fails if MCP-exported action enums/params drift from the HTTP catalog or from handler code.
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist", "index.js");
const TOOLS_DIR = path.join(ROOT, "src", "tools");

/** Actions Cursor's stale catalog historically omitted — must stay in the shipped schema. */
const REQUIRED = {
  manage_studio: [
    "get_mode",
    "play_status",
    "play_start",
    "play_stop",
    "play_pause",
    "play_resume",
    "run_test",
    "toggle_ui_preview",
    "test_profile_get",
    "test_profile_set",
    "test_profile_reset",
    "experience_language_get",
    "experience_language_set",
    "undo",
    "redo",
    "set_waypoint",
    "save_prompt",
  ],
  manage_scripts: [
    "get_source",
    "set_source",
    "create",
    "delete",
    "list",
    "search",
    "replace",
    "edit_lines",
    "edit_replace",
    "edit_insert",
    "edit_delete",
    "validate",
    "get_dependencies",
  ],
  manage_camera: ["get", "info", "set", "focus", "screenshot", "record", "record_stop"],
  manage_properties: ["get", "set", "set_many", "set_multiple", "mass_set", "get_tagged"],
  system_info: ["info", "ping", "connection", "place_info", "services", "usage", "preflight"],
  manage_logs: ["get", "errors", "clear"],
  manage_input: ["click_at", "click_path", "walk_and_click"],
};

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}
function ok(msg) {
  console.log(`OK    ${msg}`);
}

function unique(list) {
  return [...new Set(list)];
}

function sameSet(a, b) {
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function diff(a, b) {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function jsonEnums(prop) {
  if (!prop || typeof prop !== "object") return [];
  if (Array.isArray(prop.enum)) return prop.enum.filter((v) => typeof v === "string");
  if (Array.isArray(prop.anyOf)) return prop.anyOf.flatMap(jsonEnums);
  if (Array.isArray(prop.oneOf)) return prop.oneOf.flatMap(jsonEnums);
  return [];
}

async function dumpCatalog() {
  const proc = spawn(process.execPath, [DIST, "--dump-catalog"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve) => proc.on("close", resolve));
  if (code !== 0) {
    throw new Error(`--dump-catalog exited ${code}: ${stderr || stdout}`);
  }
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`--dump-catalog produced no JSON: ${stdout || stderr}`);
  return JSON.parse(stdout.slice(start));
}

async function parseHandlers() {
  const files = (await readdir(TOOLS_DIR)).filter((f) => f.endsWith(".ts"));
  const tools = [];
  for (const file of files) {
    const src = await readFile(path.join(TOOLS_DIR, file), "utf8");
    const found = [];
    const re = /defineTool\(\s*ctx,\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) found.push({ name: m[1], index: m.index });
    for (let i = 0; i < found.length; i++) {
      const block = src.slice(found[i].index, i + 1 < found.length ? found[i + 1].index : src.length);
      const enumMatch = block.match(/action:\s*z(?:\s*\n\s*)?\.enum\(\[([\s\S]*?)\]\)/);
      const schemaActions = enumMatch ? unique([...enumMatch[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1])) : [];
      const handlerStart = block.search(/async\s*\(args/);
      const handlerBody = handlerStart >= 0 ? block.slice(handlerStart) : block;
      const handlerActions = unique(
        [
          ...handlerBody.matchAll(/(?<!typeof\s)(?:args\.action|A\.action)\s*===?\s*"([a-z0-9_]+)"/g),
          ...handlerBody.matchAll(/(?<![.\w])action\s*===?\s*"([a-z0-9_]+)"/g),
        ].map((x) => x[1])
      );
      const mentioned = new Set([...handlerBody.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]));
      tools.push({ name: found[i].name, file, schemaActions, handlerActions, mentioned });
    }
  }
  return tools;
}

function envWithPort(port) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null) env[key] = value;
  }
  env.ROBRIDGE_PORT = port;
  return env;
}

async function mcpSnapshot() {
  const port = String(38000 + Math.floor(Math.random() * 1000));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST],
    env: envWithPort(port),
    cwd: ROOT,
  });
  const client = new Client({ name: "schema-parity", version: "0.0.1" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  let http = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tools`);
      if (res.ok) {
        http = await res.json();
        break;
      }
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await client.close();
  return { port, tools, http };
}

const dump = await dumpCatalog();
const dumpTools = new Map(dump.tools.map((t) => [t.name, t]));
ok(`dump-catalog: ${dump.toolCount} tools (v${dump.version})`);

if (dump.toolCount < 24) fail(`expected at least 24 tools, dump has ${dump.toolCount}`);
if (!dumpTools.has("manage_input")) fail("dump-catalog missing manage_input");

const handlers = await parseHandlers();
const handlerNames = new Set(handlers.map((t) => t.name));
for (const name of dumpTools.keys()) {
  if (!handlerNames.has(name)) fail(`dump tool ${name} has no defineTool() in src/tools`);
}

for (const tool of handlers) {
  const catalog = dumpTools.get(tool.name);
  if (!catalog) {
    fail(`${tool.name}: defineTool in ${tool.file} missing from dump-catalog`);
    continue;
  }
  if (tool.schemaActions.length && !sameSet(tool.schemaActions, catalog.actions)) {
    fail(
      `${tool.name}: source z.enum [${tool.schemaActions.join(",")}] != dump [${catalog.actions.join(",")}]`
    );
  }
  const missingFromSchema = diff(tool.handlerActions, catalog.actions);
  if (missingFromSchema.length) {
    fail(`${tool.name}: handler actions not in MCP schema: ${missingFromSchema.join(", ")}`);
  }
  const missingFromHandler = diff(catalog.actions, [...tool.handlerActions, ...tool.mentioned]);
  if (missingFromHandler.length) {
    console.log(`NOTE  ${tool.name}: schema aliases with no quoted handler ref (fallthrough OK): ${missingFromHandler.join(", ")}`);
  }
}

for (const [name, required] of Object.entries(REQUIRED)) {
  const catalog = dumpTools.get(name);
  if (!catalog) {
    fail(`required tool missing from catalog: ${name}`);
    continue;
  }
  const missing = diff(required, catalog.actions);
  if (missing.length) fail(`${name}: catalog missing required actions: ${missing.join(", ")}`);
  else ok(`${name}: required actions present (${catalog.actions.length})`);
}

const studio = dumpTools.get("manage_studio");
if (studio) {
  for (const param of ["script", "test_name", "timeout", "mode", "record", "recordSeconds", "recordPath", "testSource", "testName", "enabled", "testProfile", "locale"]) {
    if (!studio.params.includes(param)) fail(`manage_studio missing param ${param}`);
  }
}

const { tools: mcpTools, http } = await mcpSnapshot();
ok(`MCP tools/list: ${mcpTools.length} tools`);
if (!http) {
  fail("HTTP /api/tools did not respond on the MCP child's port");
} else {
  ok(`HTTP /api/tools: ${http.toolCount} tools`);
  if (http.toolCount !== dump.toolCount) fail(`HTTP toolCount ${http.toolCount} != dump ${dump.toolCount}`);
}

const mcpByName = new Map(mcpTools.map((t) => [t.name, t]));
for (const [name, catalog] of dumpTools) {
  const mcp = mcpByName.get(name);
  if (!mcp) {
    fail(`MCP tools/list missing ${name}`);
    continue;
  }
  const props = mcp.inputSchema?.properties ?? {};
  const mcpActions = jsonEnums(props.action);
  const mcpParams = Object.keys(props);
  if (!sameSet(mcpActions, catalog.actions)) {
    fail(`${name}: MCP enum [${mcpActions.join(",")}] != dump [${catalog.actions.join(",")}]`);
  }
  const missingParams = diff(catalog.params, mcpParams);
  if (missingParams.length) {
    fail(`${name}: MCP schema missing params: ${missingParams.join(", ")}`);
  }
  if (http?.toolActions && !sameSet(http.toolActions[name] || [], catalog.actions)) {
    fail(`${name}: HTTP toolActions != dump catalog`);
  }
}

for (const name of mcpByName.keys()) {
  if (name === "mcp_auth") continue;
  if (!dumpTools.has(name)) fail(`MCP tools/list has extra tool ${name} not in dump-catalog`);
}

const generatedPath = path.join(ROOT, "web", "lib", "catalog.generated.json");
try {
  const generated = JSON.parse(await readFile(generatedPath, "utf8"));
  const genTools = new Map((generated.tools || []).map((t) => [t.name, t]));
  if (genTools.size !== dumpTools.size) {
    fail(`web/lib/catalog.generated.json has ${genTools.size} tools, dump-catalog has ${dumpTools.size}. Run: node scripts/extract-tool-catalog.mjs`);
  }
  for (const [name, catalog] of dumpTools) {
    const gen = genTools.get(name);
    if (!gen) {
      fail(`docs catalog missing ${name}. Run: node scripts/extract-tool-catalog.mjs`);
      continue;
    }
    const genActions = gen.actions?.length ? gen.actions : gen.params?.find((p) => p.name === "action")?.enum || [];
    if (!sameSet(genActions, catalog.actions)) {
      fail(`${name}: docs catalog actions [${genActions.join(",")}] != dump [${catalog.actions.join(",")}]`);
    }
  }
  ok(`docs catalog.generated.json matches dump-catalog (${genTools.size} tools)`);
} catch (err) {
  if (err && err.code === "ENOENT") {
    console.log("NOTE  web/lib/catalog.generated.json not present — skipped docs catalog check");
  } else {
    fail(`docs catalog check: ${err instanceof Error ? err.message : err}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} schema parity failure(s)`);
  process.exit(1);
}
console.log("\nSchema parity OK — MCP, HTTP /api/tools, dump-catalog, and handlers agree.");
