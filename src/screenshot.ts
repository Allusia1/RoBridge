import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rgbaToPng } from "./png.js";
import { rgbaFramesToApng, rgbaFramesToPngs } from "./video.js";

export { rgbaToPng } from "./png.js";

interface TileUpload {
  width: number;
  height: number;
  received: number;
  rgba: Buffer;
}

const uploads = new Map<string, TileUpload>();

export function beginScreenshotUpload(id: string, width: number, height: number) {
  uploads.set(id, { width, height, received: 0, rgba: Buffer.alloc(width * height * 4) });
}

export function addScreenshotTile(id: string, y: number, rows: number, data: Buffer) {
  const u = uploads.get(id);
  if (!u) throw new Error(`Unknown screenshot upload ${id}`);
  const expected = u.width * rows * 4;
  if (data.length < expected) throw new Error(`Tile too small at y=${y}`);
  data.copy(u.rgba, y * u.width * 4, 0, expected);
  u.received += rows;
}

export function finishScreenshotUpload(id: string): {
  __imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  galleryId: string;
} {
  const u = uploads.get(id);
  if (!u) throw new Error(`Unknown screenshot upload ${id}`);
  uploads.delete(id);
  if (u.received < u.height) throw new Error(`Incomplete screenshot (${u.received}/${u.height} rows)`);
  const png = rgbaToPng(u.width, u.height, u.rgba);
  const item = saveToGallery(png, { width: u.width, height: u.height, source: "CaptureService" });
  return { __imageBase64: png.toString("base64"), mimeType: "image/png", width: u.width, height: u.height, galleryId: item.id };
}

export type GalleryKind = "image" | "video";

export interface GalleryItem {
  id: string;
  time: number;
  width: number;
  height: number;
  source: string;
  kind: GalleryKind;
  mimeType: string;
  durationSeconds?: number;
  fps?: number;
  frameCount?: number;
}

interface GalleryEntry {
  meta: GalleryItem;
  data: Buffer;
  poster?: Buffer;
  frames?: Buffer[];
}

const gallery: GalleryEntry[] = [];
const GALLERY_MAX = 24;
const GALLERY_DIR = path.resolve("gallery");

function persistGalleryFile(id: string, ext: string, data: Buffer) {
  try {
    mkdirSync(GALLERY_DIR, { recursive: true });
    writeFileSync(path.join(GALLERY_DIR, `${id}.${ext}`), data);
  } catch {
    /* disk persist is optional */
  }
}

export function saveToGallery(png: Buffer, extra: { width: number; height: number; source: string }): GalleryItem {
  const meta: GalleryItem = {
    id: randomUUID(),
    time: Date.now(),
    kind: "image",
    mimeType: "image/png",
    ...extra,
  };
  gallery.unshift({ meta, data: png, poster: png });
  if (gallery.length > GALLERY_MAX) gallery.pop();
  persistGalleryFile(meta.id, "png", png);
  return meta;
}

export function saveVideoToGallery(
  data: Buffer,
  extra: {
    width: number;
    height: number;
    source: string;
    mimeType: string;
    durationSeconds: number;
    fps: number;
    frameCount: number;
    poster: Buffer;
    frames: Buffer[];
  }
): GalleryItem {
  const { poster, frames, ...rest } = extra;
  const meta: GalleryItem = { id: randomUUID(), time: Date.now(), kind: "video", ...rest };
  gallery.unshift({ meta, data, poster, frames });
  if (gallery.length > GALLERY_MAX) gallery.pop();
  const ext = extra.mimeType === "video/webm" ? "webm" : extra.mimeType === "image/gif" ? "gif" : "apng";
  persistGalleryFile(meta.id, ext, data);
  persistGalleryFile(meta.id, "poster.png", poster);
  return meta;
}

export function listGallery(): GalleryItem[] {
  return gallery.map((g) => g.meta);
}

export function getGalleryEntry(id: string): GalleryEntry | null {
  if (id === "latest") return gallery[0] ?? null;
  return gallery.find((g) => g.meta.id === id) ?? null;
}

export function getGalleryPng(id: string): Buffer | null {
  const entry = getGalleryEntry(id);
  if (!entry) return null;
  if (entry.meta.kind === "image") return entry.data;
  return entry.poster ?? entry.frames?.[0] ?? null;
}

export function getGalleryMedia(id: string): { data: Buffer; mimeType: string } | null {
  const entry = getGalleryEntry(id);
  if (!entry) return null;
  return { data: entry.data, mimeType: entry.meta.mimeType };
}

export function getGalleryPoster(id: string): Buffer | null {
  const entry = getGalleryEntry(id);
  if (!entry) return null;
  return entry.poster ?? (entry.meta.kind === "image" ? entry.data : null);
}

export function getGalleryFrame(id: string, index: number): Buffer | null {
  const entry = getGalleryEntry(id);
  if (!entry?.frames?.length) return getGalleryPoster(id);
  return entry.frames[index] ?? null;
}

export function clearGallery() {
  gallery.length = 0;
}

interface RecordingUpload {
  width: number;
  height: number;
  fps: number;
  frames: Buffer[];
}

const recordings = new Map<string, RecordingUpload>();

export function beginRecordingUpload(id: string, width: number, height: number, fps: number) {
  recordings.set(id, { width, height, fps, frames: [] });
}

export function addRecordingFrame(id: string, data: Buffer) {
  const rec = recordings.get(id);
  if (!rec) throw new Error(`Unknown recording ${id}`);
  const expected = rec.width * rec.height * 4;
  if (data.length < expected) throw new Error(`Recording frame too small (${data.length} < ${expected})`);
  rec.frames.push(Buffer.from(data.subarray(0, expected)));
}

export function abortRecordingUpload(id: string) {
  recordings.delete(id);
}

export function finishRecordingUpload(id: string, actualFps?: number): {
  __imageBase64: string;
  mimeType: string;
  clipMimeType: string;
  width: number;
  height: number;
  galleryId: string;
  kind: "video";
  source: string;
  frames: number;
  fps: number;
  durationSeconds: number;
} {
  const rec = recordings.get(id);
  if (!rec) throw new Error(`Unknown recording ${id}`);
  recordings.delete(id);
  if (rec.frames.length === 0) throw new Error("Recording captured 0 frames");
  const fps = Math.max(1, actualFps || rec.fps || rec.frames.length);
  const durationSeconds = rec.frames.length / fps;
  const apng = rgbaFramesToApng(rec.frames, rec.width, rec.height, fps);
  const framePngs = rgbaFramesToPngs(rec.frames, rec.width, rec.height);
  const poster = framePngs[0];
  const item = saveVideoToGallery(apng, {
    width: rec.width,
    height: rec.height,
    source: "CaptureService",
    mimeType: "image/apng",
    durationSeconds,
    fps,
    frameCount: rec.frames.length,
    poster,
    frames: framePngs,
  });
  return {
    __imageBase64: poster.toString("base64"),
    mimeType: "image/png",
    clipMimeType: "image/apng",
    width: rec.width,
    height: rec.height,
    galleryId: item.id,
    kind: "video",
    source: "CaptureService",
    frames: rec.frames.length,
    fps,
    durationSeconds,
  };
}
