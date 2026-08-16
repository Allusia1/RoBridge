#!/usr/bin/env node
// Copies the RoBridge Studio plugin into the local Roblox plugins folder.
import { copyFile, mkdir, access } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugin", "RoBridge.lua");

const candidates =
  platform() === "darwin"
    ? [path.join(homedir(), "Documents", "Roblox", "Plugins")]
    : platform() === "win32"
      ? [path.join(process.env.LOCALAPPDATA ?? "", "Roblox", "Plugins")]
      : [];

if (candidates.length === 0) {
  console.error("Unsupported platform. Copy plugin/RoBridge.lua to your Roblox Studio local plugins folder manually.");
  process.exit(1);
}

const dir = candidates[0];
await mkdir(dir, { recursive: true });
const dest = path.join(dir, "RoBridge.lua");
await copyFile(src, dest);
await access(dest);
console.log(`Installed RoBridge plugin to: ${dest}`);
console.log("Restart Roblox Studio (or right-click the Plugins folder in Studio > Refresh) to load it.");
