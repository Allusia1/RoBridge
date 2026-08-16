import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bridge } from "./bridge.js";
import { compactFixes, withErrorHint } from "./errors.js";
import type { History } from "./history.js";
import { catalogPayload, mcpClientState, type ToolContext } from "./tools/helpers.js";
import { cursorMcpPresence } from "./cli.js";
import {
  addRecordingFrame,
  addScreenshotTile,
  beginRecordingUpload,
  beginScreenshotUpload,
  clearGallery,
  getGalleryFrame,
  getGalleryMedia,
  getGalleryPng,
  getGalleryPoster,
  listGallery,
} from "./screenshot.js";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui");

export function createHttpApp(ctx: ToolContext, bridge: Bridge, history: History) {
  const app = express();

  app.post("/api/plugin/screenshot-begin", express.json(), (req, res) => {
    const { uploadId, width, height } = req.body ?? {};
    beginScreenshotUpload(String(uploadId), Number(width), Number(height));
    res.json({ ok: true });
  });

  app.post("/api/plugin/screenshot-tile", express.raw({ type: "*/*", limit: "2mb" }), (req, res) => {
    try {
      addScreenshotTile(
        String(req.headers["x-upload-id"]),
        Number(req.headers["x-y"]),
        Number(req.headers["x-rows"]),
        Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? [])
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/plugin/record-begin", express.json(), (req, res) => {
    const { uploadId, width, height, fps } = req.body ?? {};
    beginRecordingUpload(String(uploadId), Number(width), Number(height), Number(fps) || 8);
    res.json({ ok: true });
  });

  app.post("/api/plugin/record-frame", express.raw({ type: "*/*", limit: "8mb" }), (req, res) => {
    try {
      addRecordingFrame(
        String(req.headers["x-upload-id"]),
        Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? [])
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use(express.json({ limit: "16mb" }));

  // ---- Studio plugin bridge ----
  app.post("/api/plugin/poll", async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.sessionId !== "string") {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    const job = await bridge.poll({
      sessionId: body.sessionId,
      placeName: body.placeName,
      placeId: body.placeId,
      gameId: body.gameId,
      mode: body.mode,
      pluginVersion: body.pluginVersion,
      preflight: body.preflight,
    });
    res.json(job ? { job: { id: job.id, tool: job.tool, code: job.code, args: job.args } } : { job: null });
  });

  app.post("/api/plugin/result", (req, res) => {
    const { sessionId, jobId, ok, result, error } = req.body ?? {};
    if (typeof sessionId === "string") bridge.touchSession({ sessionId });
    const accepted = bridge.complete(String(jobId), !!ok, result, typeof error === "string" ? error : undefined);
    res.json({ accepted });
  });

  // ---- Dashboard API ----
  app.get("/api/status", (_req, res) => {
    const sessions = bridge.allSessions();
    const live = sessions.filter((s) => s.connected);
    const editSession = live.find((s) => !s.playAgent) ?? sessions.find((s) => !s.playAgent);
    const preflight = editSession?.preflight ?? live[0]?.preflight ?? sessions[0]?.preflight;
    const mcp = ctx.config.mcp;
    const presence = mcpClientState(mcp);
    const cursorConfig = cursorMcpPresence();
    res.json({
      name: "RoBridge",
      version: ctx.config.version,
      port: ctx.config.port,
      startedAt: ctx.config.startedAt,
      uptimeSeconds: Math.round((Date.now() - ctx.config.startedAt) / 1000),
      studioConnected: bridge.isConnected(),
      playConnected: bridge.isPlayConnected(),
      httpOnly: mcp.transport === "none",
      preflight: preflight ?? null,
      fixes: compactFixes({
        studioConnected: bridge.isConnected(),
        playConnected: bridge.isPlayConnected(),
        preflight,
      }),
      mcp: {
        transport: mcp.transport,
        stdioConnected: mcp.stdioConnected,
        clientConnected: presence.clientConnected,
        lastClientAt: mcp.lastClientAt,
        lastClientSource: mcp.lastClientSource,
        lastHeartbeatAt: mcp.lastHeartbeatAt,
        proxyCalls: mcp.proxyCalls,
        label: presence.label,
        cursorConfig,
      },
      history: history.summary(),
      bridge: bridge.stats(),
      toolCount: ctx.registry.size,
      actionCount: [...ctx.actions.values()].reduce((n, list) => n + (list.length || 1), 0),
      tools: [...ctx.registry.keys()].sort(),
      toolActions: Object.fromEntries(
        [...ctx.actions.entries()].sort(([a], [b]) => a.localeCompare(b))
      ),
    });
  });

  // Same action enums + param names MCP tools/list is built from (defineTool Zod shapes).
  app.get("/api/tools", (_req, res) => {
    res.json(catalogPayload(ctx));
  });

  app.get("/api/history", (req, res) => {
    const limit = Number(req.query.limit ?? 200);
    res.json({ items: history.list(limit) });
  });

  app.post("/api/history/clear", (_req, res) => {
    history.clear();
    res.json({ ok: true });
  });

  app.get("/api/stats", (_req, res) => {
    res.json({ tools: history.stats() });
  });

  app.get("/api/screenshots", (_req, res) => {
    res.json({ items: listGallery() });
  });

  app.get("/api/screenshots/:id/poster", (req, res) => {
    const png = getGalleryPoster(req.params.id);
    if (!png) {
      res.status(404).json({ error: "Poster not found" });
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  });

  app.get("/api/screenshots/:id/frame/:n", (req, res) => {
    const png = getGalleryFrame(req.params.id, Number(req.params.n));
    if (!png) {
      res.status(404).json({ error: "Frame not found" });
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  });

  app.get("/api/screenshots/:id", (req, res) => {
    const media = getGalleryMedia(req.params.id);
    if (!media) {
      const png = getGalleryPng(req.params.id);
      if (!png) {
        res.status(404).json({ error: "Screenshot not found" });
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
      return;
    }
    res.setHeader("Content-Type", media.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.send(media.data);
  });

  app.post("/api/screenshots/clear", (_req, res) => {
    clearGallery();
    res.json({ ok: true });
  });

  app.post("/api/screenshots/capture", async (req, res) => {
    const handler = ctx.registry.get("manage_camera");
    ctx.callSource = "dashboard";
    try {
      const result = (await handler!({ action: "screenshot", path: req.body?.path, distance: req.body?.distance })) as {
        galleryId?: string;
        width?: number;
        height?: number;
        source?: string;
      };
      res.json({
        ok: true,
        id: result.galleryId,
        width: result.width,
        height: result.height,
        source: result.source,
        kind: "image",
        mimeType: "image/png",
        url: result.galleryId ? `/api/screenshots/${result.galleryId}` : "/api/screenshots/latest",
      });
    } catch (err) {
      res.json({ ok: false, error: withErrorHint(err instanceof Error ? err.message : String(err), "manage_camera") });
    } finally {
      ctx.callSource = undefined;
    }
  });

  app.post("/api/screenshots/record", async (req, res) => {
    const handler = ctx.registry.get("manage_camera");
    ctx.callSource = "dashboard";
    try {
      const result = (await handler!({
        action: "record",
        path: req.body?.path,
        distance: req.body?.distance,
        seconds: req.body?.seconds,
        fps: req.body?.fps,
        maxDimension: req.body?.maxDimension,
      })) as {
        galleryId?: string;
        width?: number;
        height?: number;
        source?: string;
        mimeType?: string;
        clipMimeType?: string;
        frames?: number;
        fps?: number;
        durationSeconds?: number;
        url?: string;
      };
      res.json({
        ok: true,
        id: result.galleryId,
        width: result.width,
        height: result.height,
        source: result.source,
        kind: "video",
        mimeType: result.clipMimeType || result.mimeType,
        frames: result.frames,
        fps: result.fps,
        durationSeconds: result.durationSeconds,
        url: result.url || (result.galleryId ? `/api/screenshots/${result.galleryId}` : "/api/screenshots/latest"),
      });
    } catch (err) {
      res.json({ ok: false, error: withErrorHint(err instanceof Error ? err.message : String(err), "manage_camera") });
    } finally {
      ctx.callSource = undefined;
    }
  });

  // Run raw Luau from the dashboard console
  app.post("/api/console", async (req, res) => {
    const code = String(req.body?.code ?? "");
    const handler = ctx.registry.get("execute_luau");
    ctx.callSource = "dashboard";
    try {
      const result = await handler!({ code });
      res.json({ ok: true, result });
    } catch (err) {
      res.json({ ok: false, error: withErrorHint(err instanceof Error ? err.message : String(err), "execute_luau") });
    } finally {
      ctx.callSource = undefined;
    }
  });

  // Run any registered tool from the dashboard
  app.post("/api/tool", async (req, res) => {
    const { tool, args } = req.body ?? {};
    const handler = ctx.registry.get(String(tool));
    if (!handler) {
      res.status(404).json({ ok: false, error: `Unknown tool: ${tool}` });
      return;
    }
    const proxy = req.headers["x-robridge-proxy"] === "1";
    ctx.callSource = proxy ? "proxy" : "dashboard";
    if (proxy) {
      ctx.config.mcp.proxyCalls += 1;
      ctx.config.mcp.lastClientAt = Date.now();
      ctx.config.mcp.lastClientSource = "proxy";
    }
    try {
      const result = await handler(args ?? {});
      res.json({ ok: true, result });
    } catch (err) {
      res.json({ ok: false, error: withErrorHint(err instanceof Error ? err.message : String(err), String(tool)) });
    } finally {
      ctx.callSource = undefined;
    }
  });

  // Forwarded stdio MCP (Cursor spawn that lost :3737) announces itself here.
  app.post("/api/mcp/heartbeat", (_req, res) => {
    ctx.config.mcp.lastHeartbeatAt = Date.now();
    if (ctx.config.mcp.lastClientSource == null) ctx.config.mcp.lastClientSource = "heartbeat";
    res.json({ ok: true });
  });

  // ---- Static dashboard ----
  app.use(express.static(UI_DIR));

  return app;
}
