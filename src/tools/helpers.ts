import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { Bridge } from "../bridge.js";
import { withErrorHint } from "../errors.js";
import type { History } from "../history.js";

export interface ToolCatalogEntry {
  name: string;
  description: string;
  /** Action enum values advertised to MCP / HTTP. Empty if the tool has no action field. */
  actions: string[];
  /** Top-level input parameter names from the Zod shape (source of truth for MCP). */
  params: string[];
}

export interface McpRuntime {
  transport: "stdio" | "none";
  stdioConnected: boolean;
  lastClientAt: number | null;
  lastClientSource: "stdio" | "proxy" | "heartbeat" | null;
  proxyCalls: number;
  lastHeartbeatAt: number | null;
}

/** Proxied tool calls keep the dashboard "attached" for this long. */
export const MCP_PROXY_FRESH_MS = 180_000;
/** Forwarded stdio MCP heartbeats (every 10s) expire after this. */
export const MCP_HEARTBEAT_FRESH_MS = 30_000;

export function mcpClientState(mcp: McpRuntime, now = Date.now()) {
  const heartbeatFresh =
    mcp.lastHeartbeatAt != null && now - mcp.lastHeartbeatAt < MCP_HEARTBEAT_FRESH_MS;
  const proxyFresh =
    mcp.lastClientSource === "proxy" &&
    mcp.lastClientAt != null &&
    now - mcp.lastClientAt < MCP_PROXY_FRESH_MS;
  const clientConnected = mcp.stdioConnected || proxyFresh || heartbeatFresh;
  const label = mcp.stdioConnected
    ? "stdio"
    : heartbeatFresh || proxyFresh
      ? "http-proxy"
      : mcp.transport === "none"
        ? "dashboard-only"
        : "idle";
  return { clientConnected, heartbeatFresh, proxyFresh, label };
}

export type CallSource = "mcp" | "dashboard" | "proxy";

export interface ToolContext {
  server: McpServer;
  bridge: Bridge;
  history: History;
  /** tool name -> raw handler, used by batch_execute and the web console */
  registry: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  /** tool name -> action enum values (empty if the tool has no action field) */
  actions: Map<string, string[]>;
  /** Same registrations MCP tools/list is built from — used by HTTP /api/tools and --dump-catalog */
  catalog: Map<string, ToolCatalogEntry>;
  config: {
    port: number;
    version: string;
    startedAt: number;
    httpBound: boolean;
    mcp: McpRuntime;
  };
  /** Set around HTTP/dashboard invocations so history can distinguish MCP vs UI. */
  callSource?: CallSource;
}

/** Dashboard grouping — keys are defineTool names, same registry MCP uses. */
export const TOOL_GENRES: { id: string; label: string; tools: string[] }[] = [
  { id: "query_mutate", label: "Query / mutate", tools: ["query_instances", "mutate_instances", "manage_properties"] },
  { id: "scripts", label: "Scripts", tools: ["manage_scripts"] },
  { id: "lighting_camera", label: "Lighting / camera", tools: ["manage_lighting", "manage_camera", "manage_effects"] },
  { id: "play_studio", label: "Play / studio", tools: ["manage_studio", "manage_input", "manage_logs", "manage_selection", "workspace_state", "system_info"] },
  { id: "audio_animation", label: "Audio / animation", tools: ["manage_audio", "manage_animation", "manage_tween"] },
  { id: "terrain_spatial", label: "Terrain / spatial", tools: ["manage_terrain", "spatial_query", "manage_physics"] },
  { id: "assets", label: "Assets", tools: ["manage_assets"] },
  { id: "ui", label: "UI", tools: ["manage_ui"] },
  { id: "execute", label: "Execute", tools: ["execute_luau", "batch_execute"] },
  { id: "sync", label: "Sync", tools: ["manage_sync"] },
];

function genreFor(name: string): { id: string; label: string } {
  for (const g of TOOL_GENRES) {
    if (g.tools.includes(name)) return { id: g.id, label: g.label };
  }
  return { id: "other", label: "Other" };
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : undefined;
}

function enumValues(schema: unknown): string[] {
  let current: { options?: unknown; _def?: { values?: unknown; innerType?: unknown } } | undefined = schema as {
    options?: unknown;
    _def?: { values?: unknown; innerType?: unknown };
  };
  for (let i = 0; i < 6 && current; i++) {
    const fromOptions = stringList(current.options);
    if (fromOptions) return fromOptions;
    const fromDef = stringList(current._def?.values);
    if (fromDef) return fromDef;
    current = current._def?.innerType as typeof current;
  }
  return [];
}

