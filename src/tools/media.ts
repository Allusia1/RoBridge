import { z } from "zod";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

const jsonValue = z.any();

export function registerMediaTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "manage_tween",
    "Animate properties with TweenService (plays live in the Studio viewport). Actions: create (build a tween without playing; returns tweenId), play (tweenId from create, or path+goal to create-and-play), pause, resume, cancel/stop_all. pause/resume/cancel accept tweenId or affect all tracked tweens. goal/properties map e.g. {\"Position\": [0,10,0], \"Transparency\": 0.5}.",
    {
      action: z.enum(["create", "play", "pause", "resume", "cancel", "stop_all"]),
      path: z.string().optional(),
      goal: z.record(jsonValue).optional().describe("Property goal map. Alias: properties"),
      properties: z.record(jsonValue).optional().describe("Alias for goal"),
      tweenId: z.string().optional().describe("Tween id returned by create; targets one tween for play/pause/resume/cancel"),
      duration: z.number().optional(),
      easingStyle: z.string().optional(),
      easingDirection: z.string().optional(),
      repeatCount: z.number().optional(),
      reverses: z.boolean().optional(),
      tweenInfo: z
        .object({
          duration: z.number().optional(),
          easingStyle: z.string().optional(),
          easingDirection: z.string().optional(),
          repeatCount: z.number().optional(),
          reverses: z.boolean().optional(),
          delayTime: z.number().optional(),
        })
        .optional()
        .describe("Alias object for duration/easing fields"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_tween",
        `
local RB, A = ...
local TS = game:GetService("TweenService")
RB.state.tweens = RB.state.tweens or {}
RB.state.tweensById = RB.state.tweensById or {}
local TI = A.tweenInfo or {}
local function makeTween()
  local inst = RB.resolve(A.path)
  local goal = {}
  for k, v in pairs(A.goal or A.properties or {}) do
    local ok, cur = pcall(function() return inst[k] end)
    goal[k] = RB.toValue(v, ok and typeof(cur) or nil, ok and cur or nil)
  end
  if next(goal) == nil then error("Provide goal (or properties) with at least one property to tween") end
  local info = TweenInfo.new(
    A.duration or TI.duration or 1,
    Enum.EasingStyle[A.easingStyle or TI.easingStyle or "Quad"],
    Enum.EasingDirection[A.easingDirection or TI.easingDirection or "Out"],
    A.repeatCount or TI.repeatCount or 0,
    A.reverses or TI.reverses or false,
    TI.delayTime or 0
  )
  local tween = TS:Create(inst, info, goal)
  table.insert(RB.state.tweens, tween)
  local id = "tween-" .. tostring(math.floor(os.clock() * 1000)) .. "-" .. tostring(#RB.state.tweens)
  RB.state.tweensById[id] = tween
  return tween, id, inst
end
local function each(fn)
  if A.tweenId then
    local t = RB.state.tweensById[A.tweenId]
    if not t then error("Unknown tweenId '" .. A.tweenId .. "'. Create one with manage_tween.create first.") end
    fn(t)
    return 1
  end
  local n = 0
  for _, t in ipairs(RB.state.tweens) do pcall(function() fn(t) end) n += 1 end
  return n
end
if A.action == "create" then
  if not A.path then error("create requires path") end
  local tween, id, inst = makeTween()
  return { tweenId = id, path = inst:GetFullName(), duration = tween.TweenInfo.Time, playing = false }
elseif A.action == "play" then
  if A.tweenId then
    local t = RB.state.tweensById[A.tweenId]
    if not t then error("Unknown tweenId '" .. A.tweenId .. "'. Create one with manage_tween.create first.") end
    t:Play()
    return { playing = true, tweenId = A.tweenId }
  end
  if not A.path then error("play requires tweenId (from create) or path+goal") end
  local tween, id, inst = makeTween()
  tween:Play()
  return { playing = true, tweenId = id, path = inst:GetFullName(), duration = tween.TweenInfo.Time }
elseif A.action == "pause" then
  local n = each(function(t) t:Pause() end)
  return { paused = n }
elseif A.action == "resume" then
  local n = each(function(t) t:Play() end)
  return { resumed = n }
elseif A.action == "cancel" or A.action == "stop_all" then
  local n = each(function(t) t:Cancel() end)
  if not A.tweenId then
    RB.state.tweens = {}
    RB.state.tweensById = {}
  end
  return { stopped = n }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );

  defineTool(
    ctx,
    "manage_audio",
    "Manage Sound instances. Actions: create (soundId number or 'rbxassetid://...' — do not invent IDs), play, pause, resume, stop, stop_all, list, set, set_listener (SoundService listener: Camera, CFrame, ObjectPosition, or ObjectCFrame). Prefer user-provided or search-accepted asset IDs.",
    {
      action: z.enum(["create", "play", "pause", "resume", "stop", "stop_all", "list", "set", "set_listener"]),
      path: z.string().optional(),
      parentPath: z.string().optional(),
      soundId: z.union([z.number(), z.string()]).optional(),
      name: z.string().optional(),
      properties: z.record(jsonValue).optional(),
      listenerType: z.enum(["Camera", "CFrame", "ObjectPosition", "ObjectCFrame"]).optional().describe("For set_listener (default Camera)"),
      listenerPath: z.string().optional().describe("Instance path for ObjectPosition/ObjectCFrame listener"),
      cframe: z.array(z.number()).optional().describe("[x,y,z] for CFrame listener"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_audio",
        `
local RB, A = ...
if A.action == "create" then
  local s = Instance.new("Sound")
  s.Name = A.name or "Sound"
  local id = A.soundId
  if type(id) == "number" then id = "rbxassetid://" .. id end
  if id then s.SoundId = id end
  if A.properties then RB.setProps(s, A.properties) end
  s.Parent = A.parentPath and RB.resolve(A.parentPath) or workspace
  RB.waypoint("create sound")
  return RB.summary(s, true)
elseif A.action == "play" then
  local s = RB.resolve(A.path)
  s:Play()
  return { playing = true, path = s:GetFullName() }
elseif A.action == "pause" then
  local s = RB.resolve(A.path)
  s:Pause()
  return { paused = true, path = s:GetFullName() }
elseif A.action == "resume" then
  local s = RB.resolve(A.path)
  s:Resume()
  return { playing = true, path = s:GetFullName() }
elseif A.action == "stop" then
  local s = RB.resolve(A.path)
  s:Stop()
  return { stopped = true }
elseif A.action == "stop_all" then
  local n = 0
  for _, s in ipairs(game:GetDescendants()) do
    if s:IsA("Sound") and s.IsPlaying then s:Stop() n += 1 end
  end
  return { stopped = n }
elseif A.action == "list" then
  local out = {}
  for _, s in ipairs(game:GetDescendants()) do
    if s:IsA("Sound") then
      table.insert(out, { path = s:GetFullName(), soundId = s.SoundId, playing = s.IsPlaying, volume = s.Volume })
      if #out >= 100 then break end
    end
  end
  return { items = out }
elseif A.action == "set" then
  local s = RB.resolve(A.path)
  RB.setProps(s, A.properties or {})
  RB.waypoint("sound")
  return RB.summary(s, true)
elseif A.action == "set_listener" then
  local SS = game:GetService("SoundService")
  local lt = A.listenerType or "Camera"
  if lt == "Camera" then
    SS:SetListener(Enum.ListenerType.Camera)
  elseif lt == "CFrame" then
    if not A.cframe then error("set_listener with CFrame requires cframe [x,y,z]") end
    SS:SetListener(Enum.ListenerType.CFrame, CFrame.new(A.cframe[1], A.cframe[2], A.cframe[3]))
  elseif lt == "ObjectPosition" or lt == "ObjectCFrame" then
    if not A.listenerPath then error("set_listener with " .. lt .. " requires listenerPath") end
    local target = RB.resolve(A.listenerPath)
    SS:SetListener(Enum.ListenerType[lt], target)
  end
  local kind, what = SS:GetListener()
  return { listenerType = tostring(kind), target = typeof(what) == "Instance" and what:GetFullName() or RB.encode(what) }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );

  defineTool(
    ctx,
    "manage_animation",
    "Manage animations. Actions: create (Animation with animationId — do not invent IDs), list, load (load onto a rig without playing), play, stop, stop_all, get_tracks (tracks on a rig). Prefer user-provided or search-accepted animation IDs.",
    {
      action: z.enum(["create", "list", "load", "play", "stop", "stop_all", "get_tracks"]),
      animationId: z.union([z.number(), z.string()]).optional(),
      parentPath: z.string().optional(),
      name: z.string().optional(),
      path: z.string().optional().describe("Animation instance path for play"),
      rigPath: z.string().optional().describe("Model with Humanoid or AnimationController"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_animation",
        `
local RB, A = ...
RB.state.tracks = RB.state.tracks or {}
if A.action == "create" then
  local anim = Instance.new("Animation")
  anim.Name = A.name or "Animation"
  local id = A.animationId
  if type(id) == "number" then id = "rbxassetid://" .. id end
  if id then anim.AnimationId = id end
  anim.Parent = A.parentPath and RB.resolve(A.parentPath) or workspace
  RB.waypoint("create animation")
  return RB.summary(anim, true)
elseif A.action == "list" then
  local out = {}
  for _, a in ipairs(game:GetDescendants()) do
    if a:IsA("Animation") then
      table.insert(out, { path = a:GetFullName(), animationId = a.AnimationId })
      if #out >= 100 then break end
    end
  end
  return { items = out }
elseif A.action == "load" or A.action == "play" then
  local anim = RB.resolve(A.path)
  local rig = RB.resolve(A.rigPath)
  local animator = rig:FindFirstChildWhichIsA("Animator", true)
  if not animator then
    local h = rig:FindFirstChildWhichIsA("Humanoid") or rig:FindFirstChildWhichIsA("AnimationController")
    if not h then error("Rig has no Humanoid or AnimationController") end
    animator = Instance.new("Animator")
    animator.Parent = h
  end
  local track = animator:LoadAnimation(anim)
  table.insert(RB.state.tracks, track)
  if A.action == "play" then track:Play() end
  return { loaded = true, playing = A.action == "play", length = track.Length, rig = rig:GetFullName() }
elseif A.action == "stop" then
  local n = 0
  for _, t in ipairs(RB.state.tracks) do pcall(function() t:Stop() end) n += 1 end
  return { stopped = n }
elseif A.action == "get_tracks" then
  local rig = RB.resolve(A.rigPath or A.path)
  local animator = rig:FindFirstChildWhichIsA("Animator", true)
  if not animator then return { items = {} } end
  local out = {}
  for _, t in ipairs(animator:GetPlayingAnimationTracks()) do
    table.insert(out, { name = t.Name, isPlaying = t.IsPlaying, length = t.Length })
  end
  return { items = out }
elseif A.action == "stop_all" then
  local n = 0
  for _, t in ipairs(RB.state.tracks) do pcall(function() t:Stop() end) n += 1 end
  RB.state.tracks = {}
  return { stopped = n }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );
}
