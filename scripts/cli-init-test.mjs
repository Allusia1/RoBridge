#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  assertNode18,
  formatHelp,
  inspectMcpRoBridgeEntry,
  looksLikeOfficialStudioMcpSpawn,
  mcpConfigHasOfficialStudioServer,
  officialStudioMcpDoctorHint,
  isCliCommand,
  mergeMcpServerConfig,
  mcpSpawn,
  nodeMajor,
  nodeVersionIsSupported,
  pathEndsWithDistIndex,
  pickDoctorNext,
  runDoctor,
  studioFromStatusJson,
  writeClaudeDesktopConfig,
  writeCursorMcpConfigs,
  writeVscodeMcpConfig,
} from "../dist/cli.js";

test("CLI commands are recognized; empty argv is not a CLI command", () => {
  assert.equal(isCliCommand(["init"]), true);
  assert.equal(isCliCommand(["install"]), true);
  assert.equal(isCliCommand(["install-plugin"]), true);
  assert.equal(isCliCommand(["mcp"]), true);
  assert.equal(isCliCommand(["doctor"]), true);
  assert.equal(isCliCommand(["--help"]), true);
  assert.equal(isCliCommand([]), false);
  assert.equal(isCliCommand(["--dump-catalog"]), false);
});

test("Node 18+ check", () => {
  assert.equal(nodeMajor("22.20.0"), 22);
  assert.doesNotThrow(() => assertNode18("18.0.0"));
  assert.throws(() => assertNode18("16.20.2"), /Install Node 18\+/);
});

test("MCP spawn uses the absolute Node binary, not bare node", () => {
  const spawn = mcpSpawn("/abs/RoBridge/dist/index.js", "/usr/local/bin/node");
  assert.equal(spawn.command, "/usr/local/bin/node");
  assert.notEqual(spawn.command, "node");
  assert.deepEqual(spawn.args, ["/abs/RoBridge/dist/index.js"]);
  assert.equal(mcpSpawn().command, process.execPath);
});

test("help lists dummy-proof commands and does not tell users to start the server", () => {
  const help = formatHelp("/abs/dist/index.js");
  assert.match(help, /npx robridge init/);
  assert.match(help, /install-plugin/);
  assert.match(help, /\bmcp\b/);
  assert.match(help, /npx robridge doctor/);
  assert.match(help, /Settings → MCP/);
  assert.match(help, /Official Studio MCP is optional/);
  assert.match(help, /First run:\s*\n\s*npm install\s*$/m);
  assert.doesNotMatch(help, /npm install && npm run build/);
  assert.doesNotMatch(help, /node dist\/index\.js\s*$/m);
});

test("postinstall skips when CI is set", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "postinstall.mjs")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /postinstall skipped: CI environment/);
});

test("merge creates a file and overwrites only the RoBridge entry", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-mcp-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(
    file,
    JSON.stringify({
      mcpServers: {
        keepMe: { command: "npx", args: ["other"] },
        Roblox_Studio: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" },
        RoBridge: { command: "node", args: ["/old/dist/index.js"] },
      },
    }),
    "utf8",
  );

  const result = await mergeMcpServerConfig(file, {
    command: "/bin/node",
    args: ["/new/dist/index.js"],
  });
  assert.equal(result.created, false);
  assert.equal(result.backedUp, false);

  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(parsed.mcpServers.keepMe, { command: "npx", args: ["other"] });
  assert.deepEqual(parsed.mcpServers.Roblox_Studio, {
    command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP",
  });
  assert.deepEqual(parsed.mcpServers.RoBridge, {
    command: "/bin/node",
    args: ["/new/dist/index.js"],
  });
});

test("malformed config is backed up once then replaced", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-mcp-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(file, "{ not json", "utf8");

  const first = await mergeMcpServerConfig(file, { command: "/bin/node", args: ["/x"] });
  assert.equal(first.backedUp, true);
  assert.equal(await readFile(`${file}.bak`, "utf8"), "{ not json");

  await writeFile(file, "{ still bad", "utf8");
  const second = await mergeMcpServerConfig(file, { command: "/bin/node", args: ["/y"] });
  assert.equal(second.backedUp, false);
  assert.equal(await readFile(`${file}.bak`, "utf8"), "{ not json");

  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.equal(parsed.mcpServers.RoBridge.args[0], "/y");
});

