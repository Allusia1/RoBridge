import { randomUUID } from "node:crypto";
import { type SessionPreflight, withErrorHint } from "./errors.js";

export interface StudioSession {
  sessionId: string;
  placeName: string;
  placeId: number;
  gameId: number;
  mode: string; // "edit" | "play" | "run"
  pluginVersion: string;
  connectedAt: number;
  lastSeen: number;
  preflight?: SessionPreflight;
}

export type JobTarget = "edit" | "play" | "any";

export interface Job {
  id: string;
  tool: string;
  code: string;
  args: unknown;
  target: JobTarget;
  createdAt: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface ParkedPoller {
  deliver: (job: Job | null) => void;
  timer: NodeJS.Timeout;
  sessionId: string;
  pluginVersion: string;
  connectedAt: number;
}

const SESSION_STALE_MS = 45_000;
const SESSION_LIVE_MS = 8_000;
/** Disconnected rows are for a brief "just left" hint, not a 10-minute ghost list. */
const DISCONNECTED_KEEP_MS = 90_000;
const DEFAULT_JOB_TIMEOUT_MS = 30_000;
/** Keep under Studio HttpService's ~20–30s read timeout so idle polls are not Timedout. */
const LONG_POLL_MS = 12_000;
const PLAY_POLL_MS = 4_000;

function isPlayAgent(info: { mode?: string; pluginVersion?: string; playAgent?: boolean } | undefined) {
  return !!(info?.playAgent || (info?.pluginVersion ?? "").startsWith("play-"));
}

function isGenericPlaceName(name: string | undefined) {
  const n = (name ?? "").trim().toLowerCase();
  return !n || n === "game" || n === "unknown place";
}

/** Group key for the dashboard list. Unpublished (placeId 0) stay unique by session. */
export function placeListKey(s: { placeId?: number | string | null; sessionId: string }) {
  if (s.placeId === undefined || s.placeId === null || s.placeId === "") return `session:${s.sessionId}`;
  const key = String(s.placeId);
  if (key === "0") return `session:${s.sessionId}`;
  return key;
}

type ListableSession = {
  sessionId: string;
  placeId?: number | string | null;
  placeName?: string;
  connected?: boolean;
  lastSeen?: number;
  playAgent?: boolean;
  pluginVersion?: string;
  mode?: string;
};

/**
 * One dashboard row per placeId.
 * Prefer connected, then edit over play-agent, then most recently seen.
 * Play DataModel name "Game" yields to a real edit place name when one exists.
 */
export function collapseSessionsByPlace<T extends ListableSession>(sessions: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const s of sessions) {
    const key = placeListKey(s);
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const live = group.filter((s) => s.connected === true);
    const pool = live.length ? live : group;
    pool.sort((a, b) => {
      const aPlay = isPlayAgent(a);
      const bPlay = isPlayAgent(b);
      if (aPlay !== bPlay) return aPlay ? 1 : -1;
      return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
    });
    const winner = { ...pool[0] };
    const namedEdit = group.find((s) => !isPlayAgent(s) && !isGenericPlaceName(s.placeName));
    const named = namedEdit ?? group.find((s) => !isGenericPlaceName(s.placeName));
    if (named?.placeName) winner.placeName = named.placeName;
    out.push(winner);
  }
  return out.sort(
    (a, b) => Number(!!b.connected) - Number(!!a.connected) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
  );
}

function versionRank(v: string | undefined): number {
  if (!v || v.startsWith("play-")) return 0;
  const parts = v.split(".").map((n) => Number(n) || 0);
  return (parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0);
}

export class Bridge {
  private sessions = new Map<string, StudioSession>();
  private disconnected = new Map<string, StudioSession>();
  private queueEdit: Job[] = [];
  private queuePlay: Job[] = [];
  private inflight = new Map<string, Job>();
  private pollersEdit: ParkedPoller[] = [];
  private pollersPlay: ParkedPoller[] = [];
  /** Edit-looking plugin instances that booted inside a Play DataModel. */
  private shadowEdit = new Set<string>();
  private playStartedAt = 0;

  private isSessionPolling(sessionId: string): boolean {
    return (
      this.pollersEdit.some((p) => p.sessionId === sessionId) ||
      this.pollersPlay.some((p) => p.sessionId === sessionId)
    );
  }

  private isSessionLive(s: StudioSession, now = Date.now()): boolean {
    return this.isSessionPolling(s.sessionId) || now - s.lastSeen < SESSION_LIVE_MS;
  }

