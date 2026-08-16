import { access, copyFile, mkdir } from "node:fs/promises";
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

function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function shellQuote(value: string): string {
  if (!/[^\w./:@%+=-]/u.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function formatHelp(serverEntry = serverEntryPath()): string {
  return `RoBridge — local MCP server + Roblox Studio plugin

Usage:
  robridge                         Start the MCP stdio server (Cursor / Claude spawn this)
  node dist/index.js               Same as above (empty argv = MCP)

Commands:
  install-plugin                   Copy plugin/RoBridge.lua into the Roblox Plugins folder
  init, install                    Install the plugin and print MCP client configs
  mcp                              Print MCP spawn snippets only (do not start the server)
  --help, -h                       Show this help

Flags (MCP / server process — not for client spawn except the default empty argv):
  --dump-catalog                   Print the tool catalog as JSON and exit
  --no-mcp                         HTTP dashboard only (do not put this on an MCP spawn)

First run:
  npm install && npm run build && npx robridge init

Plugin destination:
  macOS    ~/Documents/Roblox/Plugins/RoBridge.lua
  Windows  %LOCALAPPDATA%\\Roblox\\Plugins\\RoBridge.lua

Then restart Roblox Studio (or refresh Plugins) and Allow HTTP to 127.0.0.1.

Claude Code:
  claude mcp add --scope user RoBridge -- node ${shellQuote(serverEntry)}

Cursor / Claude Desktop: paste the JSON from \`robridge mcp\`.
`;
}

export function formatMcpSnippets(serverEntry = serverEntryPath()): string {
  const spawn = {
    command: "node",
    args: [serverEntry],
  };
  const cursor = { mcpServers: { RoBridge: spawn } };
  const claudeCodeJson = {
    mcpServers: {
      RoBridge: { type: "stdio", ...spawn },
    },
  };
  const claudeAdd = `claude mcp add --scope user RoBridge -- node ${shellQuote(serverEntry)}`;

  return `RoBridge MCP spawn (stdio)

Clients spawn Node with an absolute path to dist/index.js. Empty argv starts the
server — do not add install-plugin, init, mcp, --help, --dump-catalog, or --no-mcp
to a client spawn.

  node ${shellQuote(serverEntry)}

After clone:
  npm install && npm run build && npx robridge init

Claude Code (one-liner):
  ${claudeAdd}

Cursor  (~/.cursor/mcp.json  or  .cursor/mcp.json)
Claude Desktop  (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
                 Windows: %APPDATA%\\Claude\\claude_desktop_config.json)

${JSON.stringify(cursor, null, 2)}

Claude Code JSON (~/.claude.json user scope, or .mcp.json in a project):

${JSON.stringify(claudeCodeJson, null, 2)}

Reload the MCP server after each rebuild. Claude Desktop: fully quit and reopen.
Dashboard: http://127.0.0.1:3737
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
  out("Restart Roblox Studio (or right-click the Plugins folder in Studio > Refresh) to load it.");
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
        const dest = await installPlugin();
        printPluginInstalled(dest);
        return 0;
      }
      case "init":
      case "install": {
        const dest = await installPlugin();
        printPluginInstalled(dest);
        out("");
        out(formatMcpSnippets());
        return 0;
      }
      case "mcp":
        out(formatMcpSnippets());
        return 0;
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