test("Cursor + Claude Desktop helpers write without wiping sibling keys", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-mcp-"));
  const userPath = path.join(dir, "home", ".cursor", "mcp.json");
  const projectPath = path.join(dir, "repo", ".cursor", "mcp.json");
  const desktopPath = path.join(dir, "Claude", "claude_desktop_config.json");
  await mkdir(path.dirname(desktopPath), { recursive: true });
  await writeFile(
    desktopPath,
    JSON.stringify({ mcpServers: { Other: { url: "https://example" } }, preferences: { a: 1 } }),
    "utf8",
  );

  const spawn = { command: process.execPath, args: ["/abs/dist/index.js"] };
  const cursor = await writeCursorMcpConfigs(spawn, { userPath, projectPath });
  assert.equal(cursor.user.created, true);
  assert.equal(cursor.project.created, true);

  const desktop = await writeClaudeDesktopConfig(spawn, {
    configPath: desktopPath,
    requireAppDir: true,
  });
  assert.equal(desktop.status, "written");
  const desktopJson = JSON.parse(await readFile(desktopPath, "utf8"));
  assert.equal(desktopJson.preferences.a, 1);
  assert.deepEqual(desktopJson.mcpServers.Other, { url: "https://example" });
  assert.equal(desktopJson.mcpServers.RoBridge.command, process.execPath);
});

test("VS Code Copilot merge uses servers (not mcpServers) and keeps siblings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-vscode-"));
  const file = path.join(dir, ".vscode", "mcp.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      inputs: [{ id: "keep" }],
      servers: {
        keepMe: { type: "stdio", command: "npx", args: ["other"] },
        RoBridge: { type: "stdio", command: "node", args: ["/old"] },
      },
    }),
    "utf8",
  );

  const spawn = { command: process.execPath, args: ["/abs/dist/index.js"] };
  const result = await writeVscodeMcpConfig(spawn, { projectPath: file });
  assert.equal(result.created, false);
  assert.equal(result.backedUp, false);

  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(parsed.inputs, [{ id: "keep" }]);
  assert.deepEqual(parsed.servers.keepMe, { type: "stdio", command: "npx", args: ["other"] });
  assert.equal(parsed.mcpServers, undefined);
  assert.deepEqual(parsed.servers.RoBridge, {
    type: "stdio",
    command: process.execPath,
    args: ["/abs/dist/index.js"],
  });
});

test("malformed VS Code mcp.json is backed up once then replaced with servers.RoBridge", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-vscode-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(file, "{ not json", "utf8");

  const spawn = { command: "/bin/node", args: ["/x"] };
  const first = await writeVscodeMcpConfig(spawn, { projectPath: file });
  assert.equal(first.backedUp, true);
  assert.equal(await readFile(`${file}.bak`, "utf8"), "{ not json");

  const parsed = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(parsed.servers.RoBridge, {
    type: "stdio",
    command: "/bin/node",
    args: ["/x"],
  });
  assert.equal(parsed.mcpServers, undefined);
});

test("doctor pathEndsWithDistIndex accepts any dist/index.js path", () => {
  assert.equal(pathEndsWithDistIndex("/Users/me/RoBridge/dist/index.js"), true);
  assert.equal(pathEndsWithDistIndex("C:\\Users\\me\\RoBridge\\dist\\index.js"), true);
  assert.equal(pathEndsWithDistIndex("dist/index.js"), true);
  assert.equal(pathEndsWithDistIndex("/Users/me/RoBridge/src/index.js"), false);
});

