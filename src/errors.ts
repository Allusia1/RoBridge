/** Shared fix strings so MCP and HTTP tool errors tell the agent what to do next. */

export const FIX = {
  HTTP: "Enable File → Game Settings → Security → Allow HTTP Requests.",
  MESH_IMAGE:
    "Enable File → Game Settings → Security → Allow Mesh / Image APIs (needed for CaptureService screenshots and EditableImage).",
  LOADSTRING:
    "execute_luau is Edit-only (plugin loadstring). In Play use manage_studio.run_test / play agents, or play_stop first.",
  NO_SESSION:
    "Studio plugin not connected. Open the place in Roblox Studio and click Allow HTTP if prompted.",
  PLAY_RUNNING: "Press Stop in Studio (or manage_studio.play_stop), then retry.",
  SET_VS_MANY:
    "Use manage_properties action 'set_many' with a properties map, or action 'set' with property + value. Never omit property on 'set'.",
  TIMEOUT:
    "Studio did not respond. If a playtest is running, press Stop in Studio (execute_luau is Edit-only). If the plugin is disconnected, open the place and click Allow HTTP.",
} as const;

export type SessionPreflight = {
  mode?: string;
  httpEnabled?: boolean;
  loadstring?: boolean;
  meshImageApis?: boolean;
  placeId?: number;
};

export function hintForError(message: string, tool?: string): string | undefined {
  const m = message ?? "";
  const lower = m.toLowerCase();

  if (
    /failed to set \S+\.nil\b/i.test(m) ||
    (lower.includes("string expected, got nil") &&
      (lower.includes("set") || lower.includes("property") || lower.includes("argument #2"))) ||
    lower.includes("property name is missing")
  ) {
    if (lower.includes("set_many")) return undefined;
    return FIX.SET_VS_MANY;
  }

  if (
    /\balready (running|in progress|playing)\b/i.test(m) ||
    /cannot start .*(play|test)/i.test(lower) ||
    /playtest is already/i.test(lower) ||
    /test is already/i.test(lower) ||
    /still in progress/i.test(lower) ||
    /previous (one|test)/i.test(lower)
  ) {
    return FIX.PLAY_RUNNING;
  }

  if (
    lower.includes("loadstring") ||
    (tool === "execute_luau" &&
      (lower.includes("did not respond") || lower.includes("play") || lower.includes("no roblox studio")))
  ) {
    if (lower.includes("edit-only") && lower.includes("run_test")) return undefined;
    return FIX.LOADSTRING;
  }

  if (
    lower.includes("editableimage") ||
    lower.includes("editablemesh") ||
    lower.includes("captureservice") ||
    lower.includes("mesh / image") ||
    lower.includes("mesh/image")
  ) {
    return FIX.MESH_IMAGE;
  }

  if (
    /http requests are not enabled/i.test(m) ||
    /httpenabled/i.test(m) ||
    /httpservice is not (allowed|enabled)/i.test(m) ||
    /cannot send http/i.test(m) ||
    /http requests.*(disabled|not enabled)/i.test(m) ||
    /http service.*(disabled|not enabled)/i.test(m) ||
    /allow http requests/i.test(m)
  ) {
    return FIX.HTTP;
  }

  if (
    /no roblox studio session/i.test(m) ||
    /studio plugin not connected/i.test(m) ||
    /no studio session/i.test(m) ||
    (/is polling/i.test(m) && /studio/i.test(m))
  ) {
    return FIX.NO_SESSION;
  }

  if (/did not respond/i.test(m)) {
    return FIX.TIMEOUT;
  }

  return undefined;
}

/** Append a Fix: line unless the message already includes the hint. */
export function withErrorHint(message: string, tool?: string): string {
  const hint = hintForError(message, tool);
  if (!hint) return message;
  if (message.includes(hint) || /(?:^|\n)Fix:/.test(message)) return message;
  const core = hint.replace(/\s*\([^)]*\)/g, "").replace(/\.+$/, "").trim();
  if (core && message.includes(core)) return message;
  return `${message}\nFix: ${hint}`;
}

export function compactFixes(opts: {
  studioConnected: boolean;
  playConnected?: boolean;
  preflight?: SessionPreflight | null;
}): string[] {
  if (!opts.studioConnected) return [FIX.NO_SESSION];
  const fixes: string[] = [];
  const p = opts.preflight;
  if (p) {
    if (p.httpEnabled === false) fixes.push(FIX.HTTP);
    if (p.loadstring === false) fixes.push(FIX.LOADSTRING);
    if (p.meshImageApis === false) fixes.push(FIX.MESH_IMAGE);
    if (p.mode && p.mode !== "edit") fixes.push(FIX.LOADSTRING);
  }
  if (opts.playConnected && !fixes.includes(FIX.LOADSTRING)) {
    /* Play is fine; edit-only tools still need the plugin. Don't warn unless loadstring failed. */
  }
  return fixes;
}
