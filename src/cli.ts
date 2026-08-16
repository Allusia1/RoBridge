import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_COMMANDS = new Set([
  "install-plugin",
  "init",
  "install",
  "mcp",
  "help",
  "--help",
  "-h",
]);

const PLUGIN_NAME = "RoBridge.lua";
const SERVER_NAME = "RoBridge";

export type McpStdioSpawn = {
  command: string;
  args: string[];
};

export type MergeResult = {
  path: string;
  created: boolean;
  backedUp: boolean;
};

export type ClaudeDesktopStatus = {
  status: "written" | "skipped";
  path: string | null;
  result?: MergeResult;
  reason?: string;
};

export type ClaudeCodeStatus = {
  status: "added" | "merged" | "skipped";
  detail: string;
};

export type McpWriteSummary = {
  spawn: McpStdioSpawn;
  cursorUser: MergeResult;
  cursorProject: MergeResult;
  claudeDesktop: ClaudeDesktopStatus;
  claudeCode: ClaudeCodeStatus;
};

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function serverEntryPath(): string {
  return path.join(packageRoot(), "dist", "index.js");
}

export function pluginSourcePath(): string {
  return path.join(packageRoot(), "plugin", PLUGIN_NAME);
}

export function pluginDestDir(): string | null {
  if (platform() === "darwin") {
    return path.join(homedir(), "Documents", "Roblox", "Plugins");
  }
  if (platform() === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return null;
    return path.join(localAppData, "Roblox", "Plugins");
  }
  return null;
}

export function pluginDestPath(): string | null {
  const dir = pluginDestDir();
  return dir ? path.join(dir, PLUGIN_NAME) : null;
}

export function isCliCommand(argv: string[]): boolean {
  const first = argv[0];
  return Boolean(first && CLI_COMMANDS.has(first));
}

export function nodeMajor(version = process.versions.node): number {
  return Number.parseInt(version.split(".")[0] ?? "0", 10);
}

export function assertNode18(version = process.versions.node): void {
  if (nodeMajor(version) < 18) {
    throw new Error(
      `RoBridge requires Node 18+. You have ${version}. Install Node 18+ from https://nodejs.org then retry.`,
    );
  }
}

export function mcpSpawn(
  serverEntry = serverEntryPath(),
  nodeBin = process.execPath,
): McpStdioSpawn {
  return { command: nodeBin, args: [serverEntry] };
}

export function cursorUserMcpPath(home = homedir()): string {
  return path.join(home, ".cursor", "mcp.json");
}

export function cursorProjectMcpPath(root = packageRoot()): string {
  return path.join(root, ".cursor", "mcp.json");
}