test("doctor inspects mcpServers.RoBridge for dist/index.js and bare node", () => {
  const ok = inspectMcpRoBridgeEntry({
    mcpServers: { RoBridge: { command: "/usr/bin/node", args: ["/abs/dist/index.js"] } },
  });
  assert.equal(ok.present, true);
  assert.equal(ok.pointsAtDist, true);
  assert.equal(ok.bareNode, false);

  const bare = inspectMcpRoBridgeEntry({
    mcpServers: { RoBridge: { command: "node", args: ["/abs/dist/index.js"] } },
  });
  assert.equal(bare.pointsAtDist, true);
  assert.equal(bare.bareNode, true);

  const missing = inspectMcpRoBridgeEntry({ mcpServers: { other: { command: "npx" } } });
  assert.equal(missing.present, false);
  assert.equal(missing.pointsAtDist, false);
});

test("doctor studioFromStatusJson reads studioConnected and sessions", () => {
  assert.deepEqual(studioFromStatusJson({ studioConnected: true }), { connected: true });
  assert.deepEqual(studioFromStatusJson({ studioConnected: false }), { connected: false });
  assert.deepEqual(
    studioFromStatusJson({ bridge: { sessions: [{ connected: true }] } }),
    { connected: true },
  );
  assert.equal(studioFromStatusJson({ name: "RoBridge" }), null);
});

test("doctor next-action priority: Node → dist → plugin → mcp.json → reload MCP → open Studio", () => {
  const base = {
    nodeOk: true,
    distOk: true,
    pluginFail: false,
    mcpOk: true,
    httpUp: true,
    studioConnected: true,
  };
  assert.equal(pickDoctorNext({ ...base, nodeOk: false, distOk: false }).kind, "node");
  assert.equal(pickDoctorNext({ ...base, distOk: false, pluginFail: true }).kind, "dist");
  assert.equal(pickDoctorNext({ ...base, pluginFail: true, mcpOk: false }).kind, "plugin");
  assert.equal(pickDoctorNext({ ...base, mcpOk: false, httpUp: false }).kind, "mcp");
  assert.equal(pickDoctorNext({ ...base, httpUp: false }).kind, "reload");
  assert.equal(pickDoctorNext({ ...base, studioConnected: false }).kind, "studio");
  assert.equal(pickDoctorNext(base).kind, "none");
  assert.equal(pickDoctorNext({ ...base, studioConnected: null }).kind, "none");
  assert.match(pickDoctorNext({ ...base, httpUp: false }).text, /Reload MCP in Cursor/);
});

