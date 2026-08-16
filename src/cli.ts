import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_COMMANDS = new Set([
  "install-plugin",
  "init",
  "install",
  "mcp",
  "doctor",
  "update",
  "help",
  "--help",
  "-h",
]);

export const GITHUB_LATEST_RELEASE_URL =
  "https://api.github.com/repos/Allusia1/RoBridge/releases/latest";

const PLUGIN_NAME = "RoBridge.lua";
const SERVER_NAME = "RoBridge";
/** Official built-in Studio MCP (stdio StudioMCP / mcp.bat). Complementary — not RoBridge. */
export const OFFICIAL_STUDIO_MCP_KEY = "Roblox_Studio";

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
  vscodeProject: MergeResult;
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

export function vscodeProjectMcpPath(root = packageRoot()): string {
  return path.join(root, ".vscode", "mcp.json");
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
  serversKey = "mcpServers",
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

  const existingServers = parsed[serversKey];
  const servers: Record<string, unknown> =
    existingServers !== null && typeof existingServers === "object" && !Array.isArray(existingServers)
      ? { ...(existingServers as Record<string, unknown>) }
      : {};
  servers[serverName] = entry;
  parsed[serversKey] = servers;

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

export async function writeVscodeMcpConfig(
  spawn: McpStdioSpawn,
  options?: { projectPath?: string },
): Promise<MergeResult> {
  const projectPath = options?.projectPath ?? vscodeProjectMcpPath();
  return mergeMcpServerConfig(
    projectPath,
    { type: "stdio", command: spawn.command, args: spawn.args },
    SERVER_NAME,
    "servers",
  );
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
  const vscodeProject = await writeVscodeMcpConfig(spawn);
  const claudeDesktop = await writeClaudeDesktopConfig(spawn);
  const claudeCode = await configureClaudeCode(spawn);
  return {
    spawn,
    cursorUser: cursor.user,
    cursorProject: cursor.project,
    vscodeProject,
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
  npx robridge update              git pull --ff-only + npm install (clone only)
  npx robridge doctor              Checklist + one next step (does not start the server)

Commands:
  init, install                    Install the plugin and write Cursor / Claude / VS Code configs
  install-plugin                   Copy plugin/RoBridge.lua into the Roblox Plugins folder
  mcp                              Write MCP configs only (merge) and print a short summary
  update                           git pull --ff-only then npm install (clean clone required)
  doctor                           Check Node, dist, plugin, MCP configs, :3737, Studio
  --help, -h                       Show this help

First run:
  npm install

Postinstall builds the server and runs init (plugin + MCP configs, merge —
other servers are kept). Re-run with npx robridge init. Uses the absolute Node
binary so GUI apps can spawn it. Clients start the server; you do not run it
in a terminal.

Plugin destination:
  macOS    ~/Documents/Roblox/Plugins/RoBridge.lua
  Windows  %LOCALAPPDATA%\\Roblox\\Plugins\\RoBridge.lua

Then refresh Plugins in Studio (or restart Studio) and Allow HTTP to 127.0.0.1.
Official Studio MCP is optional (Assistant → … → Enable Studio as MCP server) and complementary — do not replace the RoBridge entry.

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
  lines.push(`VS Code Copilot: written to ${describeMerge(summary.vscodeProject)}`);

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
  lines.push("  Reload Copilot MCP in VS Code if you use it.");
  lines.push("  Fully quit Claude Desktop if you use it.");
  lines.push("  Open Studio, Allow HTTP to 127.0.0.1.");
  lines.push("  Official Studio MCP is optional (Assistant → … → Manage MCP Servers).");
  lines.push("  Keep the RoBridge entry; Quick connect may add Roblox_Studio beside it.");
  lines.push("");
  lines.push("Clients spawn RoBridge for you — do not start it in a terminal.");
  return lines.join("\n");
}

export function formatMcpFallback(spawn = mcpSpawn()): string {
  const cursor = { mcpServers: { [SERVER_NAME]: spawn } };
  const vscode = {
    servers: {
      [SERVER_NAME]: { type: "stdio", ...spawn },
    },
  };
  const claudeCodeJson = {
    mcpServers: {
      [SERVER_NAME]: { type: "stdio", ...spawn },
    },
  };
  return `Fallback spawn JSON (unusual clients only; init/mcp already wrote Cursor, Claude, VS Code):

${JSON.stringify(cursor, null, 2)}

VS Code Copilot JSON (.vscode/mcp.json — top-level "servers"):

${JSON.stringify(vscode, null, 2)}

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

export function luaPluginVersion(source: string): string | null {
  const match = source.match(/VERSION\s*=\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

/** -1 if a < b, 0 if equal, 1 if a > b. Compares major.minor.patch; strips a leading v. */
export function compareSemver(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

export async function pluginNeedsInstall(
  src = pluginSourcePath(),
  dest = pluginDestPath(),
): Promise<boolean> {
  if (!dest) return false;
  try {
    await access(src);
  } catch {
    return false;
  }
  try {
    await access(dest);
  } catch {
    return true;
  }
  const [srcText, destText] = await Promise.all([readFile(src, "utf8"), readFile(dest, "utf8")]);
  if (srcText !== destText) return true;
  return luaPluginVersion(srcText) !== luaPluginVersion(destText);
}

export async function ensurePluginCopied(options?: {
  src?: string;
  dest?: string | null;
  copy?: () => Promise<string>;
}): Promise<"copied" | "unchanged" | "skipped"> {
  const dest = options?.dest === undefined ? pluginDestPath() : options.dest;
  const src = options?.src ?? pluginSourcePath();
  if (!dest) return "skipped";
  if (!(await pluginNeedsInstall(src, dest))) return "unchanged";
  if (options?.copy) {
    await options.copy();
  } else if (src === pluginSourcePath() && dest === pluginDestPath()) {
    await installPlugin();
  } else {
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
  }
  return "copied";
}

export type GithubUpdateInfo = {
  updateAvailable: boolean;
  latestVersion: string | null;
};

export async function checkGithubLatestRelease(
  localVersion: string,
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    url?: string;
  },
): Promise<GithubUpdateInfo> {
  const none: GithubUpdateInfo = { updateAvailable: false, latestVersion: null };
  try {
    const fetcher = options?.fetchImpl ?? fetch;
    const res = await fetcher(options?.url ?? GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RoBridge",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(options?.timeoutMs ?? 2500),
    });
    if (!res.ok) return none;
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object" || Array.isArray(json)) return none;
    const tag = (json as Record<string, unknown>).tag_name;
    if (typeof tag !== "string" || tag.length === 0) return none;
    const latestVersion = normalizeVersion(tag);
    return {
      latestVersion,
      updateAvailable: compareSemver(latestVersion, localVersion) > 0,
    };
  } catch {
    return none;
  }
}

export type GitSpawnResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export async function runUpdate(deps: {
  root?: string;
  out?: (text: string) => void;
  git?: (args: string[], cwd: string) => GitSpawnResult;
  npmInstall?: (cwd: string) => GitSpawnResult;
} = {}): Promise<void> {
  const root = deps.root ?? packageRoot();
  const write = deps.out ?? out;
  const git =
    deps.git ??
    ((args, cwd) => {
      const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    });
  const npmInstall =
    deps.npmInstall ??
    ((cwd) => {
      const result = spawnSync("npm", ["install"], {
        cwd,
        stdio: "inherit",
        shell: platform() === "win32",
        windowsHide: true,
      });
      return { status: result.status, stdout: "", stderr: "" };
    });

  const inside = git(["rev-parse", "--is-inside-work-tree"], root);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    throw new Error(
      "Not a git clone. RoBridge updates from a GitHub checkout — clone https://github.com/Allusia1/RoBridge.git and run npx robridge update from that directory.",
    );
  }

  const status = git(["status", "--porcelain"], root);
  if (status.status !== 0) {
    throw new Error(status.stderr.trim() || "git status failed.");
  }
  if (status.stdout.trim().length > 0) {
    throw new Error("Working tree is dirty. Commit or stash changes, then retry npx robridge update.");
  }

  write("git pull --ff-only…");
  const pull = git(["pull", "--ff-only"], root);
  if (pull.status !== 0) {
    throw new Error(pull.stderr.trim() || pull.stdout.trim() || "git pull --ff-only failed.");
  }
  if (pull.stdout.trim()) write(pull.stdout.trimEnd());

  write("npm install…");
  const install = npmInstall(root);
  if (install.status !== 0) {
    throw new Error("npm install failed.");
  }

  write("Updated. Reload the RoBridge MCP server in Cursor (Settings → MCP), then refresh Plugins in Studio.");
}

function printPluginInstalled(dest: string): void {
  out(`Installed RoBridge plugin to: ${dest}`);
  out("Refresh Plugins in Studio (or restart Studio).");
}

export type DoctorStatus = "OK" | "FAIL" | "SKIP";
export type DoctorNextKind = "node" | "dist" | "plugin" | "mcp" | "reload" | "studio" | "none";

export type DoctorLine = {
  status: DoctorStatus;
  title: string;
  detail: string;
};

export type DoctorHttpProbe = {
  up: boolean;
  dashboardUrl: string;
  json: unknown | null;
};

export type DoctorDeps = {
  nodeVersion?: string;
  serverEntry?: string;
  pluginPath?: string | null;
  bundledPluginPath?: string;
  cursorUserPath?: string;
  cursorProjectPath?: string;
  claudeDesktopPath?: string | null;
  port?: number;
  fileExists?: (p: string) => boolean;
  readText?: (p: string) => Promise<string>;
  probeHttp?: (port: number) => Promise<DoctorHttpProbe>;
};

export type DoctorReport = {
  text: string;
  nextKind: DoctorNextKind;
  lines: DoctorLine[];
};

export const DOCTOR_NEXT: Record<DoctorNextKind, string> = {
  node: "Install Node 18+ from https://nodejs.org",
  dist: "npm install or npm run build",
  plugin: "npx robridge init (or reload MCP to auto-copy the plugin)",
  mcp: "npx robridge init",
  reload: "Reload MCP in Cursor (Settings → MCP → RoBridge)",
  studio: "Open Roblox Studio, Allow HTTP to 127.0.0.1, refresh Plugins",
  none: "none — you're set",
};

export function doctorPort(env = process.env): number {
  const parsed = Number(env.ROBRIDGE_PORT ?? 3737);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3737;
}

export function nodeVersionIsSupported(version = process.version): boolean {
  const trimmed = version.startsWith("v") ? version.slice(1) : version;
  return nodeMajor(trimmed) >= 18;
}

export function pathEndsWithDistIndex(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return normalized.endsWith("/dist/index.js") || normalized === "dist/index.js";
}

/** User + project Cursor mcp.json — whether RoBridge is configured (not whether a client is live). */
export function cursorMcpPresence(
  home = homedir(),
  root = packageRoot(),
): { present: boolean; pointsAtDist: boolean } {
  const paths = [cursorUserMcpPath(home), cursorProjectMcpPath(root)];
  let present = false;
  let pointsAtDist = false;
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
      const inspect = inspectMcpRoBridgeEntry(JSON.parse(raw || "{}"));
      if (inspect.present) present = true;
      if (inspect.pointsAtDist) pointsAtDist = true;
    } catch {
      /* invalid JSON — treat as not configured on this path */
    }
  }
  return { present, pointsAtDist };
}

export function inspectMcpRoBridgeEntry(config: unknown): {
  present: boolean;
  pointsAtDist: boolean;
  command: string | null;
  args: string[];
  bareNode: boolean;
} {
  const empty = {
    present: false,
    pointsAtDist: false,
    command: null as string | null,
    args: [] as string[],
    bareNode: false,
  };
  if (config === null || typeof config !== "object" || Array.isArray(config)) return empty;
  const servers = (config as Record<string, unknown>).mcpServers;
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) return empty;
  const entry = (servers as Record<string, unknown>)[SERVER_NAME];
  if (entry === undefined || entry === null) return empty;
  if (typeof entry !== "object" || Array.isArray(entry)) {
    return { present: true, pointsAtDist: false, command: null, args: [], bareNode: false };
  }
  const rec = entry as Record<string, unknown>;
  const command = typeof rec.command === "string" ? rec.command : null;
  const args = Array.isArray(rec.args) ? rec.args.filter((a): a is string => typeof a === "string") : [];
  const pointsAtDist =
    (command !== null && pathEndsWithDistIndex(command)) || args.some((a) => pathEndsWithDistIndex(a));
  const bareNode = command === "node" || command === "node.exe";
  return { present: true, pointsAtDist, command, args, bareNode };
}

export function looksLikeOfficialStudioMcpSpawn(command: string | null, args: readonly string[] = []): boolean {
  const hay = [command ?? "", ...args].join(" ").replace(/\\/g, "/").toLowerCase();
  return hay.includes("studiomcp") || hay.includes("mcp.bat");
}

export function mcpConfigHasOfficialStudioServer(config: unknown, serversKey = "mcpServers"): boolean {
  if (config === null || typeof config !== "object" || Array.isArray(config)) return false;
  const servers = (config as Record<string, unknown>)[serversKey];
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) return false;
  return Object.prototype.hasOwnProperty.call(servers, OFFICIAL_STUDIO_MCP_KEY);
}

export function officialStudioMcpDoctorHint(
  userConfig: unknown | null,
  projectConfig: unknown | null = null,
): string | null {
  const configs = [userConfig, projectConfig];
  let officialPresent = false;
  let replaced = false;
  for (const cfg of configs) {
    if (cfg == null) continue;
    if (mcpConfigHasOfficialStudioServer(cfg)) officialPresent = true;
    const inspect = inspectMcpRoBridgeEntry(cfg);
    if (inspect.present && looksLikeOfficialStudioMcpSpawn(inspect.command, inspect.args)) {
      replaced = true;
    }
  }
  if (replaced) {
    return "RoBridge spawn points at Roblox's built-in StudioMCP — that is a different server. Re-run npx robridge init so RoBridge stays node + dist/index.js. Official MCP can sit beside us as mcpServers.Roblox_Studio.";
  }
  if (officialPresent) {
    return "Official Roblox Studio MCP (Roblox_Studio) is also configured — complementary, not a replacement. RoBridge still uses the plugin + :3737.";
  }
  return null;
}

export function studioFromStatusJson(json: unknown): { connected: boolean } | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return null;
  const rec = json as Record<string, unknown>;
  const sessionsFromRoot = Array.isArray(rec.sessions) ? rec.sessions : null;
  const bridge = rec.bridge;
  const sessionsFromBridge =
    bridge !== null && typeof bridge === "object" && !Array.isArray(bridge) && Array.isArray((bridge as Record<string, unknown>).sessions)
      ? ((bridge as Record<string, unknown>).sessions as unknown[])
      : null;
  const sessions = sessionsFromBridge ?? sessionsFromRoot;
  const liveSession =
    sessions?.some((s) => {
      if (s === null || typeof s !== "object" || Array.isArray(s)) return false;
      return (s as Record<string, unknown>).connected === true;
    }) ?? false;
  if (liveSession) return { connected: true };
  if (typeof rec.studioConnected === "boolean") return { connected: rec.studioConnected };
  if (sessions) return { connected: false };
  return null;
}

export function pickDoctorNext(f: {
  nodeOk: boolean;
  distOk: boolean;
  pluginFail: boolean;
  mcpOk: boolean;
  httpUp: boolean;
  studioConnected: boolean | null;
}): { kind: DoctorNextKind; text: string } {
  if (!f.nodeOk) return { kind: "node", text: DOCTOR_NEXT.node };
  if (!f.distOk) return { kind: "dist", text: DOCTOR_NEXT.dist };
  if (f.pluginFail) return { kind: "plugin", text: DOCTOR_NEXT.plugin };
  if (!f.mcpOk) return { kind: "mcp", text: DOCTOR_NEXT.mcp };
  if (!f.httpUp) return { kind: "reload", text: DOCTOR_NEXT.reload };
  if (f.studioConnected === false) return { kind: "studio", text: DOCTOR_NEXT.studio };
  return { kind: "none", text: DOCTOR_NEXT.none };
}

export function formatDoctorReport(
  lines: DoctorLine[],
  next: string,
  dashboardUrl: string | null,
  warns: string[] = [],
): string {
  const padTitle = Math.max(14, ...lines.map((l) => l.title.length));
  const body = lines.map((l) => `${l.status.padEnd(4)} ${l.title.padEnd(padTitle)}  ${l.detail}`);
  const outLines = ["RoBridge doctor", "", ...body];
  if (warns.length > 0) {
    outLines.push("");
    for (const w of warns) outLines.push(`WARN ${w}`);
  }
  outLines.push("");
  outLines.push(`Next: ${next}`);
  if (dashboardUrl) outLines.push(`Dashboard: ${dashboardUrl}`);
  return `${outLines.join("\n")}\n`;
}

export async function probeRoBridgeHttp(
  port: number,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<DoctorHttpProbe> {
  const dashboardUrl = `http://127.0.0.1:${port}`;
  const get = async (url: string): Promise<Response | null> => {
    try {
      return await fetcher(url, { signal: AbortSignal.timeout(1500) });
    } catch {
      return null;
    }
  };

  const statusRes = await get(`${dashboardUrl}/api/status`);
  if (statusRes?.ok) {
    try {
      const json: unknown = await statusRes.json();
      return { up: true, dashboardUrl, json };
    } catch {
      return { up: true, dashboardUrl, json: null };
    }
  }

  const rootRes = await get(`${dashboardUrl}/`);
  if (rootRes?.ok) return { up: true, dashboardUrl, json: null };
  return { up: false, dashboardUrl, json: null };
}

async function readJsonObjectFile(
  filePath: string,
  readText: (p: string) => Promise<string>,
  fileExists: (p: string) => boolean,
): Promise<{ status: "missing" | "invalid" | "ok"; value?: Record<string, unknown> }> {
  if (!fileExists(filePath)) return { status: "missing" };
  try {
    const raw = await readText(filePath);
    const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, "").trim() || "{}");
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { status: "invalid" };
    }
    return { status: "ok", value: value as Record<string, unknown> };
  } catch {
    return { status: "invalid" };
  }
}

