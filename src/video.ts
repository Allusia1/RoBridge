import { deflateSync } from "node:zlib";
import { pngChunk, rgbaToPng } from "./png.js";

function rawScanlines(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[stride * y] = 0;
    rgba.copy(raw, stride * y + 1, y * width * 4, (y + 1) * width * 4);
  }
  return raw;
}

/** Animated PNG (APNG). Plays in `<img>` and as a single gallery file. */
export function rgbaFramesToApng(frames: Buffer[], width: number, height: number, fps: number): Buffer {
  if (frames.length === 0) throw new Error("No frames to encode");
  const delayDen = Math.max(1, Math.round(fps));
  const chunks: Buffer[] = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunks.push(pngChunk("IHDR", ihdr));
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  actl.writeUInt32BE(0, 4);
  chunks.push(pngChunk("acTL", actl));
  let seq = 0;
  for (let i = 0; i < frames.length; i++) {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(seq++, 0);
    fctl.writeUInt32BE(width, 4);
    fctl.writeUInt32BE(height, 8);
    fctl.writeUInt16BE(1, 20);
    fctl.writeUInt16BE(delayDen, 22);
    fctl[24] = 1;
    fctl[25] = 0;
    chunks.push(pngChunk("fcTL", fctl));
    const idat = deflateSync(rawScanlines(frames[i], width, height), { level: 1 });
    if (i === 0) {
      chunks.push(pngChunk("IDAT", idat));
    } else {
      const fdat = Buffer.alloc(4 + idat.length);
      fdat.writeUInt32BE(seq++, 0);
      idat.copy(fdat, 4);
      chunks.push(pngChunk("fdAT", fdat));
    }
  }
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

export function rgbaFramesToPngs(frames: Buffer[], width: number, height: number): Buffer[] {
  return frames.map((rgba) => rgbaToPng(width, height, rgba));
}
