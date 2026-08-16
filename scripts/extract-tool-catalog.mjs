#!/usr/bin/env node
// Parse defineTool registrations in src/tools/*.ts into JSON for the docs site.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = path.join(ROOT, "src", "tools");
const OUT_DIR = path.join(ROOT, "web", "lib");

const FILE_GROUPS = {
  "core.ts": { group: "Instances", order: 1 },
  "scene.ts": { group: "World", order: 2 },
  "studio.ts": { group: "Studio", order: 3 },
  "media.ts": { group: "Media", order: 4 },
  "ui.ts": { group: "UI", order: 5 },
  "execute.ts": { group: "Execute", order: 6 },
};

function unescape(str) {
  return str.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function inferType(expr) {
  const compact = expr.replace(/\s+/g, " ").trim();
  if (/\.enum\(/.test(compact)) return "enum";
  if (/z\.array\(\s*z\.number\(\)/.test(compact)) return "number[]";
  if (/z\.array\(\s*z\.string\(\)/.test(compact)) return "string[]";
  if (/z\.array\(\s*z\.object\(/.test(compact)) return "object[]";
  if (/z\.array\(/.test(compact)) return "array";
  if (/z\.record\(/.test(compact)) return "object";
  if (/z\.object\(/.test(compact)) return "object";
  if (/z\.union\(/.test(compact)) return "union";
  if (/z\.lazy\(/.test(compact) || compact.includes("uiNode") || compact.includes("instanceNode") || compact.includes("jsonValue")) {
    if (compact.includes("jsonValue") && !compact.includes("z.union")) return "any";
    return "object";
  }
  if (/z\.boolean\(/.test(compact)) return "boolean";
  if (/z\.number\(/.test(compact)) return "number";
  if (/z\.string\(/.test(compact)) return "string";
  if (/z\.any\(/.test(compact)) return "any";
  return "unknown";
}

function extractEnum(expr) {
  const m = expr.match(/z\s*\.\s*enum\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!m) return undefined;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function extractDescribe(expr) {
  const m = expr.match(/\.describe\(\s*"((?:\\.|[^"\\])*)"\s*\)/);
  return m ? unescape(m[1]) : undefined;
}

function splitFields(shape) {
  const fields = [];
  let i = 0;
  while (i < shape.length) {
    while (i < shape.length && /[\s,]/.test(shape[i])) i++;
    if (i >= shape.length) break;
    const nameMatch = shape.slice(i).match(/^(\w+)\s*:/);
    if (!nameMatch) break;
    const name = nameMatch[1];
    i += nameMatch[0].length;
    const start = i;
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    while (i < shape.length) {
      const c = shape[i];
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        i++;
        while (i < shape.length) {
          if (shape[i] === "\\") {
            i += 2;
            continue;
          }
          if (shape[i] === q) break;
          i++;
        }
        i++;
        continue;
      }
      if (c === "(") depthParen++;
      else if (c === ")") depthParen--;
      else if (c === "{") depthBrace++;
      else if (c === "}") {
        if (depthBrace === 0 && depthParen === 0 && depthBracket === 0) break;
        depthBrace--;
      } else if (c === "[") depthBracket++;
      else if (c === "]") depthBracket--;
      else if (c === "," && depthParen === 0 && depthBrace === 0 && depthBracket === 0) break;
      i++;
    }
    fields.push({ name, expr: shape.slice(start, i).trim() });
    if (shape[i] === ",") i++;
  }
  return fields;
}

function parseTools(src, file) {
  const tools = [];
  const needle = "defineTool(";
  let from = 0;
  while (true) {
    const idx = src.indexOf(needle, from);
    if (idx < 0) break;
    from = idx + needle.length;
    const header = src.slice(from, from + 4000);
    const hm = header.match(/^\s*ctx\s*,\s*"([^"]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,/);
    if (!hm) continue;
    const name = hm[1];
    const description = unescape(hm[2]);
    const afterHeader = from + hm[0].length;
    const brace = src.indexOf("{", afterHeader);
    if (brace < 0) continue;
    const end = findMatchingBrace(src, brace);
    if (end < 0) continue;
    const shape = src.slice(brace + 1, end);
    const params = splitFields(shape).map(({ name: pname, expr }) => {
      const optional = /\.optional\(/.test(expr);
      return {
        name: pname,
        type: inferType(expr),
        optional,
        enum: extractEnum(expr),
        description: extractDescribe(expr),
      };
    });
    const actionParam = params.find((p) => p.name === "action");
    const meta = FILE_GROUPS[file] ?? { group: "Other", order: 99 };
    tools.push({
      name,
      description,
      file,
      group: meta.group,
      groupOrder: meta.order,
      actions: actionParam?.enum ?? [],
      params,
    });
    from = end;
  }
  return tools;
}

async function readVersion(file, fallback, pattern) {
  try {
    const text = await readFile(file, "utf8");
    const m = text.match(pattern);
    return m ? m[1] : fallback;
  } catch {
    return fallback;
  }
}

const files = (await readdir(TOOLS_DIR)).filter((f) => f.endsWith(".ts") && f !== "helpers.ts").sort();
const tools = [];
for (const file of files) {
  const src = await readFile(path.join(TOOLS_DIR, file), "utf8");
  tools.push(...parseTools(src, file));
}

tools.sort((a, b) => a.groupOrder - b.groupOrder || a.name.localeCompare(b.name));

const serverVersion = await readVersion(path.join(ROOT, "package.json"), "0.0.0", /"version"\s*:\s*"([^"]+)"/);
const pluginVersion = await readVersion(path.join(ROOT, "plugin", "RoBridge.lua"), "0.0.0", /VERSION\s*=\s*"([^"]+)"/);
const indexVersion = await readVersion(path.join(ROOT, "src", "index.ts"), serverVersion, /VERSION\s*=\s*"([^"]+)"/);

const catalog = {
  generatedAt: new Date().toISOString(),
  serverVersion: indexVersion,
  packageVersion: serverVersion,
  pluginVersion,
  toolCount: tools.length,
  tools,
};

await mkdir(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, "catalog.generated.json");
await writeFile(outFile, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(`Wrote ${tools.length} tools → ${path.relative(ROOT, outFile)}`);
console.log(`Versions: package ${serverVersion}, server ${indexVersion}, plugin ${pluginVersion}`);