export function catalogList(ctx: ToolContext): ToolCatalogEntry[] {
  return [...ctx.catalog.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function catalogPayload(ctx: ToolContext) {
  const tools = catalogList(ctx).map((t) => {
    const genre = genreFor(t.name);
    return { ...t, genre: genre.id, genreLabel: genre.label };
  });
  const byName = new Map(tools.map((t) => [t.name, t]));
  const grouped = new Map<string, { id: string; label: string; tools: typeof tools }>();
  for (const g of [...TOOL_GENRES, { id: "other", label: "Other", tools: [] as string[] }]) {
    grouped.set(g.id, { id: g.id, label: g.label, tools: [] });
  }
  for (const g of TOOL_GENRES) {
    const bucket = grouped.get(g.id)!;
    for (const name of g.tools) {
      const t = byName.get(name);
      if (t) bucket.tools.push(t);
    }
  }
  for (const t of tools) {
    if (!TOOL_GENRES.some((g) => g.tools.includes(t.name))) grouped.get("other")!.tools.push(t);
  }
  const genres = [...grouped.values()].filter((g) => g.tools.length > 0);
  const actionCount = tools.reduce((n, t) => n + (t.actions.length || 1), 0);
  return {
    name: "RoBridge",
    version: ctx.config.version,
    toolCount: tools.length,
    actionCount,
    tools,
    genres,
    toolActions: Object.fromEntries(tools.map((t) => [t.name, t.actions])),
  };
}

export interface ImageResult {
  __imageBase64: string;
  mimeType?: string;
  [key: string]: unknown;
}

export function isImageResult(value: unknown): value is ImageResult {
  return !!value && typeof value === "object" && typeof (value as ImageResult).__imageBase64 === "string";
}

async function proxyToolCall(port: number, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/api/tool`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-robridge-proxy": "1" },
    body: JSON.stringify({ tool, args }),
  });
  const data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
  if (!data.ok) throw new Error(data.error || `Proxy to :${port} failed (HTTP ${res.status})`);
  return data.result;
}

export function defineTool(
  ctx: ToolContext,
  name: string,
  description: string,
  shape: ZodRawShape,
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
) {
  const wrapped = async (args: Record<string, unknown>): Promise<unknown> => {
    const start = Date.now();
    const action = typeof args?.action === "string" ? args.action : "";
    try {
      const result =
        !ctx.config.httpBound && !ctx.bridge.isConnected()
          ? await proxyToolCall(ctx.config.port, name, args ?? {})
          : await handler(args ?? {}, ctx);
      const source = ctx.callSource ?? "mcp";
      if (source === "mcp") {
        ctx.config.mcp.lastClientAt = Date.now();
        ctx.config.mcp.lastClientSource = "stdio";
      }
      ctx.history.record({ time: start, tool: name, action, status: "OK", durationMs: Date.now() - start, source });
      return result;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = withErrorHint(raw, name);
      const noStudio = msg.includes("No Roblox Studio session") || msg.includes("Studio plugin not connected");
      const source = ctx.callSource ?? "mcp";
      ctx.history.record({
        time: start,
        tool: name,
        action,
        status: noStudio ? "NO_STUDIO" : "FAILED",
        durationMs: Date.now() - start,
        error: msg,
        source,
      });
      throw new Error(msg);
    }
  };

  ctx.registry.set(name, wrapped);
  const actions = enumValues(shape.action);
  const params = Object.keys(shape);
  ctx.actions.set(name, actions);
  ctx.catalog.set(name, { name, description, actions, params });

  ctx.server.registerTool(name, { description, inputSchema: shape }, async (args: Record<string, unknown>) => {
    try {
      const result = await wrapped(args);
      if (isImageResult(result)) {
        const { __imageBase64, mimeType, ...rest } = result;
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(rest, null, 2) },
            { type: "image" as const, data: __imageBase64, mimeType: mimeType || "image/png" },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = withErrorHint(err instanceof Error ? err.message : String(err), name);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  });
}

/** Run Luau in Studio through the bridge. */
export function runLuau(
  ctx: ToolContext,
  tool: string,
  code: string,
  args: unknown,
  timeoutMs?: number,
  target: "edit" | "play" | "any" = "edit"
): Promise<unknown> {
  return ctx.bridge.run(tool, code, args, timeoutMs, target);
}
