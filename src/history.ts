export interface HistoryEntry {
  id: number;
  time: number;
  tool: string;
  action: string;
  status: "OK" | "FAILED" | "NO_STUDIO";
  durationMs: number;
  error?: string;
  source?: "mcp" | "dashboard" | "proxy";
}

const MAX_ENTRIES = 1000;

export class History {
  private entries: HistoryEntry[] = [];
  private nextId = 1;

  record(entry: Omit<HistoryEntry, "id">): HistoryEntry {
    const full = { ...entry, id: this.nextId++ };
    this.entries.push(full);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    return full;
  }

  list(limit = 200): HistoryEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  clear() {
    this.entries = [];
  }

  count() {
    return this.entries.length;
  }

  summary() {
    let ok = 0;
    let failed = 0;
    let noStudio = 0;
    for (const e of this.entries) {
      if (e.status === "OK") ok++;
      else if (e.status === "NO_STUDIO") noStudio++;
      else failed++;
    }
    const last = this.entries[this.entries.length - 1];
    return {
      total: this.entries.length,
      ok,
      failed,
      noStudio,
      lastCallAt: last?.time ?? null,
    };
  }

  /** Aggregated per tool.action stats for the dashboard. */
  stats() {
    const byTool = new Map<
      string,
      { tool: string; calls: number; ok: number; failed: number; noStudio: number; totalMs: number; actions: Map<string, { action: string; calls: number; ok: number; failed: number; noStudio: number; totalMs: number }> }
    >();
    for (const e of this.entries) {
      let t = byTool.get(e.tool);
      if (!t) {
        t = { tool: e.tool, calls: 0, ok: 0, failed: 0, noStudio: 0, totalMs: 0, actions: new Map() };
        byTool.set(e.tool, t);
      }
      t.calls++;
      t.totalMs += e.durationMs;
      if (e.status === "OK") t.ok++;
      else if (e.status === "NO_STUDIO") t.noStudio++;
      else t.failed++;
      const actionKey = e.action || "-";
      let a = t.actions.get(actionKey);
      if (!a) {
        a = { action: actionKey, calls: 0, ok: 0, failed: 0, noStudio: 0, totalMs: 0 };
        t.actions.set(actionKey, a);
      }
      a.calls++;
      a.totalMs += e.durationMs;
      if (e.status === "OK") a.ok++;
      else if (e.status === "NO_STUDIO") a.noStudio++;
      else a.failed++;
    }
    return [...byTool.values()]
      .map((t) => ({
        tool: t.tool,
        calls: t.calls,
        ok: t.ok,
        failed: t.failed,
        noStudio: t.noStudio,
        avgMs: t.calls ? Math.round(t.totalMs / t.calls) : 0,
        actions: [...t.actions.values()]
          .map((a) => ({
            action: a.action,
            calls: a.calls,
            ok: a.ok,
            failed: a.failed,
            noStudio: a.noStudio,
            avgMs: a.calls ? Math.round(a.totalMs / a.calls) : 0,
          }))
          .sort((x, y) => y.calls - x.calls),
      }))
      .sort((x, y) => y.calls - x.calls);
  }
}