export async function runDoctor(deps: DoctorDeps = {}): Promise<DoctorReport> {
  const nodeVersion = deps.nodeVersion ?? process.version;
  const serverEntry = deps.serverEntry ?? serverEntryPath();
  const pluginPath = deps.pluginPath === undefined ? pluginDestPath() : deps.pluginPath;
  const bundledPluginPath = deps.bundledPluginPath ?? pluginSourcePath();
  const cursorUserPath = deps.cursorUserPath ?? cursorUserMcpPath();
  const cursorProjectPath = deps.cursorProjectPath ?? cursorProjectMcpPath();
  const claudeDesktopPath =
    deps.claudeDesktopPath === undefined ? claudeDesktopConfigPath() : deps.claudeDesktopPath;
  const port = deps.port ?? doctorPort();
  const fileExists = deps.fileExists ?? existsSync;
  const readText = deps.readText ?? ((p: string) => readFile(p, "utf8"));
  const probeHttp = deps.probeHttp ?? ((p: number) => probeRoBridgeHttp(p));

  const lines: DoctorLine[] = [];
  const warns: string[] = [];

  const nodeOk = nodeVersionIsSupported(nodeVersion);
  lines.push({
    status: nodeOk ? "OK" : "FAIL",
    title: "Node",
    detail: nodeOk ? `${nodeVersion} (>= 18)` : `${nodeVersion} (need >= 18)`,
  });

  const distOk = fileExists(serverEntry);
  lines.push({
    status: distOk ? "OK" : "FAIL",
    title: "dist/index.js",
    detail: distOk ? serverEntry : `missing ${serverEntry}`,
  });

  let pluginFail = false;
  if (pluginPath === null) {
    lines.push({
      status: "SKIP",
      title: "Plugin",
      detail: "unsupported platform — copy plugin/RoBridge.lua into the Roblox Plugins folder manually",
    });
  } else if (!fileExists(pluginPath)) {
    pluginFail = true;
    lines.push({ status: "FAIL", title: "Plugin", detail: `missing ${pluginPath}` });
  } else {
    let destVer: string | null = null;
    let bundledVer: string | null = null;
    try {
      destVer = luaPluginVersion(await readText(pluginPath));
    } catch {
      destVer = null;
    }
    if (fileExists(bundledPluginPath)) {
      try {
        bundledVer = luaPluginVersion(await readText(bundledPluginPath));
      } catch {
        bundledVer = null;
      }
    }
    if (bundledVer != null && destVer !== bundledVer) {
      pluginFail = true;
      lines.push({
        status: "FAIL",
        title: "Plugin",
        detail: `VERSION ${destVer ?? "missing"} ≠ bundled ${bundledVer} — ${pluginPath}`,
      });
    } else {
      lines.push({ status: "OK", title: "Plugin", detail: pluginPath });
    }
  }

  const userMcp = await readJsonObjectFile(cursorUserPath, readText, fileExists);
  const userInspect = userMcp.status === "ok" ? inspectMcpRoBridgeEntry(userMcp.value) : inspectMcpRoBridgeEntry(null);
  const mcpOk = userMcp.status === "ok" && userInspect.present && userInspect.pointsAtDist;
  if (mcpOk) {
    lines.push({ status: "OK", title: "Cursor MCP", detail: `${cursorUserPath} → dist/index.js` });
    if (userInspect.bareNode) {
      warns.push("GUI apps may need a full Node path; run init again.");
    }
  } else if (userMcp.status === "missing") {
    lines.push({ status: "FAIL", title: "Cursor MCP", detail: `${cursorUserPath} missing` });
  } else if (userMcp.status === "invalid") {
    lines.push({ status: "FAIL", title: "Cursor MCP", detail: `${cursorUserPath} is not valid JSON` });
  } else if (!userInspect.present) {
    lines.push({ status: "FAIL", title: "Cursor MCP", detail: `${cursorUserPath} has no mcpServers.RoBridge` });
  } else {
    lines.push({
      status: "FAIL",
      title: "Cursor MCP",
      detail: `${cursorUserPath} RoBridge does not point at dist/index.js`,
    });
  }

  let projectConfig: unknown | null = null;
  if (fileExists(cursorProjectPath)) {
    const projectMcp = await readJsonObjectFile(cursorProjectPath, readText, fileExists);
    if (projectMcp.status === "ok") projectConfig = projectMcp.value ?? null;
    const projectInspect =
      projectMcp.status === "ok" ? inspectMcpRoBridgeEntry(projectMcp.value) : inspectMcpRoBridgeEntry(null);
    if (projectInspect.present && projectInspect.pointsAtDist) {
      lines.push({ status: "OK", title: "Project MCP", detail: `${cursorProjectPath} → dist/index.js` });
    } else {
      lines.push({
        status: "SKIP",
        title: "Project MCP",
        detail: `${cursorProjectPath} present (RoBridge does not point at dist/index.js)`,
      });
    }
    if (projectInspect.bareNode && !warns.includes("GUI apps may need a full Node path; run init again.")) {
      warns.push("GUI apps may need a full Node path; run init again.");
    }
  }

  const officialHint = officialStudioMcpDoctorHint(
    userMcp.status === "ok" ? (userMcp.value ?? null) : null,
    projectConfig,
  );
  if (officialHint) warns.push(officialHint);

  if (!claudeDesktopPath || !fileExists(claudeDesktopPath)) {
    lines.push({ status: "SKIP", title: "Claude Desktop", detail: "not installed" });
  } else {
    const claude = await readJsonObjectFile(claudeDesktopPath, readText, fileExists);
    const inspect = claude.status === "ok" ? inspectMcpRoBridgeEntry(claude.value) : inspectMcpRoBridgeEntry(null);
    if (inspect.present && inspect.pointsAtDist) {
      lines.push({ status: "OK", title: "Claude Desktop", detail: `${claudeDesktopPath} → dist/index.js` });
    } else {
      lines.push({
        status: "SKIP",
        title: "Claude Desktop",
        detail: `${claudeDesktopPath} has no RoBridge entry (optional)`,
      });
    }
  }

  const http = await probeHttp(port);
  if (http.up) {
    lines.push({ status: "OK", title: `HTTP :${port}`, detail: `up  ${http.dashboardUrl}` });
  } else {
    lines.push({
      status: "SKIP",
      title: `HTTP :${port}`,
      detail: "down (normal if Cursor MCP is not loaded yet)",
    });
  }

  let studioConnected: boolean | null = null;
  if (!http.up) {
    lines.push({ status: "SKIP", title: "Studio", detail: "skipped (server not running)" });
  } else {
    const studio = studioFromStatusJson(http.json);
    if (studio === null) {
      lines.push({ status: "SKIP", title: "Studio", detail: "status JSON not available" });
    } else if (studio.connected) {
      studioConnected = true;
      lines.push({ status: "OK", title: "Studio", detail: "connected" });
    } else {
      studioConnected = false;
      lines.push({ status: "FAIL", title: "Studio", detail: "not connected" });
    }
  }

  const next = pickDoctorNext({ nodeOk, distOk, pluginFail, mcpOk, httpUp: http.up, studioConnected });
  const text = formatDoctorReport(lines, next.text, http.up ? http.dashboardUrl : null, warns);
  return { text, nextKind: next.kind, lines };
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
      case "update":
        assertNode18();
        await runUpdate();
        return 0;
      case "doctor": {
        const report = await runDoctor();
        out(report.text);
        return 0;
      }
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