  private pruneSessions() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastSeen > SESSION_STALE_MS && !this.isSessionPolling(id)) {
        this.sessions.delete(id);
        // Play agents mint a new GUID every Play — never keep them as list ghosts.
        if (!isPlayAgent(s)) this.disconnected.set(id, s);
      }
    }
    const livePlaceIds = new Set(
      [...this.sessions.values()].filter((s) => s.placeId).map((s) => String(s.placeId))
    );
    for (const [id, s] of this.disconnected) {
      if (isPlayAgent(s)) this.disconnected.delete(id);
      else if (now - s.lastSeen > DISCONNECTED_KEEP_MS) this.disconnected.delete(id);
      else if (s.placeId && livePlaceIds.has(String(s.placeId))) this.disconnected.delete(id);
    }
  }

  private snapshot(s: StudioSession, connected: boolean, now = Date.now()) {
    return {
      sessionId: s.sessionId,
      placeName: s.placeName,
      placeId: s.placeId,
      gameId: s.gameId,
      mode: s.mode,
      pluginVersion: s.pluginVersion,
      connectedAt: s.connectedAt,
      lastSeen: s.lastSeen,
      lastSeenMsAgo: now - s.lastSeen,
      connected,
      polling: this.isSessionPolling(s.sessionId),
      playAgent: isPlayAgent(s),
      preflight: s.preflight,
    };
  }

  /** Sessions that have been seen recently. */
  activeSessions(): StudioSession[] {
    this.pruneSessions();
    return [...this.sessions.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  isConnected(): boolean {
    return this.pollersEdit.length + this.pollersPlay.length > 0 || this.activeSessions().length > 0;
  }

  isPlayConnected(): boolean {
    const now = Date.now();
    return (
      this.pollersPlay.length > 0 ||
      this.activeSessions().some((s) => isPlayAgent(s) && now - s.lastSeen < 25_000)
    );
  }

  /** True only while a play agent currently has a parked long-poll (not lastSeen sticky). */
  isPlayPolling(): boolean {
    return this.pollersPlay.length > 0;
  }

  isEditConnected(): boolean {
    const now = Date.now();
    return (
      this.pollersEdit.length > 0 ||
      this.activeSessions().some((s) => !isPlayAgent(s) && now - s.lastSeen < SESSION_STALE_MS)
    );
  }

  hasFreshPlayAgent(since: number): boolean {
    return (
      this.pollersPlay.length > 0 ||
      this.activeSessions().some((s) => isPlayAgent(s) && s.lastSeen >= since)
    );
  }

  dropPlaySessions() {
    for (const [id, s] of this.sessions) {
      if (isPlayAgent(s)) this.sessions.delete(id);
    }
    for (const p of this.pollersPlay) clearTimeout(p.timer);
    this.pollersPlay = [];
    for (const job of this.queuePlay) {
      clearTimeout(job.timer);
      job.reject(new Error("Playtest stopped"));
    }
    this.queuePlay = [];
  }

  markPlayStarting() {
    this.playStartedAt = Date.now();
    this.shadowEdit.clear();
  }

  clearPlayStarting() {
    this.playStartedAt = 0;
    this.shadowEdit.clear();
  }

  private playLikelyActive(): boolean {
    if (this.isPlayConnected() || this.pollersPlay.length > 0) return true;
    return this.playStartedAt > 0 && Date.now() - this.playStartedAt < 60_000;
  }

  private isShadowEdit(sessionId: string, isNew: boolean, playAgent: boolean): boolean {
    if (playAgent) return false;
    if (this.shadowEdit.has(sessionId)) return true;
    if (isNew && this.playLikelyActive()) {
      this.shadowEdit.add(sessionId);
      return true;
    }
    return false;
  }

  /** Queue Luau code for execution in Studio. Resolves with the decoded result. */
  run(tool: string, code: string, args: unknown, timeoutMs = DEFAULT_JOB_TIMEOUT_MS, target: JobTarget = "edit"): Promise<unknown> {
    const resolved: JobTarget = target === "any" ? (this.isPlayConnected() ? "play" : "edit") : target;
    if (resolved === "play" && !this.isPlayConnected() && this.pollersPlay.length === 0) {
      return Promise.reject(
        new Error(
          withErrorHint("No playtest session connected. Start play with manage_studio.play_start first.", tool)
        )
      );
    }
    if (resolved === "edit" && !this.isConnected()) {
      return Promise.reject(
        new Error(
          withErrorHint(
            "No Roblox Studio session connected. Open the place in Roblox Studio with the RoBridge plugin and click Allow HTTP if prompted.",
            tool
          )
        )
      );
    }
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: randomUUID(),
        tool,
        code,
        args: args ?? {},
        target: resolved,
        createdAt: Date.now(),
        resolve,
        reject,
        timer: setTimeout(() => {
          this.inflight.delete(job.id);
          const q = resolved === "play" ? this.queuePlay : this.queueEdit;
          const qi = q.indexOf(job);
          if (qi >= 0) q.splice(qi, 1);
          const playNote = this.isPlayConnected()
            ? " Playtest is running — execute_luau and most tools are Edit-only."
            : "";
          reject(
            new Error(
              withErrorHint(`Studio did not respond within ${timeoutMs / 1000}s (tool: ${tool}).${playNote}`, tool)
            )
          );
        }, timeoutMs),
      };
      const poller = resolved === "play" ? this.pollersPlay.shift() : this.takeEditPoller();
      if (poller) {
        clearTimeout(poller.timer);
        this.inflight.set(job.id, job);
        poller.deliver(job);
      } else {
        (resolved === "play" ? this.queuePlay : this.queueEdit).push(job);
      }
    });
  }

  private takeEditPoller(): ParkedPoller | undefined {
    if (this.pollersEdit.length === 0) return undefined;
    let best = -1;
    for (let i = 0; i < this.pollersEdit.length; i++) {
      const a = this.pollersEdit[i];
      if (this.shadowEdit.has(a.sessionId)) continue;
      if (best < 0) {
        best = i;
        continue;
      }
      const b = this.pollersEdit[best];
      const ra = versionRank(a.pluginVersion);
      const rb = versionRank(b.pluginVersion);
      if (ra > rb || (ra === rb && a.connectedAt >= b.connectedAt)) best = i;
    }
    if (best < 0) return undefined;
    return this.pollersEdit.splice(best, 1)[0];
  }

  /** Plugin / play-agent long-poll. Resolves with a job or null after LONG_POLL_MS. */
  poll(info: Partial<StudioSession> & { sessionId: string }): Promise<Job | null> {
    const existed = this.sessions.has(info.sessionId) || this.disconnected.has(info.sessionId);
    this.touchSession(info);
    const play = isPlayAgent(info);
    const shadow = this.isShadowEdit(info.sessionId, !existed, play);
    const queue = play ? this.queuePlay : this.queueEdit;
    const pollers = play ? this.pollersPlay : this.pollersEdit;
    const session = this.sessions.get(info.sessionId);
    for (let i = pollers.length - 1; i >= 0; i--) {
      if (pollers[i].sessionId === info.sessionId) {
        const old = pollers[i];
        clearTimeout(old.timer);
        old.deliver(null);
      }
    }
    const job = shadow ? undefined : queue.shift();
    if (job) {
      this.inflight.set(job.id, job);
      return Promise.resolve(job);
    }
    return new Promise((deliver) => {
      const poller: ParkedPoller = {
        sessionId: info.sessionId,
        pluginVersion: info.pluginVersion ?? session?.pluginVersion ?? "",
        connectedAt: session?.connectedAt ?? Date.now(),
        deliver: (j) => {
          const i = pollers.indexOf(poller);
          if (i >= 0) pollers.splice(i, 1);
          deliver(j);
        },
        timer: setTimeout(() => poller.deliver(null), play ? PLAY_POLL_MS : LONG_POLL_MS),
      };
      pollers.push(poller);
    });
  }

  /** Plugin posts a job result. */
  complete(jobId: string, ok: boolean, result: unknown, error?: string): boolean {
    const job = this.inflight.get(jobId);
    if (!job) return false;
    this.inflight.delete(jobId);
    clearTimeout(job.timer);
    if (ok) job.resolve(result);
    else job.reject(new Error(withErrorHint(error || "Unknown Studio error", job.tool)));
    return true;
  }

  touchSession(info: Partial<StudioSession> & { sessionId: string }) {
    const existing = this.sessions.get(info.sessionId) ?? this.disconnected.get(info.sessionId);
    const now = Date.now();
    this.disconnected.delete(info.sessionId);
    this.sessions.set(info.sessionId, {
      sessionId: info.sessionId,
      placeName: info.placeName ?? existing?.placeName ?? "Unknown Place",
      placeId: info.placeId ?? existing?.placeId ?? 0,
      gameId: info.gameId ?? existing?.gameId ?? 0,
      mode: info.mode ?? existing?.mode ?? "edit",
      pluginVersion: info.pluginVersion ?? existing?.pluginVersion ?? "?",
      connectedAt: existing?.connectedAt ?? now,
      lastSeen: now,
      preflight: info.preflight ?? existing?.preflight,
    });
    if (!isPlayAgent(info)) {
      const incomingRank = versionRank(info.pluginVersion);
      for (const [id, s] of this.sessions) {
        if (id === info.sessionId || isPlayAgent(s)) continue;
        if (!(s.placeId && info.placeId && s.placeId === info.placeId)) continue;
        // Keep live Team Create / second-Studio sessions. Only drop a stale
        // same-place duplicate left behind by a plugin reload.
        if (this.isSessionLive(s, now)) continue;
        if (incomingRank >= versionRank(s.pluginVersion)) {
          this.sessions.delete(id);
        }
      }
    }
  }

  allSessions() {
    this.pruneSessions();
    const now = Date.now();
    const seen = new Set<string>();
    const out: ReturnType<Bridge["snapshot"]>[] = [];
    for (const s of this.sessions.values()) {
      seen.add(s.sessionId);
      out.push(this.snapshot(s, this.isSessionLive(s, now), now));
    }
    for (const s of this.disconnected.values()) {
      if (seen.has(s.sessionId)) continue;
      out.push(this.snapshot(s, false, now));
    }
    return collapseSessionsByPlace(out);
  }

  stats() {
    const sessions = this.allSessions();
    return {
      queued: this.queueEdit.length + this.queuePlay.length,
      queuedEdit: this.queueEdit.length,
      queuedPlay: this.queuePlay.length,
      inflight: this.inflight.size,
      parkedPollers: this.pollersEdit.length + this.pollersPlay.length,
      playConnected: this.isPlayConnected(),
      connectedSessions: sessions.filter((s) => s.connected).length,
      sessions,
    };
  }
}
