import { z } from "zod";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compactFixes, FIX, withErrorHint } from "../errors.js";
import { PLAY_CLIENT_NAME, PLAY_RF_NAME, PLAY_SERVER_NAME, playClientSource, playServerSource } from "../playAgent.js";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

export function registerStudioTools(ctx: ToolContext) {
  let selectionCache: { time: number; result: unknown } | null = null;

  defineTool(
    ctx,
    "manage_selection",
    "Get or set the Studio selection. Actions: get, set (paths array), add, remove, clear, details (selection + common properties, optional maxDepth descendants + includeAncestors), cached (last known selection without a Studio round-trip; maxAge ms), context (selection with script source, properties, and children), watch (install a selection-change watcher; call again to collect changes).",
    {
      action: z.enum(["get", "set", "add", "remove", "clear", "details", "cached", "context", "watch"]),
      paths: z.array(z.string()).optional(),
      maxAge: z.number().optional().describe("cached: max cache age in ms (default 30000, 0 = any age)"),
      maxDepth: z.number().optional().describe("details: descendant depth (default 1)"),
      includeAncestors: z.boolean().optional().describe("details: include ancestor chain"),
      includeSource: z.boolean().optional().describe("context: include script sources (default true)"),
      includeProperties: z.boolean().optional().describe("context: include common properties (default true)"),
      includeChildren: z.boolean().optional().describe("context: include immediate children (default false)"),
    },
    async (args, ctx) => {
      if (args.action === "cached") {
        const maxAge = typeof args.maxAge === "number" ? args.maxAge : 30_000;
        if (selectionCache && (maxAge === 0 || Date.now() - selectionCache.time <= maxAge)) {
          return { cached: true, ageMs: Date.now() - selectionCache.time, ...(selectionCache.result as Record<string, unknown>) };
        }
        args = { ...args, action: "get" };
      }
      const result = await runLuau(
        ctx,
        "manage_selection",
        `
local RB, A = ...
local Sel = game:GetService("Selection")
if A.action == "get" then
  local out = {}
  for _, i in ipairs(Sel:Get()) do table.insert(out, RB.summary(i)) end
  return { items = out }
elseif A.action == "set" or A.action == "add" then
  local items = A.action == "add" and Sel:Get() or {}
  for _, p in ipairs(A.paths or {}) do table.insert(items, RB.resolve(p)) end
  Sel:Set(items)
  return { count = #items }
elseif A.action == "remove" then
  local drop = {}
  for _, p in ipairs(A.paths or {}) do drop[RB.resolve(p)] = true end
  local keep = {}
  for _, i in ipairs(Sel:Get()) do
    if not drop[i] then table.insert(keep, i) end
  end
  Sel:Set(keep)
  return { count = #keep }
elseif A.action == "clear" then
  Sel:Set({})
  return { count = 0 }
elseif A.action == "details" then
  local maxDepth = A.maxDepth or 1
  local function walk(i, d)
    local node = RB.summary(i, true)
    if A.includeAncestors then
      local chain = {}
      local p = i.Parent
      while p do table.insert(chain, { name = p.Name, className = p.ClassName }) p = p.Parent end
      node.ancestors = chain
    end
    if d < maxDepth then
      local kids = {}
      for _, c in ipairs(i:GetChildren()) do
        table.insert(kids, walk(c, d + 1))
        if #kids >= 50 then break end
      end
      if #kids > 0 then node.children = kids end
    end
    return node
  end
  local out = {}
  for _, i in ipairs(Sel:Get()) do table.insert(out, walk(i, 0)) end
  return { items = out }
elseif A.action == "context" then
  local out = {}
  for _, i in ipairs(Sel:Get()) do
    local node = RB.summary(i, A.includeProperties ~= false)
    node.attributes = RB.encode(i:GetAttributes())
    node.tags = i:GetTags()
    if A.includeSource ~= false and i:IsA("LuaSourceContainer") then
      node.source = RB.getSource(i)
    end
    if A.includeChildren then
      local kids = {}
      for _, c in ipairs(i:GetChildren()) do
        table.insert(kids, RB.summary(c))
        if #kids >= 50 then break end
      end
      node.children = kids
    end
    table.insert(out, node)
  end
  return { items = out }
elseif A.action == "watch" then
  if not RB.state.selWatch then
    local watch = { events = {} }
    RB.state.selWatch = watch
    watch.conn = Sel.SelectionChanged:Connect(function()
      local items = {}
      for _, i in ipairs(Sel:Get()) do table.insert(items, i:GetFullName()) end
      table.insert(watch.events, { time = os.time(), items = items })
      if #watch.events > 100 then table.remove(watch.events, 1) end
    end)
    return { watching = true, events = {}, note = "Watcher installed. Call watch again to collect selection changes." }
  end
  local ev = RB.state.selWatch.events
  RB.state.selWatch.events = {}
  return { watching = true, events = ev }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      );
      if (args.action === "get") {
        selectionCache = { time: Date.now(), result };
      }
      return result;
    }
  );

  defineTool(
    ctx,
    "manage_studio",
    "Studio-level operations. Actions: get_mode, play_status, play_start (F5 Play or F8 Run), play_stop, play_pause, play_resume, run_test (inject Luau, play, collect [ROBRIDGE_TEST] logs, stop, write report; auto-records a short viewport clip unless record=false), toggle_ui_preview (StarterGui.ShowDevelopmentGui), test_profile_get/set/reset (Player Emulator — no public API; returns manual_required with instructions), experience_language_get (locale info) / experience_language_set (manual_required), undo, redo, set_waypoint, save_prompt. After adding a player-facing feature (UI, clicks, shop, movement, leaderstats), playtest with run_test or play_start before reporting done. Prefer run_test over manually sequencing play_start + logs + play_stop. Viewport clips: manage_camera.record, or run_test (attaches clip metadata).",
    {
      action: z.enum([
        "get_mode",
        "play_status",
        "play_start",
        "play_stop",
        "play_pause",
        "play_resume",
        "run_test",
        "toggle_ui_preview",
        "test_profile_get",
        "test_profile_set",
        "test_profile_reset",
        "experience_language_get",
        "experience_language_set",
        "undo",
        "redo",
        "set_waypoint",
        "save_prompt",
      ]),
      name: z.string().optional(),
      mode: z.enum(["play", "run"]).optional().describe("play_start / run_test mode: play (F5) or run (F8)"),
      script: z.string().optional().describe("Luau test body for run_test"),
      test_name: z.string().optional().describe("Display name for run_test"),
      timeout: z.number().optional().describe("run_test timeout in seconds (default 60, max 300)"),
      enabled: z.boolean().optional().describe("toggle_ui_preview: explicit value; omit to toggle"),
      testProfile: z.record(z.any()).optional().describe("test_profile_set: Player Emulator profile patch"),
      locale: z.string().optional().describe("experience_language_set: locale id, e.g. en-us"),
      testSource: z.string().optional().describe("play_start: optional run_test script injected with play agents (not saved)"),
      testName: z.string().optional().describe("play_start: name for testSource script (default t0)"),
      record: z.boolean().optional().describe("run_test: attach a viewport clip (default true)"),
      recordSeconds: z.number().optional().describe("run_test / record duration in seconds (default 4)"),
      recordPath: z.string().optional().describe("run_test: optional instance to focus while recording"),
    },
    async (args, ctx) => {
      if (args.action === "run_test") {
        return runAutomatedTest(ctx, args);
      }
      if (args.action === "toggle_ui_preview") {
        return runLuau(
          ctx,
          "manage_studio",
          `
local RB, A = ...
local sg = game:GetService("StarterGui")
local target = A.enabled
if target == nil then target = not sg.ShowDevelopmentGui end
sg.ShowDevelopmentGui = target
return { enabled = sg.ShowDevelopmentGui }
`,
          args
        );
      }
      if (args.action === "test_profile_get" || args.action === "test_profile_set" || args.action === "test_profile_reset") {
        return {
          ok: false,
          action: args.action,
          manual_required: true,
          code: "player_emulator_manual_required",
          instructions:
            "Roblox does not expose a public Player Emulator API to plugins (PlayerEmulatorService is RobloxScriptSecurity). Open Test → Player emulator in Studio and configure the device/locale/policy profile manually.",
        };
      }
      if (args.action === "experience_language_get") {
        return runLuau(
          ctx,
          "manage_studio",
          `
local RB, A = ...
local LS = game:GetService("LocalizationService")
local out = { systemLocaleId = LS.SystemLocaleId, robloxLocaleId = LS.RobloxLocaleId }
local okS, src = pcall(function() return LS.SourceLanguageCode end)
if okS then out.sourceLanguageCode = src end
local tables = {}
for _, c in ipairs(LS:GetChildren()) do
  if c:IsA("LocalizationTable") then table.insert(tables, { name = c.Name, path = c:GetFullName() }) end
end
out.localizationTables = tables
return out
`,
          args
        );
      }
      if (args.action === "experience_language_set") {
        return {
          ok: false,
          action: args.action,
          manual_required: true,
          code: "experience_language_manual_required",
          requestedLocale: args.locale,
          instructions:
            "Changing the experience source/target language requires the Creator Dashboard (creator.roblox.com → your experience → Audience → Localization) or Studio's Localization tools; there is no public plugin API. Set it there, then re-run experience_language_get to confirm.",
        };
      }
      if (args.action === "play_pause" || args.action === "play_resume") {
        return runLuau(
          ctx,
          "manage_studio",
          `
local RB, A = ...
if A.action == "play_pause" and RB.pausePlay then return RB.pausePlay() end
if A.action == "play_resume" and RB.resumePlay then return RB.resumePlay() end
local STS = game:GetService("StudioTestService")
local names = A.action == "play_pause" and {"Pause","PauseTest","PauseCurrentTest"} or {"Resume","ResumeTest","ResumeCurrentTest"}
for _, name in ipairs(names) do
  local ok = pcall(function() STS[name](STS) end)
  if ok then return { ok = true, method = name, action = A.action } end
end
return {
  ok = false,
  action = A.action,
  warning = "StudioTestService has no public pause/resume API in this Studio build. Use play_stop or run_test instead.",
  code = A.action == "play_pause" and "play_pause_manual_required" or "play_resume_manual_required",
}
`,
          { action: args.action }
        );
      }
      if (args.action === "play_status") {
        return studioPlaySnapshot(ctx, true);
      }
      if (args.action === "get_mode") {
        return studioPlaySnapshot(ctx, false);
      }
      if (args.action === "play_start") {
        return startPlaySession(ctx, args);
      }
      if (args.action === "play_stop") {
        return stopPlaySession(ctx);
      }
      return runLuau(
        ctx,
        "manage_studio",
        `
local RB, A = ...
local CHS = game:GetService("ChangeHistoryService")
if A.action == "undo" then
  CHS:Undo()
  return { ok = true }
elseif A.action == "redo" then
  CHS:Redo()
  return { ok = true }
elseif A.action == "set_waypoint" then
  CHS:SetWaypoint(A.name or "RoBridge")
  return { ok = true }
elseif A.action == "save_prompt" then
  local ok = pcall(function() RB.plugin:PromptSaveSelection() end)
  return { prompted = ok }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      );
    }
  );

  defineTool(
    ctx,
    "manage_input",
    "Simulate input. In playtest: walk_to (Humanoid:MoveTo a path/position), click_world (VirtualInput at a 3D instance screen pos), walk_and_click (walk then click — use this to verify world clicks), click_at (viewport pixels), click_path (PlayerGui GuiButton), key, type_text. Clicks use UserInputService:CreateVirtualInput, not VirtualInputManager. In edit: click_path uses VirtualInput plus a LastClick attribute on the ScreenGui.",
    {
      action: z.enum(["click_at", "click_path", "key", "type_text", "walk_to", "click_world", "walk_and_click"]),
      path: z.string().optional().describe("3D instance (walk_to/click_world) or GuiButton (click_path)"),
      position: z.array(z.number()).optional().describe("Optional [x,y,z] walk target if path is omitted"),
      standOff: z.number().optional().describe("How far to stand from the target when walking (default 4)"),
      timeout: z.number().optional().describe("Walk timeout seconds (default 8)"),
      x: z.number().optional(),
      y: z.number().optional(),
      key: z.string().optional().describe("Enum.KeyCode name, e.g. E, Space, W"),
      text: z.string().optional(),
      duration: z.number().optional(),
    },
    async (args, ctx) => {
      if (ctx.bridge.isPlayConnected()) {
        const playAction =
          args.action === "click_path"
            ? "click"
            : args.action === "type_text"
              ? "type"
              : args.action === "key"
                ? "key"
                : args.action === "walk_to"
                  ? "walk_to"
                  : args.action === "click_world"
                    ? "click_world"
                    : args.action === "walk_and_click"
                      ? "walk_and_click"
                      : "click_at";
        const longWalk = playAction === "walk_to" || playAction === "walk_and_click";
        return runLuau(
          ctx,
          "manage_input",
          `local RB, A = ...
if RB.invokeClient then
  return RB.invokeClient(A.playAction, A.payload)
end
error("Play agent missing invokeClient")`,
          { _play: "invokeClient", playAction, payload: args },
          longWalk ? 25_000 : 15_000,
          "play"
        );
      }
      if (args.action === "click_path" || args.action === "type_text") {
        return runLuau(
          ctx,
          "manage_input",
          `
local RB, A = ...
local inst = RB.resolve(A.path)
if A.action == "type_text" then
  if not inst:IsA("TextBox") then error("Not a TextBox") end
  inst.Text = A.text or ""
  return { path = inst:GetFullName(), text = inst.Text, mode = "edit" }
end
if not inst:IsA("GuiButton") then error("Not a GuiButton") end
if RB.clickGui then return RB.clickGui(inst) end
pcall(function() inst:SetAttribute("RoBridgeClicked", os.clock()) end)
local sg = inst
while sg and not sg:IsA("LayerCollector") do sg = sg.Parent end
if sg then pcall(function() sg:SetAttribute("LastClick", inst.Name) end) end
local pos, size = inst.AbsolutePosition, inst.AbsoluteSize
local x = pos.X + math.max(size.X, 1) / 2
local y = pos.Y + math.max(size.Y, 1) / 2
local method = "Attribute"
local viOk, vi = pcall(function() return game:GetService("UserInputService"):CreateVirtualInput() end)
if viOk and vi then
  local sent = pcall(function()
    vi:SendMousePosition(Vector2.new(x, y))
    vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, true)
    task.wait(0.05)
    vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, false)
  end)
  if sent then method = "VirtualInput" end
end
return { clicked = inst:GetFullName(), method = method, at = { x, y }, mode = "edit" }
`,
          args
        );
      }
      return runLuau(
        ctx,
        "manage_input",
        `
local RB, A = ...
local viOk, vi = pcall(function()
  return game:GetService("UserInputService"):CreateVirtualInput()
end)
if not viOk or not vi then error("VirtualInput is not available in this Studio") end
if A.action == "click_at" then
  local p = Vector2.new(A.x or 0, A.y or 0)
  vi:SendMousePosition(p)
  vi:SendMouseButton(p, Enum.UserInputType.MouseButton1, true)
  task.wait(0.05)
  vi:SendMouseButton(p, Enum.UserInputType.MouseButton1, false)
  return { clickedAt = { A.x, A.y }, mode = "edit", method = "VirtualInput" }
elseif A.action == "key" then
  local key = Enum.KeyCode[A.key]
  vi:SendKey(true, key, false)
  task.wait(A.duration or 0.05)
  vi:SendKey(false, key, false)
  return { key = A.key, mode = "edit", method = "VirtualInput" }
end
error("Unknown action")
`,
        args
      );
    }
  );

  defineTool(
    ctx,
    "manage_logs",
    "Read the Roblox Studio output log (captured by the plugin via LogService; play-mode logs come from the play agent). Actions: get (recent entries, optional levelFilter: Print/Warning/Error, containsFilter, since unix-seconds cursor), errors (Error-level only), clear.",
    {
      action: z.enum(["get", "errors", "clear"]),
      limit: z.number().optional().describe("Max entries (default 100)"),
      levelFilter: z.string().optional().describe("Print, Warning, or Error"),
      containsFilter: z.string().optional().describe("Only entries containing this substring"),
      since: z.number().optional().describe("Only entries at/after this unix timestamp in seconds"),
    },
    async (args, ctx) => {
      const levelFilter = args.action === "errors" ? "Error" : args.levelFilter;
      const action = args.action === "errors" ? "get" : args.action;
      if (ctx.bridge.isPlayConnected()) {
        try {
          return await runLuau(
            ctx,
            "manage_logs",
            `return true`,
            { _play: "logs", limit: args.limit, levelFilter, containsFilter: args.containsFilter },
            12_000,
            "play"
          );
        } catch {
          /* fall back to edit plugin buffer */
        }
      }
      args = { ...args, action, levelFilter };
      return runLuau(
        ctx,
        "manage_logs",
        `
local RB, A = ...
if A.action == "get" then
  local out = {}
  local limit = A.limit or 100
  for i = #RB.logBuffer, 1, -1 do
    local e = RB.logBuffer[i]
    local keep = true
    if A.levelFilter and e.level ~= A.levelFilter then keep = false end
    if keep and A.since and (e.time or 0) < A.since then keep = false end
    if keep and A.containsFilter and not string.find(e.message, A.containsFilter, 1, true) then keep = false end
    if keep then
      table.insert(out, e)
      if #out >= limit then break end
    end
  end
  return { items = out }
elseif A.action == "clear" then
  local n = #RB.logBuffer
  table.clear(RB.logBuffer)
  return { cleared = n }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      );
    }
  );

  defineTool(
    ctx,
    "workspace_state",
    "Snapshot of the place. Actions: summary (place info, top-level services, selection, camera), counts (instance counts by ClassName under a path), sync (hierarchy outline + metadata + change stats), snapshot (instance tree under a path, maxDepth), changes (recent added/removed instances — installs a watcher on first call), clear_history (reset the change log), viewport (camera + viewport size + selection bounds), metadata (place ids, counts, timestamps), scripts (all script paths with line counts), selection_info (selection with bounds), clear_cache (drop watchers and cached plugin state).",
    {
      action: z.enum([
        "summary",
        "counts",
        "sync",
        "snapshot",
        "changes",
        "clear_history",
        "viewport",
        "metadata",
        "scripts",
        "selection_info",
        "clear_cache",
      ]),
      path: z.string().optional(),
      topN: z.number().optional(),
      maxDepth: z.number().optional().describe("snapshot depth (default 4)"),
      limit: z.number().optional().describe("changes: max events returned (default 20)"),
      includeMetadata: z.boolean().optional().describe("sync: include metadata block (default true)"),
      includeCameraInfo: z.boolean().optional().describe("viewport: include camera (default true)"),
      includeSelectionBounds: z.boolean().optional().describe("viewport: include selection bounds (default true)"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "workspace_state",
        `
local RB, A = ...
local function metadataBlock()
  local svcCounts = {}
  for _, name in ipairs({"Workspace","ReplicatedStorage","ServerScriptService","ServerStorage","StarterGui","StarterPlayer","Lighting","SoundService"}) do
    local ok, svc = pcall(function() return game:GetService(name) end)
    if ok and svc then svcCounts[name] = #svc:GetDescendants() end
  end
  return {
    placeName = game.Name,
    placeId = game.PlaceId,
    gameId = game.GameId,
    descendantCount = #game:GetDescendants(),
    serviceCounts = svcCounts,
    time = os.time(),
  }
end
local function ensureChangeWatch()
  if RB.state.changeWatch then return RB.state.changeWatch end
  local watch = { events = {}, installedAt = os.time() }
  RB.state.changeWatch = watch
  local function record(kind, inst)
    local okN, path = pcall(function() return inst:GetFullName() end)
    table.insert(watch.events, { time = os.time(), kind = kind, path = okN and path or inst.Name, className = inst.ClassName })
    if #watch.events > 200 then table.remove(watch.events, 1) end
  end
  watch.addConn = workspace.DescendantAdded:Connect(function(i) record("added", i) end)
  watch.removeConn = workspace.DescendantRemoving:Connect(function(i) record("removed", i) end)
  return watch
end
if A.action == "summary" then
  local sel = {}
  for _, i in ipairs(game:GetService("Selection"):Get()) do table.insert(sel, i:GetFullName()) end
  local topLevel = {}
  for _, c in ipairs(workspace:GetChildren()) do
    table.insert(topLevel, { name = c.Name, className = c.ClassName })
    if #topLevel >= 50 then break end
  end
  local cam = workspace.CurrentCamera
  return {
    placeName = game.Name,
    placeId = game.PlaceId,
    gameId = game.GameId,
    workspaceChildren = topLevel,
    selection = sel,
    camera = { position = RB.encode(cam.CFrame.Position), focus = RB.encode(cam.Focus.Position) },
    descendantCount = #game:GetDescendants(),
  }
elseif A.action == "counts" then
  local root = RB.resolve(A.path or "game.Workspace")
  local counts = {}
  for _, c in ipairs(root:GetDescendants()) do
    counts[c.ClassName] = (counts[c.ClassName] or 0) + 1
  end
  local arr = {}
  for k, v in pairs(counts) do table.insert(arr, { className = k, count = v }) end
  table.sort(arr, function(a, b) return a.count > b.count end)
  local out = {}
  for i = 1, math.min(#arr, A.topN or 30) do table.insert(out, arr[i]) end
  return { total = #root:GetDescendants(), byClass = out }
elseif A.action == "sync" then
  local watch = ensureChangeWatch()
  local outline = {}
  for _, name in ipairs({"Workspace","ReplicatedStorage","ServerScriptService","ServerStorage","StarterGui","StarterPlayer","Lighting"}) do
    local ok, svc = pcall(function() return game:GetService(name) end)
    if ok and svc then
      local kids = {}
      for _, c in ipairs(svc:GetChildren()) do
        table.insert(kids, { name = c.Name, className = c.ClassName, children = #c:GetChildren() })
        if #kids >= 60 then break end
      end
      table.insert(outline, { service = name, children = kids })
    end
  end
  local result = { hierarchy = outline, pendingChangeEvents = #watch.events, watchingSince = watch.installedAt }
  if A.includeMetadata ~= false then result.metadata = metadataBlock() end
  return result
elseif A.action == "snapshot" then
  local root = RB.resolve(A.path or "game.Workspace")
  local maxDepth = A.maxDepth or 4
  local total = 0
  local function tree(inst, depth)
    total += 1
    local node = { name = inst.Name, className = inst.ClassName }
    if depth < maxDepth and total < 2000 then
      local kids = {}
      for _, c in ipairs(inst:GetChildren()) do
        table.insert(kids, tree(c, depth + 1))
        if total >= 2000 then break end
      end
      if #kids > 0 then node.children = kids end
    else
      local n = #inst:GetChildren()
      if n > 0 then node.childCount = n end
    end
    return node
  end
  local t = tree(root, 0)
  return { root = t, nodes = total, truncated = total >= 2000 }
elseif A.action == "changes" then
  local watch = ensureChangeWatch()
  local limit = A.limit or 20
  local out = {}
  for i = math.max(#watch.events - limit + 1, 1), #watch.events do
    table.insert(out, watch.events[i])
  end
  local firstCall = #out == 0 and watch.installedAt == os.time()
  return { events = out, total = #watch.events, watchingSince = watch.installedAt, note = firstCall and "Change watcher just installed; mutate something and call changes again." or nil }
elseif A.action == "clear_history" then
  local watch = ensureChangeWatch()
  local n = #watch.events
  watch.events = {}
  return { cleared = n }
elseif A.action == "viewport" then
  local out = {}
  local cam = workspace.CurrentCamera
  if A.includeCameraInfo ~= false then
    out.camera = {
      position = RB.encode(cam.CFrame.Position),
      lookVector = RB.encode(cam.CFrame.LookVector),
      focus = RB.encode(cam.Focus.Position),
      fieldOfView = cam.FieldOfView,
    }
    out.viewportSize = { cam.ViewportSize.X, cam.ViewportSize.Y }
  end
  if A.includeSelectionBounds ~= false then
    local sel = game:GetService("Selection"):Get()
    local bounds = {}
    for _, i in ipairs(sel) do
      local okB, cf, size = pcall(function()
        if i:IsA("Model") then return i:GetBoundingBox() end
        if i:IsA("BasePart") then return i.CFrame, i.Size end
        return nil
      end)
      if okB and cf then
        table.insert(bounds, { path = i:GetFullName(), position = RB.encode(cf.Position), size = RB.encode(size) })
      end
    end
    out.selectionBounds = bounds
  end
  return out
elseif A.action == "metadata" then
  return metadataBlock()
elseif A.action == "scripts" then
  local root = RB.resolve(A.path or "game")
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("LuaSourceContainer") then
      local src = RB.getSource(c)
      table.insert(out, { path = c:GetFullName(), className = c.ClassName, lines = select(2, string.gsub(src, "\\n", "")) + 1, bytes = #src })
      if #out >= 500 then break end
    end
  end
  return { items = out, count = #out }
elseif A.action == "selection_info" then
  local out = {}
  for _, i in ipairs(game:GetService("Selection"):Get()) do
    local node = RB.summary(i)
    local okB, cf, size = pcall(function()
      if i:IsA("Model") then return i:GetBoundingBox() end
      if i:IsA("BasePart") then return i.CFrame, i.Size end
      return nil
    end)
    if okB and cf then
      node.bounds = { position = RB.encode(cf.Position), size = RB.encode(size) }
    end
    table.insert(out, node)
  end
  return { items = out, count = #out }
elseif A.action == "clear_cache" then
  local cleared = {}
  if RB.state.changeWatch then
    pcall(function() RB.state.changeWatch.addConn:Disconnect() end)
    pcall(function() RB.state.changeWatch.removeConn:Disconnect() end)
    RB.state.changeWatch = nil
    table.insert(cleared, "changeWatch")
  end
  if RB.state.selWatch then
    pcall(function() RB.state.selWatch.conn:Disconnect() end)
    RB.state.selWatch = nil
    table.insert(cleared, "selWatch")
  end
  return { cleared = cleared }
end
error("Unknown action: " .. tostring(A.action))
`,
        args,
        60_000
      )
  );

  defineTool(
    ctx,
    "system_info",
    "RoBridge + Studio status. No action (or action=info) returns the full snapshot. Actions: ping (latency), connection (edit/play sessions), place_info, services (DataModel services), usage (per-tool call statistics for this server session), preflight (read-only Studio diagnostics: mode, publish status, HttpService, loadstring, Mesh/Image APIs — with fix instructions).",
    {
      action: z.enum(["info", "ping", "connection", "place_info", "services", "usage", "preflight"]).optional(),
    },
    async (args, ctx) => {
      const { config, bridge } = ctx;
      const sessions = bridge.activeSessions();
      const editSession = sessions.find((s) => !(s.pluginVersion ?? "").startsWith("play-"));
      const sessionPreflight = editSession?.preflight ?? sessions[0]?.preflight;
      const info = {
        name: "RoBridge",
        version: config.version,
        uptimeSeconds: Math.round((Date.now() - config.startedAt) / 1000),
        dashboardUrl: `http://127.0.0.1:${config.port}`,
        studioConnected: bridge.isConnected(),
        playConnected: bridge.isPlayConnected(),
        preflight: sessionPreflight ?? null,
        fixes: compactFixes({
          studioConnected: bridge.isConnected(),
          playConnected: bridge.isPlayConnected(),
          preflight: sessionPreflight,
        }),
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          placeName: s.placeName,
          placeId: s.placeId,
          mode: s.mode,
          pluginVersion: s.pluginVersion,
          lastSeenMsAgo: Date.now() - s.lastSeen,
          preflight: s.preflight,
        })),
      };
      const action = typeof args.action === "string" ? args.action : "info";
      if (action === "ping") {
        const t0 = Date.now();
        if (!bridge.isConnected())
          return { ok: false, studioConnected: false, error: withErrorHint("No Roblox Studio session is polling.", "system_info"), fixes: [FIX.NO_SESSION] };
        await runLuau(ctx, "system_info", `return { pong = true, placeName = game.Name }`, {});
        return { ok: true, studioConnected: true, latencyMs: Date.now() - t0 };
      }
      if (action === "connection") {
        return { studioConnected: info.studioConnected, playConnected: info.playConnected, sessions: info.sessions };
      }
      if (action === "usage") {
        return { tier: "free", note: "All RoBridge tools are free — no Pro gating.", tools: ctx.history.stats() };
      }
      if (action === "preflight") {
        if (!bridge.isConnected()) {
          return {
            studioConnected: false,
            checks: [],
            fixes: [FIX.NO_SESSION],
            guidance: FIX.NO_SESSION,
          };
        }
        const studio = (await runLuau(
          ctx,
          "system_info",
          `
local RB, A = ...
local RS = game:GetService("RunService")
local out = { checks = {} }
local function check(name, ok, detail, fix)
  table.insert(out.checks, { name = name, ok = ok and true or false, detail = detail, fix = (not ok) and fix or nil })
end
local mode = "edit"
if RS:IsRunning() then mode = RS:IsClient() and "play" or "run" end
out.mode = mode
out.placeName = game.Name
out.placeId = game.PlaceId
out.gameId = game.GameId
check("edit_mode", mode == "edit", "Studio mode: " .. mode, "Stop the playtest (manage_studio.play_stop) for edit-only tools like screenshot.")
check("place_published", game.PlaceId > 0, "PlaceId " .. tostring(game.PlaceId), "Publish the place (File → Publish to Roblox) for asset/DataStore APIs.")
local okH, http = pcall(function() return game:GetService("HttpService").HttpEnabled end)
check("http_enabled", okH and http == true, okH and ("HttpEnabled = " .. tostring(http)) or "HttpEnabled unreadable", "Game Settings → Security → Allow HTTP Requests (needed for play-mode agent).")
local okL, fn = pcall(function() return loadstring("return 1") end)
check("loadstring", okL and fn ~= nil, "plugin-level loadstring", "loadstring blocked. execute_luau is Edit-only (plugin). In Play use manage_studio.run_test / play agents.")
local okI = pcall(function()
  local img = game:GetService("AssetService"):CreateEditableImage({ Size = Vector2.new(4, 4) })
  return img
end)
check("mesh_image_apis", okI, okI and "EditableImage available" or "CreateEditableImage failed", "Game Settings → Security → Allow Mesh / Image APIs (needed for manage_camera.screenshot and manage_camera.record).")
local okD = pcall(function() return game:GetService("DataStoreService"):GetRequestBudgetForRequestType(Enum.DataStoreRequestType.GetAsync) end)
check("api_services", okD, okD and "DataStore budget readable" or "DataStore access failed", "Game Settings → Security → Enable Studio Access to API Services (needed for DataStores in Studio).")
return out
`,
          {}
        )) as Record<string, unknown>;
        return { studioConnected: true, playConnected: info.playConnected, serverVersion: config.version, fixes: info.fixes, ...studio };
      }
      if (action === "place_info" || action === "services") {
        return runLuau(
          ctx,
          "system_info",
          `
local RB, A = ...
if A.action == "services" then
  local out = {}
  for _, c in ipairs(game:GetChildren()) do
    table.insert(out, { name = c.Name, className = c.ClassName })
  end
  return { services = out }
end
return { placeName = game.Name, placeId = game.PlaceId, gameId = game.GameId, jobId = game.JobId }
`,
          { action }
        );
      }
      return info;
    }
  );

  const syncState: {
    lastExport?: { time: number; placeName: string; scripts: number; bytes: number; durationMs: number; directory: string };
    history: { time: number; action: string; detail: string }[];
    directions: Record<string, string>;
  } = {
    history: [],
    directions: { scripts: "studio_to_file", instances: "studio_to_file" },
  };

  const scriptExt = (className: string) => (className === "ModuleScript" ? ".luau" : className === "LocalScript" ? ".client.luau" : ".server.luau");
  const syncFileFor = (base: string, instancePath: string, className: string) =>
    path.join(base, instancePath.split(".").map(sanitize).join(path.sep) + scriptExt(className));

  defineTool(
    ctx,
    "manage_sync",
    "Sync between Studio and the local filesystem. Actions: export_scripts (dump every script source under a path to ./sync/<place>/ on disk), status / status_current_place (place + sync dir + last export), history (recent sync operations), directions (get or set per-type sync directions), read_file (read a synced script file by instancePath), write_file (write content to the synced file AND apply it to the Studio script), progress (last export stats).",
    {
      action: z.enum(["export_scripts", "status", "status_current_place", "history", "directions", "read_file", "write_file", "progress"]),
      path: z.string().optional().describe("Root to export from (default game)"),
      outDir: z.string().optional().describe("Output directory (default ./sync)"),
      instancePath: z.string().optional().describe("Script instance path for read_file/write_file, e.g. game.ServerScriptService.Main"),
      content: z.string().optional().describe("New file content for write_file"),
      directions: z.record(z.string()).optional().describe("directions: set map, e.g. {scripts: 'studio_to_file'}"),
      limit: z.number().optional().describe("history: max entries (default 50)"),
    },
    async (args, ctx) => {
      if (args.action === "status" || args.action === "status_current_place") {
        let place: Record<string, unknown> = {};
        try {
          place = (await runLuau(ctx, "manage_sync", `return { placeName = game.Name, placeId = game.PlaceId }`, {})) as Record<string, unknown>;
        } catch {
          place = { placeName: null, note: "Studio not connected" };
        }
        return {
          ...place,
          syncDir: path.resolve("sync"),
          lastExport: syncState.lastExport ?? null,
          directions: syncState.directions,
          note: syncState.lastExport ? undefined : "No export yet. Use export_scripts to dump script sources to disk.",
        };
      }
      if (args.action === "history") {
        const limit = typeof args.limit === "number" ? args.limit : 50;
        return { items: syncState.history.slice(-limit).reverse() };
      }
      if (args.action === "directions") {
        if (args.directions && typeof args.directions === "object") {
          Object.assign(syncState.directions, args.directions as Record<string, string>);
          syncState.history.push({ time: Date.now(), action: "directions", detail: JSON.stringify(args.directions) });
        }
        return { directions: syncState.directions, supported: ["studio_to_file", "file_to_studio", "two_way"] };
      }
      if (args.action === "progress") {
        return {
          lastExport: syncState.lastExport ?? null,
          inProgress: false,
          note: "RoBridge exports run synchronously inside export_scripts; when that call returns, the sync is complete.",
        };
      }
      if (args.action === "read_file" || args.action === "write_file") {
        const instancePath = String(args.instancePath ?? "");
        if (!instancePath) throw new Error(`${args.action} requires instancePath, e.g. game.ServerScriptService.Main`);
        const meta = (await runLuau(
          ctx,
          "manage_sync",
          `
local RB, A = ...
local inst = RB.resolve(A.instancePath)
if not inst:IsA("LuaSourceContainer") then error(inst:GetFullName() .. " is not a script") end
return { placeName = game.Name, fullPath = inst:GetFullName(), className = inst.ClassName }
`,
          args
        )) as { placeName: string; fullPath: string; className: string };
        const base = path.resolve(typeof args.outDir === "string" ? args.outDir : "sync", sanitize(meta.placeName || "place"));
        const file = syncFileFor(base, meta.fullPath, meta.className);
        if (args.action === "read_file") {
          try {
            const content = await readFile(file, "utf8");
            return { file, instancePath: meta.fullPath, content, bytes: content.length };
          } catch {
            throw new Error(`No synced file at ${file}. Run manage_sync.export_scripts first.`);
          }
        }
        const content = String(args.content ?? "");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        await runLuau(
          ctx,
          "manage_sync",
          `
local RB, A = ...
local inst = RB.resolve(A.instancePath)
RB.setSource(inst, A.content)
RB.waypoint("sync write_file")
return { applied = true }
`,
          { instancePath: meta.fullPath, content }
        );
        syncState.history.push({ time: Date.now(), action: "write_file", detail: meta.fullPath });
        return { file, instancePath: meta.fullPath, bytes: content.length, appliedToStudio: true };
      }
      const started = Date.now();
      const result = (await runLuau(
        ctx,
        "manage_sync",
        `
local RB, A = ...
local root = RB.resolve(A.path or "game")
local out = {}
local total = 0
local function collect(container)
  for _, c in ipairs(container:GetDescendants()) do
    if c:IsA("LuaSourceContainer") then
      local src = RB.getSource(c)
      total += #src
      if total > 4 * 1024 * 1024 then error("Export exceeds 4MB; export a smaller path") end
      table.insert(out, { path = c:GetFullName(), className = c.ClassName, source = src })
    end
  end
end
collect(root)
return { placeName = game.Name, scripts = out }
`,
        args,
        60_000
      )) as { placeName: string; scripts: { path: string; className: string; source: string }[] };

      const base = path.resolve(typeof args.outDir === "string" ? args.outDir : "sync", sanitize(result.placeName || "place"));
      let written = 0;
      let bytes = 0;
      for (const s of result.scripts) {
        const file = syncFileFor(base, s.path, s.className);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, s.source, "utf8");
        written++;
        bytes += s.source.length;
      }
      syncState.lastExport = {
        time: Date.now(),
        placeName: result.placeName,
        scripts: written,
        bytes,
        durationMs: Date.now() - started,
        directory: base,
      };
      syncState.history.push({ time: Date.now(), action: "export_scripts", detail: `${written} scripts, ${bytes} bytes → ${base}` });
      return { exported: written, directory: base, bytes };
    }
  );

  defineTool(
    ctx,
    "manage_assets",
    "Roblox Toolbox/Creator Store assets plus a local asset library. ALWAYS search first, then insert using an assetId from those results — never invent or hardcode IDs. Actions: search (keyword/query + assetType), preview / info (metadata for a search-result assetId), insert / insert_free / insert_package (assetId into parentPath), search_insert (search then insert the first match), export_selection_json (JSON snapshot of the Studio selection), export_selection_rbxm / export_path_rbxm (serialize selection or a path into the local ./asset-library as a re-importable asset), import_rbxm (rebuild a library asset in Studio), review_model (QA a model: anchoring, PrimaryPart, naming, size, expected groups; readiness verdict), generate_model (Roblox GenerationService, if this Studio has access), upload_asset (AssetService:CreateAssetAsync — requires confirm=true), generate_thumbnail (render a library asset to a PNG thumbnail).",
    {
      action: z
        .enum([
          "search",
          "preview",
          "info",
          "insert",
          "insert_free",
          "insert_package",
          "search_insert",
          "export_selection_json",
          "export_selection_rbxm",
          "export_path_rbxm",
          "import_rbxm",
          "review_model",
          "generate_model",
          "upload_asset",
          "generate_thumbnail",
        ])
        .describe("search first, then insert/preview with an assetId from results"),
      keyword: z.string().optional().describe("Toolbox search text (required for search). Alias: query"),
      query: z.string().optional().describe("Alias for keyword"),
      assetType: z
        .enum(["Model", "Decal", "Audio", "Mesh", "Plugin"])
        .optional()
        .describe("Toolbox category. Model=props, Audio=Sounds, Decal=images, Mesh=MeshParts"),
      limit: z.number().optional().describe("Max search results (default 10, max 30). Alias: maxResults"),
      maxResults: z.number().optional().describe("Alias for limit"),
      assetId: z
        .number()
        .optional()
        .describe("Toolbox asset id from a search/preview result. Do not invent this."),
      parentPath: z.string().optional().describe("Insert parent (default Workspace). Aliases: parent, targetParent"),
      parent: z.string().optional().describe("Alias for parentPath"),
      targetParent: z.string().optional().describe("Alias for parentPath (import_rbxm/generate_model)"),
      position: z.array(z.number()).optional().describe("Optional [x,y,z] pivot for models/meshes"),
      name: z.string().optional().describe("Optional name for the inserted instance (especially Sounds)"),
      play: z.boolean().optional().describe("If true and the insert is audio, play the Sound once"),
      sourcePath: z.string().optional().describe("Instance path for export_path_rbxm / review_model / upload_asset"),
      category: z.string().optional().describe("Library category folder for export/import/review/thumbnail (default 'models')"),
      displayName: z.string().optional().describe("Library asset display name"),
      description: z.string().optional().describe("Library asset description"),
      includeProperties: z.boolean().optional().describe("export_selection_json: include common properties (default true)"),
      includeChildren: z.boolean().optional().describe("export_selection_json: include children (default true)"),
      maxDepth: z.number().optional().describe("Export child depth (default 10)"),
      assetLibraryAssetId: z.string().optional().describe("Local library asset id from an export action (import_rbxm / generate_thumbnail)"),
      exportToLibrary: z.boolean().optional().describe("review_model: also save to the library when review passes"),
      expectedUse: z.enum(["decorative", "interactive", "vehicle", "character", "unknown"]).optional(),
      expectedGroups: z.array(z.string()).optional().describe("review_model: child names that must exist"),
      maxDescendants: z.number().optional().describe("review_model descendant budget (default 500)"),
      prompt: z.string().optional().describe("generate_model: text prompt for Roblox GenerationService"),
      confirm: z.boolean().optional().describe("upload_asset: must be true to actually upload to Roblox"),
    },
    async (args, ctx) => {
      const kw = String(args.keyword ?? args.query ?? "");
      const lim = Number(args.limit ?? args.maxResults ?? 10);
      const parentPath = (args.parentPath ?? args.parent ?? args.targetParent) as string | undefined;
      if (args.action === "search") {
        return searchMarketplace(kw, String(args.assetType ?? "Model"), lim);
      }
      if (args.action === "preview" || args.action === "info") {
        const id = Number(args.assetId);
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error(`${args.action} requires assetId from a Toolbox search result (do not invent IDs)`);
        }
        return previewMarketplaceAsset(id);
      }
      if (args.action === "export_selection_json") {
        return runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
${SERIALIZE_LUAU}
local sel = game:GetService("Selection"):Get()
if #sel == 0 then error("export_selection_json requires a non-empty Studio selection (manage_selection.set first)") end
local out = {}
for _, i in ipairs(sel) do
  table.insert(out, serialize(i, 0, A.maxDepth or 10, A.includeProperties ~= false, A.includeChildren ~= false))
end
return { items = out, count = #out }
`,
          args,
          60_000
        );
      }
      if (args.action === "export_selection_rbxm" || args.action === "export_path_rbxm") {
        const fromPath = args.action === "export_path_rbxm";
        if (fromPath && !args.sourcePath) throw new Error("export_path_rbxm requires sourcePath");
        const serialized = (await runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
${SERIALIZE_LUAU}
local roots = {}
if A.sourcePath and A.sourcePath ~= "" then
  table.insert(roots, RB.resolve(A.sourcePath))
else
  for _, i in ipairs(game:GetService("Selection"):Get()) do table.insert(roots, i) end
end
if #roots == 0 then error("Nothing to export: select instances in Studio or pass sourcePath") end
local out = {}
for _, i in ipairs(roots) do
  table.insert(out, serialize(i, 0, A.maxDepth or 10, true, true))
end
return { trees = out, placeName = game.Name, placeId = game.PlaceId }
`,
          args,
          60_000
        )) as { trees: unknown[]; placeName: string; placeId: number };
        const saved = await saveLibraryAsset(String(args.category ?? "models"), {
          displayName: String(args.displayName ?? (fromPath ? String(args.sourcePath) : "Selection export")),
          description: typeof args.description === "string" ? args.description : undefined,
          placeName: serialized.placeName,
          placeId: serialized.placeId,
          trees: serialized.trees,
        });
        return {
          assetLibraryAssetId: saved.id,
          file: saved.file,
          rootCount: serialized.trees.length,
          format: "robridge-json-v1",
          note: "Saved as a re-importable RoBridge JSON asset (binary .rbxm cannot be written by a plugin). Import with manage_assets.import_rbxm.",
        };
      }
      if (args.action === "import_rbxm") {
        const id = String(args.assetLibraryAssetId ?? "");
        if (!id) throw new Error("import_rbxm requires assetLibraryAssetId from an export action");
        const asset = await readLibraryAsset(String(args.category ?? "models"), id);
        return runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
${BUILD_TREE_LUAU}
local parent = A.parentPath and RB.resolve(A.parentPath) or workspace
local created = {}
for _, tree in ipairs(A.trees) do
  local inst = buildTree(tree, parent)
  if A.name and #A.trees == 1 then inst.Name = A.name end
  table.insert(created, RB.summary(inst))
end
RB.waypoint("import library asset")
return { imported = created, parent = parent:GetFullName() }
`,
          { ...args, parentPath, trees: (asset as { trees: unknown[] }).trees },
          60_000
        );
      }
      if (args.action === "review_model") {
        const review = (await runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
local roots = {}
if A.sourcePath and A.sourcePath ~= "" then
  table.insert(roots, RB.resolve(A.sourcePath))
else
  for _, i in ipairs(game:GetService("Selection"):Get()) do table.insert(roots, i) end
end
if #roots == 0 then error("review_model needs sourcePath or a non-empty Studio selection") end
local issues, warns = {}, {}
local stats = { roots = #roots, descendants = 0, parts = 0, meshParts = 0, scripts = 0, unanchored = 0 }
local maxDesc = A.maxDescendants or 500
local names = {}
for _, root in ipairs(roots) do
  local all = root:GetDescendants()
  stats.descendants += #all
  if #all > maxDesc then
    table.insert(warns, root:GetFullName() .. " has " .. #all .. " descendants (budget " .. maxDesc .. ")")
  end
  if root:IsA("Model") and not root.PrimaryPart then
    table.insert(warns, root:GetFullName() .. " has no PrimaryPart")
  end
  local function inspect(inst)
    if inst:IsA("BasePart") then
      stats.parts += 1
      if inst:IsA("MeshPart") then stats.meshParts += 1 end
      if not inst.Anchored then stats.unanchored += 1 end
      if inst.Size.Magnitude > 2048 then table.insert(issues, inst:GetFullName() .. " is enormous (" .. tostring(inst.Size) .. ")") end
    elseif inst:IsA("LuaSourceContainer") then
      stats.scripts += 1
    end
    if inst.Name == inst.ClassName then
      names[inst.ClassName] = (names[inst.ClassName] or 0) + 1
    end
  end
  inspect(root)
  for _, c in ipairs(all) do inspect(c) end
  for _, g in ipairs(A.expectedGroups or {}) do
    if not root:FindFirstChild(g, true) then
      table.insert(issues, root:GetFullName() .. " is missing expected group '" .. g .. "'")
    end
  end
end
for cls, n in pairs(names) do
  if n >= 5 then table.insert(warns, n .. " instances still have the default name '" .. cls .. "'") end
end
if stats.unanchored > 0 and (A.expectedUse == "decorative" or A.expectedUse == nil or A.expectedUse == "unknown") then
  table.insert(warns, stats.unanchored .. " unanchored BaseParts (decorative models should usually be anchored)")
end
local readiness = "ready"
if #issues > 0 then readiness = "blocked" elseif #warns > 0 then readiness = "review" end
return { readiness = readiness, issues = issues, warnings = warns, stats = stats }
`,
          args,
          60_000
        )) as { readiness: string; [key: string]: unknown };
        if (args.exportToLibrary && review.readiness !== "blocked") {
          const registered = ctx.registry.get("manage_assets");
          if (registered) {
            const exported = (await registered({
              action: args.sourcePath ? "export_path_rbxm" : "export_selection_rbxm",
              sourcePath: args.sourcePath,
              category: args.category ?? "models",
              displayName: args.displayName,
              description: args.description,
            })) as Record<string, unknown>;
            return { ...review, exported };
          }
        }
        return review;
      }
      if (args.action === "generate_model") {
        if (!args.prompt || !String(args.prompt).trim()) throw new Error("generate_model requires prompt");
        return runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
local okSvc, gen = pcall(function() return game:GetService("GenerationService") end)
if not okSvc or not gen then
  return { ok = false, manual_required = true, code = "generation_service_unavailable",
    instructions = "This Studio build does not expose GenerationService. Use Studio's built-in 3D generation tool (Toolbox → Generate) manually, or insert a Toolbox model via manage_assets.search + insert." }
end
local parent = A.parentPath and RB.resolve(A.parentPath) or workspace
local ok, resultOrErr = pcall(function()
  local generationId = gen:GenerateModelAsync({ Prompt = A.prompt }, {})
  local deadline = os.clock() + 240
  while os.clock() < deadline do
    local status = gen:GetGenerationStatusAsync(generationId)
    local s = tostring(status)
    if string.find(s, "Complete") or string.find(s, "Success") then break end
    if string.find(s, "Fail") or string.find(s, "Moderat") then error("generation status: " .. s) end
    task.wait(2)
  end
  return gen:LoadGeneratedModelAsync(generationId)
end)
if not ok then
  return { ok = false, manual_required = true, code = "generation_failed", error = tostring(resultOrErr),
    instructions = "Roblox GenerationService rejected the request (it requires a published place, beta enrollment, and logged-in Studio). Generate via Toolbox → Generate manually, or use manage_assets.search + insert." }
end
local model = resultOrErr
if typeof(model) ~= "Instance" then
  return { ok = false, manual_required = true, code = "generation_no_model", detail = RB.encode(model),
    instructions = "GenerationService returned no model instance in this Studio build." }
end
if A.name then model.Name = A.name end
model.Parent = parent
for _, p in ipairs(model:GetDescendants()) do
  if p:IsA("BasePart") then p.Anchored = true end
end
RB.waypoint("generate_model")
return { ok = true, path = model:GetFullName(), summary = RB.summary(model, true) }
`,
          { ...args, parentPath },
          300_000
        );
      }
      if (args.action === "upload_asset") {
        if (args.confirm !== true) {
          return {
            ok: false,
            manual_required: true,
            code: "upload_confirmation_required",
            instructions:
              "upload_asset publishes to your Roblox account via AssetService:CreateAssetAsync. Re-run with confirm=true after the user approves the upload.",
          };
        }
        return runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
local target
if A.sourcePath and A.sourcePath ~= "" then
  target = RB.resolve(A.sourcePath)
else
  local sel = game:GetService("Selection"):Get()
  target = sel[1]
end
if not target then error("upload_asset needs sourcePath or a Studio selection") end
local AS = game:GetService("AssetService")
local ok, resultOrErr = pcall(function()
  return AS:CreateAssetAsync(target, Enum.AssetType.Model, {
    Name = A.displayName or target.Name,
    Description = A.description or "Uploaded by RoBridge",
  })
end)
if not ok then
  return { ok = false, manual_required = true, code = "upload_failed", error = tostring(resultOrErr),
    instructions = "CreateAssetAsync failed (needs logged-in Studio, published place, and asset upload permission). Upload manually: right-click the instance → Save to Roblox." }
end
return { ok = true, result = RB.encode(resultOrErr), source = target:GetFullName() }
`,
          args,
          120_000
        );
      }
      if (args.action === "generate_thumbnail") {
        const id = String(args.assetLibraryAssetId ?? "");
        if (!id) throw new Error("generate_thumbnail requires assetLibraryAssetId from an export action");
        const category = String(args.category ?? "models");
        const asset = await readLibraryAsset(category, id);
        const stage = (await runLuau(
          ctx,
          "manage_assets",
          `
local RB, A = ...
${BUILD_TREE_LUAU}
local old = workspace:FindFirstChild("RoBridgeThumbStage")
if old then old:Destroy() end
local stage = Instance.new("Folder")
stage.Name = "RoBridgeThumbStage"
stage.Parent = workspace
local built = {}
for _, tree in ipairs(A.trees) do
  table.insert(built, buildTree(tree, stage))
end
local target = built[1]
if target and target:IsA("PVInstance") then
  target:PivotTo(CFrame.new(10000, 500, 10000))
end
return { stagePath = stage:GetFullName(), targetPath = target and target:GetFullName() or stage:GetFullName() }
`,
          { trees: (asset as { trees: unknown[] }).trees },
          60_000
        )) as { stagePath: string; targetPath: string };
        try {
          const camera = ctx.registry.get("manage_camera");
          if (!camera) throw new Error("manage_camera is not registered");
          const shot = (await camera({ action: "screenshot", path: stage.targetPath })) as { __imageBase64?: string };
          if (!shot.__imageBase64) throw new Error("screenshot returned no image");
          const thumbFile = path.join(path.dirname((await libraryAssetFile(category, id))!), `${id}.thumbnail.png`);
          await writeFile(thumbFile, Buffer.from(shot.__imageBase64, "base64"));
          return { assetLibraryAssetId: id, thumbnail: thumbFile };
        } finally {
          await runLuau(
            ctx,
            "manage_assets",
            `local s = workspace:FindFirstChild("RoBridgeThumbStage") if s then s:Destroy() end return { cleaned = true }`,
            {}
          ).catch(() => undefined);
        }
      }
      if (args.action === "search_insert") {
        const found = (await searchMarketplace(kw, String(args.assetType ?? "Model"), lim)) as {
          items: { assetId?: number }[];
        };
        const first = found.items.find((i) => i.assetId);
        if (!first?.assetId) throw new Error(`search_insert found no usable asset for '${kw}'. Refine the keyword.`);
        args = { ...args, assetId: first.assetId };
      }
      const id = Number(args.assetId);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error(`${args.action} requires assetId from a Toolbox search result. Call search first; do not invent IDs.`);
      }
      return runLuau(
        ctx,
        "manage_assets",
        `
local RB, A = ...
if not A.assetId then error("insert requires assetId from a Toolbox search result (do not invent IDs)") end
local parent = A.parentPath and RB.resolve(A.parentPath) or workspace
local inserted = {}
local method = "GetObjects"
local kind = A.assetType or "Unknown"
local objs
local ok, res = pcall(function()
  return game:GetObjects("rbxassetid://" .. tostring(A.assetId))
end)
if ok then
  objs = res
else
  local ok2, model = pcall(function()
    return game:GetService("InsertService"):LoadAsset(A.assetId)
  end)
  if ok2 then
    method = "LoadAsset"
    objs = model:GetChildren()
    for _, c in ipairs(objs) do c.Parent = nil end
    model:Destroy()
  else
    local wantAudio = A.assetType == "Audio" or string.find(string.lower(tostring(res)), "xml", 1, true)
    if wantAudio or A.assetType == "Audio" then
      local soundParent = parent
      if parent:IsA("Model") then
        soundParent = parent.PrimaryPart or parent:FindFirstChildWhichIsA("BasePart") or parent
      end
      local s = Instance.new("Sound")
      s.Name = A.name or "ToolboxSound"
      s.SoundId = "rbxassetid://" .. tostring(A.assetId)
      s.RollOffMaxDistance = 80
      s.Parent = soundParent
      if A.play then pcall(function() s:Play() end) end
      RB.waypoint("insert toolbox audio")
      return {
        inserted = { RB.summary(s) },
        method = "Sound.SoundId",
        kind = "Audio",
        assetId = A.assetId,
        note = "Audio is not a model; created a Sound from the search-result assetId.",
      }
    end
    error("Failed to insert Toolbox asset " .. tostring(A.assetId) .. ". GetObjects: " .. tostring(res) .. " LoadAsset: " .. tostring(model) .. ". Use an assetId from manage_assets.search; do not invent IDs.")
  end
end

for _, c in ipairs(objs) do
  if A.name and A.name ~= "" then c.Name = A.name end
  c.Parent = parent
  if A.position and c:IsA("PVInstance") then
    c:PivotTo(CFrame.new(A.position[1], A.position[2], A.position[3]))
  end
  if A.play and c:IsA("Sound") then pcall(function() c:Play() end) end
  if c:IsA("Sound") then kind = "Audio" elseif c:IsA("Decal") then kind = "Decal" elseif c:IsA("MeshPart") then kind = "Mesh" elseif c:IsA("Model") or c:IsA("BasePart") then kind = "Model" end
  table.insert(inserted, RB.summary(c))
end
if #inserted == 0 then
  error("Toolbox asset " .. tostring(A.assetId) .. " inserted nothing. Try another search result; do not invent a different ID.")
end
RB.waypoint("insert toolbox asset")
return { inserted = inserted, method = method, kind = kind, assetId = A.assetId }
`,
        { ...args, parentPath, assetId: id },
        60_000
      );
    }
  );
}

const SERIALIZE_LUAU = `
local function serialize(inst, depth, maxDepth, withProps, withChildren)
  local node = { className = inst.ClassName, name = inst.Name }
  if withProps then
    local props = RB.commonProps(inst)
    props.Name, props.ClassName, props.Parent = nil, nil, nil
    local okCf, cf = pcall(function() return inst.CFrame end)
    if okCf and typeof(cf) == "CFrame" then
      local lv = cf.LookVector
      props.CFrame = { __t = "CFrame", position = { cf.X, cf.Y, cf.Z }, lookAt = { cf.X + lv.X, cf.Y + lv.Y, cf.Z + lv.Z } }
    end
    node.properties = props
  end
  local attrs = RB.encode(inst:GetAttributes())
  if type(attrs) == "table" and next(attrs) then node.attributes = attrs end
  local tags = inst:GetTags()
  if #tags > 0 then node.tags = tags end
  if inst:IsA("LuaSourceContainer") then node.source = RB.getSource(inst) end
  if withChildren and depth < maxDepth then
    local kids = {}
    for _, c in ipairs(inst:GetChildren()) do
      table.insert(kids, serialize(c, depth + 1, maxDepth, withProps, withChildren))
      if #kids >= 200 then break end
    end
    if #kids > 0 then node.children = kids end
  end
  return node
end
`;

const BUILD_TREE_LUAU = `
local function buildTree(node, parent)
  local inst = Instance.new(node.className)
  if node.name then inst.Name = node.name end
  if node.properties then
    for k, v in pairs(node.properties) do
      pcall(function() RB.setProp(inst, k, v) end)
    end
  end
  if node.source and inst:IsA("LuaSourceContainer") then RB.setSource(inst, node.source) end
  for k, v in pairs(node.attributes or {}) do
    pcall(function() inst:SetAttribute(k, RB.toValue(v, nil, nil)) end)
  end
  for _, t in ipairs(node.tags or {}) do
    pcall(function() inst:AddTag(t) end)
  end
  for _, c in ipairs(node.children or {}) do
    buildTree(c, inst)
  end
  inst.Parent = parent
  return inst
end
`;

const LIBRARY_DIR = "asset-library";

async function saveLibraryAsset(category: string, meta: Record<string, unknown>): Promise<{ id: string; file: string }> {
  const id = `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = path.resolve(LIBRARY_DIR, sanitize(category));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  await writeFile(file, JSON.stringify({ id, category, created: Date.now(), format: "robridge-json-v1", ...meta }, null, 2), "utf8");
  return { id, file };
}

async function libraryAssetFile(category: string, id: string): Promise<string | null> {
  const safeId = sanitize(id);
  const candidates = [path.resolve(LIBRARY_DIR, sanitize(category), `${safeId}.json`)];
  try {
    for (const cat of await readdir(path.resolve(LIBRARY_DIR))) {
      candidates.push(path.resolve(LIBRARY_DIR, cat, `${safeId}.json`));
    }
  } catch {
    /* library dir may not exist yet */
  }
  for (const file of candidates) {
    try {
      await readFile(file, "utf8");
      return file;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readLibraryAsset(category: string, id: string): Promise<Record<string, unknown>> {
  const file = await libraryAssetFile(category, id);
  if (!file) {
    throw new Error(`No library asset '${id}' in category '${category}'. Export one first with manage_assets.export_selection_rbxm / export_path_rbxm.`);
  }
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

const TEST_SCRIPT_NAME = "t0";
const TEST_MARKER = "[ROBRIDGE_TEST]";
const PLAY_WEDGE_RE = /still in progress|previous (one|test)|test is already|already in progress/i;
const STUDIO_WEDGED_CODE = "studio_test_wedged";
const STUDIO_WEDGED_MSG =
  "Studio is stuck in a previous Play/Run session (StudioTestService: previous test still in progress). RoBridge tried play_stop then start once and it is still wedged. Press Stop in Roblox Studio, then retry. This is not a successful playtest.\nFix: " +
  FIX.PLAY_RUNNING;

function isPlayWedgeError(msg: unknown): boolean {
  return typeof msg === "string" && PLAY_WEDGE_RE.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeStudioMode(ctx: ToolContext, luau: Record<string, unknown> = {}) {
  const playConnected = ctx.bridge.isPlayConnected();
  const playMode = ctx.bridge.activeSessions().find((s) => (s.pluginVersion ?? "").startsWith("play-"))?.mode;
  const luauRunning = luau.isRunning === true;
  const mode = playConnected ? playMode || "play" : luauRunning ? String(luau.mode || "play") : String(luau.mode || "edit");
  const isEdit = !playConnected && luau.isEdit !== false && !luauRunning;
  return {
    ...luau,
    mode,
    isEdit,
    isRunning: luauRunning,
    playConnected,
    editConnected: ctx.bridge.isEditConnected(),
  };
}

async function queryStudioMode(ctx: ToolContext): Promise<Record<string, unknown>> {
  try {
    return (await runLuau(
      ctx,
      "manage_studio",
      `
local RB = ...
if RB.playStatus then return RB.playStatus() end
local RS = game:GetService("RunService")
local mode = "edit"
if RS:IsRunning() then mode = RS:IsClient() and "play" or "run" end
return { mode = mode, isEdit = RS:IsEdit() and not RS:IsRunning(), isRunning = RS:IsRunning(), placeName = game.Name, placeId = game.PlaceId }
`,
      {},
      8_000
    )) as Record<string, unknown>;
  } catch (err) {
    return { queryError: err instanceof Error ? err.message : String(err) };
  }
}

async function studioPlaySnapshot(ctx: ToolContext, includeSessions: boolean) {
  const merged = mergeStudioMode(ctx, await queryStudioMode(ctx));
  if (!includeSessions) return merged;
  return {
    ...merged,
          sessions: ctx.bridge.allSessions().map((s) => ({
            sessionId: s.sessionId,
            mode: s.mode,
            placeName: s.placeName,
            placeId: s.placeId,
            pluginVersion: s.pluginVersion,
            connected: s.connected,
            lastSeenMsAgo: s.lastSeenMsAgo,
          })),
  };
}

async function waitUntilPlayQuiet(ctx: ToolContext, timeoutMs: number, since: number) {
  const started = Date.now();
  let quietSince: number | null = null;
  while (Date.now() - started < timeoutMs) {
    const live = ctx.bridge.isPlayPolling() || ctx.bridge.hasFreshPlayAgent(since);
    if (live) {
      quietSince = null;
    } else if (quietSince == null) {
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= 400) {
      break;
    }
    await sleep(150);
  }
  return {
    playConnected: ctx.bridge.isPlayPolling() || ctx.bridge.hasFreshPlayAgent(since),
    elapsedMs: Date.now() - started,
  };
}

async function sendPlayEndTest(ctx: ToolContext) {
  if (!ctx.bridge.isPlayConnected() && !ctx.bridge.isPlayPolling()) return;
  try {
    await runLuau(
      ctx,
      "manage_studio",
      `task.spawn(function()
  local STS = game:GetService("StudioTestService")
  pcall(function() STS:EndTest("stopped_by_robridge") end)
  pcall(function() STS:EndTest() end)
end)
return { stopping = true }`,
      { _play: "endTest" },
      5_000,
      "play"
    );
  } catch {
    /* still try edit-side cleanup */
  }
}

async function sendEditStop(ctx: ToolContext): Promise<Record<string, unknown>> {
  try {
    return (await runLuau(
      ctx,
      "manage_studio",
      `local RB = ...
RB.state.recording = false
if RB.stopRecording then RB.stopRecording() end
if RB.stopPlay then return RB.stopPlay() end
task.spawn(function()
  pcall(function() game:GetService("StudioTestService"):EndTest("stopped_by_robridge") end)
end)
if RB.sealPlayAgents then RB.sealPlayAgents() end
if RB.stripPlayAgents then RB.stripPlayAgents() end
return { stopAttempted = true }`,
      {},
      8_000
    )) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function stopPlaySession(ctx: ToolContext) {
  await sendPlayEndTest(ctx);
  await sleep(500);
  const marker = Date.now();
  ctx.bridge.dropPlaySessions();
  ctx.bridge.clearPlayStarting();
  let editStop = await sendEditStop(ctx);
  await waitUntilPlayQuiet(ctx, 2500, marker);
  if (ctx.bridge.isPlayPolling() || ctx.bridge.hasFreshPlayAgent(marker)) {
    await sendPlayEndTest(ctx);
    editStop = { ...editStop, ...(await sendEditStop(ctx)) };
    await sleep(400);
    await waitUntilPlayQuiet(ctx, 2000, Date.now());
  }
  const playConnected = ctx.bridge.isPlayPolling() || ctx.bridge.hasFreshPlayAgent(marker);
  const snapshot = mergeStudioMode(ctx, editStop);
  const stopped = !playConnected;
  return {
    ...snapshot,
    ...editStop,
    stopped,
    stopAttempted: true,
    playConnected,
    isEdit: stopped ? true : snapshot.isEdit,
    mode: playConnected ? snapshot.mode || "play" : "edit",
    warning: stopped
      ? undefined
      : withErrorHint(
          "Play may still be running. RoBridge will not wait forever. If Studio still shows Stop, press Stop in Studio, then retry."
        ),
  };
}

type StartPlayResult = {
  started: boolean;
  mode: string;
  playConnected: boolean;
  wedged?: boolean;
  code?: string;
  warning?: string;
  error?: string;
  isEdit?: boolean;
};

function resultLooksWedged(r: StartPlayResult): boolean {
  if (r.wedged || r.code === STUDIO_WEDGED_CODE) return true;
  return isPlayWedgeError(r.warning) || isPlayWedgeError(r.error);
}

async function invokeStartPlay(
  ctx: ToolContext,
  mode: string
): Promise<{ payload: Record<string, unknown>; immediateError?: string }> {
  let immediateError: string | undefined;
  let payload: Record<string, unknown> = {};
  const playJob = runLuau(
    ctx,
    "manage_studio",
    `
local RB, A = ...
pcall(function() game:GetService("HttpService").HttpEnabled = true end)
if RB.startPlay then
  return RB.startPlay(A.mode or "play")
end
local STS = game:GetService("StudioTestService")
if A.mode == "run" then
  STS:ExecuteRunModeAsync("RoBridge")
else
  STS:ExecutePlayModeAsync("RoBridge")
end
return { started = true, mode = A.mode or "play" }
`,
    { mode },
    600_000
  )
    .then((r) => {
      payload = (r && typeof r === "object" ? r : { started: true }) as Record<string, unknown>;
      return r;
    })
    .catch((err: unknown) => {
      immediateError = err instanceof Error ? err.message : String(err);
      throw err;
    });

  // startPlay waits ~0.7s in-plugin for immediate StudioTestService errors; allow poll overhead.
  await Promise.race([playJob.then(() => undefined).catch(() => undefined), sleep(2500)]);
  return { payload, immediateError };
}

async function peekPlayStartError(ctx: ToolContext): Promise<string | undefined> {
  const luau = await queryStudioMode(ctx);
  const err = luau.lastPlayStartError;
  return typeof err === "string" && err ? err : undefined;
}

async function startPlayOnce(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: string,
  waitMs = 25_000
): Promise<StartPlayResult> {
  ctx.bridge.dropPlaySessions();
  ctx.bridge.markPlayStarting();
  await installPlayAgents(ctx, {
    testSource: typeof args.testSource === "string" ? args.testSource : undefined,
    testName: typeof args.testName === "string" ? args.testName : undefined,
  });
  const invoked = await invokeStartPlay(ctx, mode);
  const payload = invoked.payload;
  const failMsg =
    invoked.immediateError ||
    (typeof payload.error === "string" ? payload.error : undefined) ||
    (typeof payload.warning === "string" ? payload.warning : undefined);
  const wedged = payload.wedged === true || payload.code === STUDIO_WEDGED_CODE || isPlayWedgeError(failMsg);

  if (wedged || payload.started === false || invoked.immediateError) {
    ctx.bridge.clearPlayStarting();
    const warning = withErrorHint(failMsg || (wedged ? STUDIO_WEDGED_MSG : "play_start failed"));
    return {
      started: false,
      mode,
      playConnected: false,
      wedged,
      code: typeof payload.code === "string" ? payload.code : wedged ? STUDIO_WEDGED_CODE : "play_start_failed",
      warning,
      error: failMsg,
      isEdit: true,
    };
  }

  const startedAt = Date.now();
  const deadline = startedAt + waitMs;
  while (Date.now() < deadline) {
    if (ctx.bridge.hasFreshPlayAgent(startedAt)) {
      return { started: true, mode, playConnected: true, isEdit: false };
    }
    const peeked = await peekPlayStartError(ctx);
    if (peeked) {
      ctx.bridge.clearPlayStarting();
      const peekedWedge = isPlayWedgeError(peeked);
      return {
        started: false,
        mode,
        playConnected: false,
        wedged: peekedWedge,
        code: peekedWedge ? STUDIO_WEDGED_CODE : "play_start_failed",
        warning: withErrorHint(peeked),
        error: peeked,
        isEdit: true,
      };
    }
    await sleep(400);
  }
  return {
    started: true,
    mode,
    playConnected: false,
    isEdit: false,
    warning: withErrorHint(
      "Play started but the play agent has not polled yet. Enable HttpService (Game Settings → Security → Allow HTTP Requests). If Play is stuck, press Stop in Studio (or manage_studio.play_stop) and retry."
    ),
  };
}

async function recoverExistingPlay(ctx: ToolContext) {
  const snap = mergeStudioMode(ctx, await queryStudioMode(ctx));
  if (ctx.bridge.isPlayConnected() || ctx.bridge.isPlayPolling() || snap.isEdit === false || snap.isRunning === true) {
    await stopPlaySession(ctx);
    await sleep(600);
  }
}

async function startPlaySession(ctx: ToolContext, args: Record<string, unknown>): Promise<StartPlayResult> {
  const mode = args.mode === "run" ? "run" : "play";
  await recoverExistingPlay(ctx);

  let result = await startPlayOnce(ctx, args, mode, 18_000);
  if (result.started && result.playConnected) return result;
  if (resultLooksWedged(result) || !result.playConnected) {
    await stopPlaySession(ctx);
    await sleep(800);
    result = await startPlayOnce(ctx, args, mode, 25_000);
    if (resultLooksWedged(result) || !result.started) {
      ctx.bridge.clearPlayStarting();
      return {
        started: false,
        mode,
        playConnected: false,
        wedged: true,
        code: STUDIO_WEDGED_CODE,
        warning: STUDIO_WEDGED_MSG,
        error: result.error || result.warning,
        isEdit: true,
      };
    }
    if (!result.playConnected) {
      ctx.bridge.clearPlayStarting();
      return {
        started: false,
        mode,
        playConnected: false,
        wedged: resultLooksWedged(result),
        code: resultLooksWedged(result) ? STUDIO_WEDGED_CODE : "play_agent_missing",
        warning: resultLooksWedged(result)
          ? STUDIO_WEDGED_MSG
          : withErrorHint(
              "Play did not connect after stop-then-start (retried once). A previous test may still be in progress. Press Stop in Studio, then retry."
            ),
        error: result.error || result.warning,
        isEdit: true,
      };
    }
  }
  return result;
}

async function runAutomatedTest(ctx: ToolContext, args: Record<string, unknown>) {
  const body = String(args.script ?? args.source ?? "");
  if (!body.trim()) throw new Error("run_test requires script (Luau test body). The body runs inside ServerScriptService during play.");
  const testName = String(args.test_name ?? args.name ?? "RoBridgeTest").replace(/[^\w .-]/g, "_");
  const timeoutSec = Math.min(Math.max(Number(args.timeout ?? 60), 5), 300);
  const mode = args.mode === "run" ? "run" : "play";

  const studio = ctx.registry.get("manage_studio");
  if (!studio) throw new Error("manage_studio is not registered");
  const logs = ctx.registry.get("manage_logs");
  if (!logs) throw new Error("manage_logs is not registered");

  const wrapped = wrapTestScript(testName, body);
  let started: {
    started?: boolean;
    playConnected?: boolean;
    warning?: string;
    wedged?: boolean;
    code?: string;
  } | undefined;
  let passed: boolean | null = null;
  let failMessage: string | undefined;
  const collected: { level?: string; message?: string }[] = [];
  let timedOut = false;
  let recordPromise: Promise<unknown> | null = null;

  try {
    try {
      await studio({ action: "play_stop" });
    } catch {
      /* leftover play is best-effort; play_start also stop-before-start */
    }

    started = (await studio({
      action: "play_start",
      mode,
      testSource: wrapped,
      testName: TEST_SCRIPT_NAME,
    })) as typeof started;

    if (started?.wedged || started?.code === STUDIO_WEDGED_CODE) {
      throw new Error(started.warning || STUDIO_WEDGED_MSG);
    }
    if (!started?.started && !started?.playConnected) {
      throw new Error(started?.warning || "play_start failed; cannot run_test");
    }

    const camera = ctx.registry.get("manage_camera");
    const shouldRecord = args.record !== false && !!camera;
    recordPromise = shouldRecord
      ? camera!({
          action: "record",
          seconds: Number(args.recordSeconds ?? 4),
          path: typeof args.recordPath === "string" ? args.recordPath : undefined,
          fps: 15,
        }).catch((err: unknown) => ({
          recorded: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      : null;

    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      try {
        const chunk = (await logs({ action: "get", limit: 80, containsFilter: TEST_MARKER })) as {
          items?: { level?: string; message?: string }[];
        };
        for (const e of chunk.items ?? []) {
          const msg = String(e.message ?? "");
          if (!collected.some((c) => c.message === msg && c.level === e.level)) collected.push(e);
          if (msg.includes(`${TEST_MARKER} PASS`)) passed = true;
          if (msg.includes(`${TEST_MARKER} FAIL`)) {
            passed = false;
            failMessage = msg;
          }
          if (msg.includes(`${TEST_MARKER} END`)) {
            passed = passed ?? true;
          }
        }
        if (passed !== null && collected.some((e) => String(e.message ?? "").includes(`${TEST_MARKER} END`))) break;
      } catch {
        /* play agent may still be connecting */
      }
      await sleep(400);
    }
    timedOut = passed === null;
  } finally {
    try {
      await studio({ action: "play_stop" });
    } catch {
      /* still clean up */
    }
    await cleanupTestScript(ctx);
  }

  let clip: unknown = null;
  if (recordPromise) {
    clip = await recordPromise;
  }

  const report = {
    testName,
    mode,
    passed: passed === true,
    timedOut,
    failMessage: timedOut ? `run_test timed out after ${timeoutSec}s waiting for ${TEST_MARKER} END` : failMessage,
    playConnected: started?.playConnected === true,
    logs: collected,
    durationHintSeconds: timeoutSec,
    clip,
  };

  const dir = path.resolve("test-reports");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sanitize(testName)}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");
  return { ...report, reportPath: file };
}

function wrapTestScript(testName: string, body: string): string {
  return `print("${TEST_MARKER} START ${testName}")
local ok, err = pcall(function()
${body}
end)
if ok then
  print("${TEST_MARKER} PASS")
else
  warn("${TEST_MARKER} FAIL " .. tostring(err))
end
print("${TEST_MARKER} END")
`;
}

async function cleanupTestScript(ctx: ToolContext) {
  try {
    await runLuau(
      ctx,
      "manage_studio",
      `
local sss = game:GetService("ServerScriptService")
local inst = sss:FindFirstChild("t0") or sss:FindFirstChild("RoBridgeTestRunner")
if inst then inst:Destroy() end
return { cleaned = true }
`,
      {}
    );
  } catch {
    /* edit plugin may be reconnecting after play_stop */
  }
}

async function installPlayAgents(
  ctx: ToolContext,
  extra?: { testSource?: string; testName?: string }
) {
  await runLuau(
    ctx,
    "manage_studio",
    `
local RB, A = ...
if RB.installPlayAgents then
  return RB.installPlayAgents(A)
end
error("RoBridge plugin is too old to stage play agents. Reinstall the plugin (npm run install-plugin) and restart Studio.")
`,
    {
      rfName: PLAY_RF_NAME,
      serverName: PLAY_SERVER_NAME,
      clientName: PLAY_CLIENT_NAME,
      serverSource: playServerSource(ctx.config.port),
      clientSource: playClientSource(),
      testSource: extra?.testSource,
      testName: extra?.testName || TEST_SCRIPT_NAME,
    }
  );
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _\-.]/g, "_").trim() || "_";
}

const TOOLBOX_CATEGORY: Record<string, number> = {
  Model: 10,
  Decal: 13,
  Audio: 3,
  Mesh: 40,
  Plugin: 38,
};

const TOOLBOX_TYPE_ID: Record<number, string> = {
  3: "Audio",
  4: "Mesh",
  10: "Model",
  13: "Decal",
  24: "Animation",
  38: "Plugin",
  40: "Mesh",
};

type ToolboxAsset = {
  id?: number;
  name?: string;
  description?: string;
  typeId?: number;
  assetTypeId?: number;
  duration?: number;
  audioDetails?: { audioType?: string; title?: string };
};

type ToolboxDetails = {
  data?: {
    asset?: ToolboxAsset;
    creator?: { name?: string };
    fiatProduct?: { isFree?: boolean };
  }[];
};

function labelToolboxItem(d: { asset?: ToolboxAsset; creator?: { name?: string }; fiatProduct?: { isFree?: boolean } }) {
  const typeId = Number(d.asset?.typeId ?? d.asset?.assetTypeId ?? 0);
  const kind = TOOLBOX_TYPE_ID[typeId] || (typeId ? `Type${typeId}` : "Unknown");
  const insertHint =
    kind === "Audio"
      ? "insert as Sound (SoundId). Set play=true to preview."
      : "insert via Studio GetObjects. Do not invent a different assetId.";
  return {
    assetId: d.asset?.id,
    name: d.asset?.name,
    creator: d.creator?.name,
    kind,
    typeId: typeId || undefined,
    isFree: d.fiatProduct?.isFree,
    duration: d.asset?.duration,
    audioType: d.asset?.audioDetails?.audioType,
    description: d.asset?.description?.slice(0, 200),
    insertHint,
  };
}

async function fetchToolboxDetails(ids: number[]) {
  const detailsUrl = `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(",")}`;
  const detailsRes = await fetch(detailsUrl, { headers: { accept: "application/json" } });
  if (!detailsRes.ok) {
    throw new Error(`Toolbox details failed: HTTP ${detailsRes.status}. Retry search; do not invent asset IDs.`);
  }
  return (await detailsRes.json()) as ToolboxDetails;
}

async function searchMarketplace(keyword: string, assetType: string, limit: number) {
  const q = keyword.trim();
  if (!q) throw new Error("search requires a keyword. Example: keyword='wooden crate' assetType='Model'");
  const category = TOOLBOX_CATEGORY[assetType];
  if (!category) {
    throw new Error(`Unsupported assetType '${assetType}'. Use Model, Audio, Decal, or Mesh.`);
  }
  const url = `https://apis.roblox.com/toolbox-service/v1/marketplace/${category}?limit=${Math.min(Math.max(limit, 1), 30)}&keyword=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Toolbox search failed: HTTP ${res.status} for ${assetType} '${q}'. Official toolbox-service only; try another keyword. Do not invent asset IDs.`
    );
  }
  const data = (await res.json()) as { data?: { id: number }[] };
  const ids = (data.data ?? []).map((d) => d.id).filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) {
    throw new Error(
      `No Toolbox ${assetType} results for '${q}'. Refine the keyword (e.g. 'wooden crate', 'ui click'). Do not invent asset IDs.`
    );
  }

  try {
    const details = await fetchToolboxDetails(ids);
    const items = (details.data ?? []).map(labelToolboxItem).filter((item) => item.assetId);
    if (items.length === 0) {
      throw new Error(`Toolbox returned ids for '${q}' but no usable details. Retry search; do not invent IDs.`);
    }
    return {
      items,
      searched: { keyword: q, assetType, category },
      next: "Call manage_assets.insert with assetId from items[]. Never invent an ID.",
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No Toolbox")) throw err;
    return {
      items: ids.map((id) => ({
        assetId: id,
        kind: assetType,
        insertHint: "Details lookup failed; still a Toolbox search id — insert this, do not invent another.",
      })),
      searched: { keyword: q, assetType, category },
      warning: err instanceof Error ? err.message : String(err),
      next: "Call manage_assets.insert with assetId from items[]. Never invent an ID.",
    };
  }
}

async function previewMarketplaceAsset(assetId: number) {
  const details = await fetchToolboxDetails([assetId]);
  const row = details.data?.[0];
  if (!row?.asset?.id) {
    throw new Error(`No Toolbox metadata for assetId ${assetId}. Search first and use a result id; do not invent IDs.`);
  }
  return { item: labelToolboxItem(row), next: "If this is the asset you want, insert this same assetId." };
}