export function claudeDesktopConfigPath(home = homedir()): string | null {
  if (platform() === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function claudeUserConfigPath(home = homedir()): string {
  return path.join(home, ".claude.json");
}

function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function shellQuote(value: string): string {
  if (!/[^\w./:@%+=-]/u.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function pathIsDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function commandOnPath(command: string): boolean {
  const probe = platform() === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

export async function ensureBuilt(): Promise<void> {
  const entry = serverEntryPath();
  if (existsSync(entry)) return;

  out("dist/index.js is missing — running npm run build from the repo root…");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: packageRoot(),
    stdio: "inherit",
    shell: platform() === "win32",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error("npm run build failed. Fix the build, then retry npx robridge init.");
  }
  if (!existsSync(entry)) {
    throw new Error(`Build finished but ${entry} is still missing.`);
  }
}

export async function mergeMcpServerConfig(
  filePath: string,
  entry: Record<string, unknown>,
  serverName = SERVER_NAME,
): Promise<MergeResult> {
  await mkdir(path.dirname(filePath), { recursive: true });

  let created = false;
  let backedUp = false;
  let parsed: Record<string, unknown> = {};

  try {
    const raw = await readFile(filePath, "utf8");
    const trimmed = raw.replace(/^\uFEFF/, "").trim();
    if (trimmed.length === 0) {
      parsed = {};
    } else {
      try {
        const value: unknown = JSON.parse(trimmed);
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("MCP config root must be a JSON object");
        }
        parsed = value as Record<string, unknown>;
      } catch {
        const bak = `${filePath}.bak`;
        if (!existsSync(bak)) {
          await copyFile(filePath, bak);
          backedUp = true;
        }
        parsed = {};
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    created = true;
  }

  const existingServers = parsed.mcpServers;
  const servers: Record<string, unknown> =
    existingServers !== null && typeof existingServers === "object" && !Array.isArray(existingServers)
      ? { ...(existingServers as Record<string, unknown>) }
      : {};
  servers[serverName] = entry;
  parsed.mcpServers = servers;

  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { path: filePath, created, backedUp };
}

export async function writeCursorMcpConfigs(
  spawn: McpStdioSpawn,
  options?: { userPath?: string; projectPath?: string },
): Promise<{ user: MergeResult; project: MergeResult }> {
  const userPath = options?.userPath ?? cursorUserMcpPath();
  const projectPath = options?.projectPath ?? cursorProjectMcpPath();
  const [user, project] = await Promise.all([
    mergeMcpServerConfig(userPath, spawn),
    mergeMcpServerConfig(projectPath, spawn),
  ]);
  return { user, project };
}

export async function writeClaudeDesktopConfig(
  spawn: McpStdioSpawn,
  options?: { configPath?: string | null; requireAppDir?: boolean },
): Promise<ClaudeDesktopStatus> {
  const configPath = options?.configPath === undefined ? claudeDesktopConfigPath() : options.configPath;
  if (!configPath) {
    return { status: "skipped", path: null, reason: "Claude Desktop not installed" };
  }
  const requireAppDir = options?.requireAppDir ?? true;
  if (requireAppDir && !(await pathIsDirectory(path.dirname(configPath)))) {
    return { status: "skipped", path: configPath, reason: "Claude Desktop not installed" };
  }
  const result = await mergeMcpServerConfig(configPath, spawn);
  return { status: "written", path: configPath, result };
}

export async function configureClaudeCode(
  spawn: McpStdioSpawn,
  options?: { claudeJsonPath?: string; skipCli?: boolean },
): Promise<ClaudeCodeStatus> {
  const claudeJsonPath = options?.claudeJsonPath ?? claudeUserConfigPath();
  const claudeEntry = { type: "stdio", command: spawn.command, args: spawn.args };

  if (!options?.skipCli && commandOnPath("claude")) {
    const add = spawnSync(
      "claude",
      ["mcp", "add", "--scope", "user", SERVER_NAME, "--", spawn.command, ...spawn.args],
      {
        encoding: "utf8",
        timeout: 25_000,
        windowsHide: true,
        shell: platform() === "win32",
      },
    );
    if (add.status === 0) {
      return { status: "added", detail: "added via claude mcp add --scope user" };
    }
    await mergeMcpServerConfig(claudeJsonPath, claudeEntry);
    const err = (add.stderr || add.stdout || "claude mcp add failed").trim().split("\n")[0];
    return {
      status: "merged",
      detail: `claude mcp add failed (${err}); merged ${claudeJsonPath}`,
    };
  }

  if (options?.skipCli) {
    await mergeMcpServerConfig(claudeJsonPath, claudeEntry);
    return { status: "merged", detail: `merged ${claudeJsonPath}` };
  }

  return { status: "skipped", detail: "Claude Code not found, skipped." };
}

export async function writeMcpConfigs(): Promise<McpWriteSummary> {
  const spawn = mcpSpawn();
  const cursor = await writeCursorMcpConfigs(spawn);
  const claudeDesktop = await writeClaudeDesktopConfig(spawn);
  const claudeCode = await configureClaudeCode(spawn);
  return {
    spawn,
    cursorUser: cursor.user,
    cursorProject: cursor.project,
    claudeDesktop,
    claudeCode,
  };
}

export function formatHelp(serverEntry = serverEntryPath()): string {
  const nodeBin = process.execPath;
  return `RoBridge — local MCP server + Roblox Studio plugin

Usage:
  robridge                         MCP stdio server (Cursor / Claude spawn this)
  npx robridge init                Dummy-proof setup: plugin + write MCP configs

Commands:
  init, install                    Install the plugin and write Cursor / Claude configs
  install-plugin                   Copy plugin/RoBridge.lua into the Roblox Plugins folder
  mcp                              Write MCP configs only (merge) and print a short summary
  --help, -h                       Show this help

First run:
  npm install && npm run build && npx robridge init

That copies the Studio plugin and writes Cursor + Claude MCP configs (merge —
other servers are kept). Uses the absolute Node binary so GUI apps can spawn it.
Clients start the server; you do not run it in a terminal.

Plugin destination:
  macOS    ~/Documents/Roblox/Plugins/RoBridge.lua
  Windows  %LOCALAPPDATA%\\Roblox\\Plugins\\RoBridge.lua

Then refresh Plugins in Studio (or restart Studio) and Allow HTTP to 127.0.0.1.

Reload MCP in Cursor (Settings → MCP). Fully quit Claude Desktop if you use it.

Claude Code (if init could not register it):
  claude mcp add --scope user RoBridge -- ${shellQuote(nodeBin)} ${shellQuote(serverEntry)}

Fallback JSON for unusual clients: docs/mcp.md
`;
}

function describeMerge(result: MergeResult): string {
  const bits = [result.path];
  if (result.created) bits.push("(created)");
  else bits.push("(merged)");
  if (result.backedUp) bits.push("malformed file backed up to .bak");
  return bits.join(" ");
}

export function formatSetupSummary(
  summary: McpWriteSummary,
  plugin?: { dest: string } | { error: string } | { skipped: string },
): string {
  const lines: string[] = ["RoBridge is set up.", ""];

  if (plugin && "dest" in plugin) {
    lines.push(`Plugin: installed to ${plugin.dest}`);
    lines.push("  Refresh Plugins in Studio (or restart Studio).");
  } else if (plugin && "error" in plugin) {
    lines.push(`Plugin: failed — ${plugin.error}`);
  } else if (plugin && "skipped" in plugin) {
    lines.push(`Plugin: skipped (${plugin.skipped})`);
  }

  lines.push(`Cursor config: written to ${describeMerge(summary.cursorUser)}`);
  lines.push(`  Project config: ${describeMerge(summary.cursorProject)}`);

  if (summary.claudeDesktop.status === "written" && summary.claudeDesktop.result) {
    lines.push(`Claude Desktop: written to ${describeMerge(summary.claudeDesktop.result)}`);
  } else {
    lines.push("Claude Desktop: skipped (app not installed)");
  }

  if (summary.claudeCode.status === "skipped") {
    lines.push(`Claude Code: ${summary.claudeCode.detail}`);
  } else if (summary.claudeCode.status === "added") {
    lines.push("Claude Code: added (user scope)");
  } else {
    lines.push(`Claude Code: merged (${summary.claudeCode.detail})`);
  }

  lines.push("");
  lines.push("Next:");
  lines.push("  Reload MCP in Cursor (Settings → MCP).");
  lines.push("  Fully quit Claude Desktop if you use it.");
  lines.push("  Open Studio, Allow HTTP to 127.0.0.1.");
  lines.push("");
  lines.push("Cursor and Claude spawn RoBridge for you — do not start it in a terminal.");
  return lines.join("\n");
}

export function formatMcpFallback(spawn = mcpSpawn()): string {
  const cursor = { mcpServers: { [SERVER_NAME]: spawn } };
  const claudeCodeJson = {
    mcpServers: {
      [SERVER_NAME]: { type: "stdio", ...spawn },
    },
  };
  return `Fallback spawn JSON (unusual clients only; init/mcp already wrote Cursor + Claude):

${JSON.stringify(cursor, null, 2)}

Claude Code JSON (~/.claude.json user scope):

${JSON.stringify(claudeCodeJson, null, 2)}
`;
}

export async function installPlugin(): Promise<string> {
  const src = pluginSourcePath();
  const dest = pluginDestPath();
  if (!dest) {
    throw new Error(
      "Unsupported platform. Copy plugin/RoBridge.lua to your Roblox Studio local plugins folder manually.\n" +
        "  macOS:   ~/Documents/Roblox/Plugins/RoBridge.lua\n" +
        "  Windows: %LOCALAPPDATA%\\Roblox\\Plugins\\RoBridge.lua",
    );
  }

  try {
    await access(src);
  } catch {
    throw new Error(`Plugin source not found: ${src}`);
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  await access(dest);
  return dest;
}

function printPluginInstalled(dest: string): void {
  out(`Installed RoBridge plugin to: ${dest}`);
  out("Refresh Plugins in Studio (or restart Studio).");
}

async function runInit(includePlugin: boolean): Promise<number> {
  assertNode18();
  await ensureBuilt();

  let plugin: { dest: string } | { error: string } | undefined;
  if (includePlugin) {
    try {
      const dest = await installPlugin();
      printPluginInstalled(dest);
      out("");
      plugin = { dest };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (pluginDestDir() === null) {
        out(`Plugin skipped: ${message}`);
        out("");
        plugin = { error: message };
      } else {
        throw err;
      }
    }
  }

  const summary = await writeMcpConfigs();
  out(formatSetupSummary(summary, includePlugin ? plugin : undefined));
  return 0;
}

export async function dispatchCli(argv: string[]): Promise<number> {
  const command = argv[0];
  try {
    switch (command) {
      case "--help":
      case "-h":
      case "help":
        out(formatHelp());
        return 0;
      case "install-plugin": {
        assertNode18();
        const dest = await installPlugin();
        printPluginInstalled(dest);
        return 0;
      }
      case "init":
      case "install":
        return await runInit(true);
      case "mcp":
        return await runInit(false);
      default:
        out(formatHelp());
        return 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[RoBridge] ${message}\n`);
    return 1;
  }
}
