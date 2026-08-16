#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function skip(reason) {
  console.log(`[RoBridge] postinstall skipped: ${reason}`);
  process.exit(0);
}

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  skip("CI environment");
}

function isRoBridgeRoot(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return false;
  }
  if (pkg.name !== "robridge") return false;
  return (
    existsSync(path.join(dir, "plugin", "RoBridge.lua")) &&
    existsSync(path.join(dir, "src", "cli.ts"))
  );
}

if (!isRoBridgeRoot(root)) {
  skip("not the RoBridge package root");
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: platform() === "win32",
  windowsHide: true,
});
if (build.status !== 0) {
  console.error("[RoBridge] postinstall failed: npm run build failed.");
  process.exit(build.status ?? 1);
}

const entry = path.join(root, "dist", "index.js");
if (!existsSync(entry)) {
  console.error(`[RoBridge] postinstall failed: ${entry} is missing after build.`);
  process.exit(1);
}

const init = spawnSync(process.execPath, [entry, "init"], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});
if (init.status !== 0) {
  console.error("[RoBridge] postinstall failed: init failed.");
  process.exit(init.status ?? 1);
}