test("doctor runDoctor prints checklist and one Next without starting a server", async () => {
  assert.equal(nodeVersionIsSupported("v18.0.0"), true);
  assert.equal(nodeVersionIsSupported("v16.20.2"), false);

  const dir = await mkdtemp(path.join(tmpdir(), "robridge-doctor-"));
  const dist = path.join(dir, "dist", "index.js");
  await mkdir(path.dirname(dist), { recursive: true });
  await writeFile(dist, "export {}\n");
  const plugin = path.join(dir, "RoBridge.lua");
  await writeFile(plugin, "-- plugin\n");
  const userMcp = path.join(dir, "user-mcp.json");
  await writeFile(
    userMcp,
    JSON.stringify({
      mcpServers: { RoBridge: { command: "node", args: [dist] } },
    }),
  );
  const projectMcp = path.join(dir, "project-mcp.json");
  await writeFile(
    projectMcp,
    JSON.stringify({
      mcpServers: { RoBridge: { command: process.execPath, args: [dist] } },
    }),
  );

  const report = await runDoctor({
    nodeVersion: process.version,
    serverEntry: dist,
    pluginPath: plugin,
    cursorUserPath: userMcp,
    cursorProjectPath: projectMcp,
    claudeDesktopPath: path.join(dir, "missing-claude.json"),
    port: 3737,
    fileExists: existsSync,
    readText: (p) => readFile(p, "utf8"),
    probeHttp: async () => ({ up: false, dashboardUrl: "http://127.0.0.1:3737", json: null }),
  });

  assert.equal(report.nextKind, "reload");
  assert.match(report.text, /^RoBridge doctor\n/);
  assert.match(report.text, /^OK\s+Node\s+/m);
  assert.match(report.text, /Cursor MCP/);
  assert.match(report.text, /Project MCP/);
  assert.match(report.text, /SKIP\s+Claude Desktop/);
  assert.match(report.text, /down \(normal if Cursor MCP is not loaded yet\)/);
  assert.match(report.text, /GUI apps may need a full Node path; run init again\./);
  assert.match(report.text, /Next: Reload MCP in Cursor \(Settings → MCP → RoBridge\)\n$/);
  assert.doesNotMatch(report.text, /\nNext:.+\nNext:/);

  const allOk = await runDoctor({
    nodeVersion: process.version,
    serverEntry: dist,
    pluginPath: plugin,
    cursorUserPath: userMcp,
    cursorProjectPath: projectMcp,
    claudeDesktopPath: null,
    port: 3737,
    fileExists: existsSync,
    readText: (p) => readFile(p, "utf8"),
    probeHttp: async () => ({
      up: true,
      dashboardUrl: "http://127.0.0.1:3737",
      json: { studioConnected: true, sessions: [{ connected: true }] },
    }),
  });
  assert.equal(allOk.nextKind, "none");
  assert.match(allOk.text, /Next: none — you're set/);
  assert.match(allOk.text, /Dashboard: http:\/\/127\.0\.0\.1:3737/);
});

test("official Studio MCP spawn and mcpServers.Roblox_Studio are detected", () => {
  assert.equal(looksLikeOfficialStudioMcpSpawn("/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP"), true);
  assert.equal(looksLikeOfficialStudioMcpSpawn("cmd.exe", ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"]), true);
  assert.equal(looksLikeOfficialStudioMcpSpawn("/usr/bin/node", ["/abs/dist/index.js"]), false);
  assert.equal(
    mcpConfigHasOfficialStudioServer({
      mcpServers: { Roblox_Studio: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" } },
    }),
    true,
  );
  assert.equal(mcpConfigHasOfficialStudioServer({ mcpServers: { RoBridge: { command: "node" } } }), false);
  assert.match(
    officialStudioMcpDoctorHint({
      mcpServers: {
        RoBridge: { command: "/usr/bin/node", args: ["/abs/dist/index.js"] },
        Roblox_Studio: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" },
      },
    }) ?? "",
    /complementary, not a replacement/,
  );
  assert.match(
    officialStudioMcpDoctorHint({
      mcpServers: {
        RoBridge: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" },
      },
    }) ?? "",
    /StudioMCP/,
  );
  assert.equal(officialStudioMcpDoctorHint({ mcpServers: { RoBridge: { command: "node", args: ["/abs/dist/index.js"] } } }), null);
});

test("doctor warns when official Roblox_Studio sits beside RoBridge", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-doctor-official-"));
  const dist = path.join(dir, "dist", "index.js");
  await mkdir(path.dirname(dist), { recursive: true });
  await writeFile(dist, "export {}\n");
  const plugin = path.join(dir, "RoBridge.lua");
  await writeFile(plugin, "-- plugin\n");
  const userMcp = path.join(dir, "user-mcp.json");
  await writeFile(
    userMcp,
    JSON.stringify({
      mcpServers: {
        RoBridge: { command: process.execPath, args: [dist] },
        Roblox_Studio: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" },
      },
    }),
  );

  const report = await runDoctor({
    nodeVersion: process.version,
    serverEntry: dist,
    pluginPath: plugin,
    cursorUserPath: userMcp,
    cursorProjectPath: path.join(dir, "missing-project.json"),
    claudeDesktopPath: null,
    port: 3737,
    fileExists: existsSync,
    readText: (p) => readFile(p, "utf8"),
    probeHttp: async () => ({ up: false, dashboardUrl: "http://127.0.0.1:3737", json: null }),
  });

  assert.match(report.text, /WARN Official Roblox Studio MCP \(Roblox_Studio\) is also configured/);
  assert.match(report.text, /complementary, not a replacement/);
  assert.equal(report.nextKind, "reload");
});

