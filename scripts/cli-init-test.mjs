#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNode18,
  formatHelp,
  isCliCommand,
  mergeMcpServerConfig,
  mcpSpawn,
  nodeMajor,
  writeClaudeDesktopConfig,
  writeCursorMcpConfigs,
} from "../dist/cli.js";

test("CLI commands are recognized; empty argv is not a CLI command", () => {
  assert.equal(isCliCommand(["init"]), true);
  assert.equal(isCliCommand(["install"]), true);
  assert.equal(isCliCommand(["install-plugin"]), true);
  assert.equal(isCliCommand(["mcp"]), true);
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
  assert.match(help, /Settings → MCP/);
  assert.doesNotMatch(help, /node dist\/index\.js\s*$/m);
});

test("merge creates a file and overwrites only the RoBridge entry", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "robridge-mcp-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(
    file,
    JSON.stringify({
      mcpServers: {
        keepMe: { command: "npx", args: ["other"] },
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
