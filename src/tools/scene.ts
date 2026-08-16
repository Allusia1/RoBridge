import { z } from "zod";
import { abortRecordingUpload, finishRecordingUpload, finishScreenshotUpload } from "../screenshot.js";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

const jsonValue = z.any();

export function registerSceneTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "manage_lighting",
    "Inspect or change Lighting and environment. Actions: get, set/lighting (Lighting properties), set_time/time (clockTime 0-24 or time 'HH:MM:SS'), atmosphere (get/set Atmosphere, createIfMissing), sky, terrain_props (Terrain water/visuals), mood (preset: day/night/sunset/foggy/horror plus optional overrides), add_effect, clear_effects. Do not invent skybox asset IDs.",
    {
      action: z.enum(["get", "set", "lighting", "set_time", "time", "atmosphere", "sky", "terrain_props", "mood", "add_effect", "clear_effects"]),
      properties: z.record(jsonValue).optional(),
      clockTime: z.number().optional(),
      time: z.string().optional().describe("HH:MM:SS for time action"),
      effectType: z.string().optional().describe("e.g. Atmosphere, BloomEffect"),
      createIfMissing: z.boolean().optional().describe("Create Atmosphere/Sky if missing (default true)"),
      mood: z.enum(["day", "night", "sunset", "foggy", "horror"]).optional(),
      overrides: z.record(jsonValue).optional().describe("Optional Lighting property overrides for mood"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_lighting",
        `
local RB, A = ...
local L = game:GetService("Lighting")
local function lightingState()
  local out = RB.getProps(L, {"ClockTime","TimeOfDay","Brightness","Ambient","OutdoorAmbient","EnvironmentDiffuseScale","EnvironmentSpecularScale","GlobalShadows","Technology","FogStart","FogEnd","FogColor","ExposureCompensation"})
  local effects = {}
  for _, c in ipairs(L:GetChildren()) do table.insert(effects, { name = c.Name, className = c.ClassName }) end
  out.effects = effects
  return out
end
local function ensureChild(className)
  local inst = L:FindFirstChildOfClass(className)
  if not inst and A.createIfMissing ~= false then
    inst = Instance.new(className)
    inst.Parent = L
  end
  if not inst then error(className .. " is missing; pass createIfMissing=true") end
  return inst
end
if A.action == "get" then
  return lightingState()
elseif A.action == "set" or A.action == "lighting" then
  if A.properties then RB.setProps(L, A.properties) RB.waypoint("lighting") end
  return lightingState()
elseif A.action == "set_time" or A.action == "time" then
  if A.time and type(A.time) == "string" then
    L.TimeOfDay = A.time
  else
    L.ClockTime = A.clockTime or 12
  end
  RB.waypoint("lighting time")
  return { ClockTime = L.ClockTime, TimeOfDay = L.TimeOfDay }
elseif A.action == "atmosphere" then
  local a = ensureChild("Atmosphere")
  if A.properties then RB.setProps(a, A.properties) RB.waypoint("atmosphere") end
  return RB.summary(a, true)
elseif A.action == "sky" then
  local s = ensureChild("Sky")
  if A.properties then RB.setProps(s, A.properties) RB.waypoint("sky") end
  return RB.summary(s, true)
elseif A.action == "terrain_props" then
  local T = workspace.Terrain
  if A.properties then RB.setProps(T, A.properties) RB.waypoint("terrain props") end
  return { waterWaveSize = T.WaterWaveSize, waterColor = RB.encode(T.WaterColor), waterTransparency = T.WaterTransparency }
elseif A.action == "mood" then
  local mood = A.mood or "day"
  local presets = {
    day = { ClockTime = 14, Brightness = 2, Ambient = Color3.fromRGB(140, 140, 140), OutdoorAmbient = Color3.fromRGB(180, 180, 180), FogStart = 0, FogEnd = 100000 },
    night = { ClockTime = 0, Brightness = 0.4, Ambient = Color3.fromRGB(40, 40, 60), OutdoorAmbient = Color3.fromRGB(30, 30, 50), FogStart = 0, FogEnd = 100000 },
    sunset = { ClockTime = 17.6, Brightness = 1.4, Ambient = Color3.fromRGB(180, 120, 80), OutdoorAmbient = Color3.fromRGB(200, 140, 90), FogStart = 80, FogEnd = 600 },
    foggy = { ClockTime = 10, Brightness = 1, Ambient = Color3.fromRGB(160, 160, 170), FogStart = 20, FogEnd = 220, FogColor = Color3.fromRGB(180, 180, 190) },
    horror = { ClockTime = 0.2, Brightness = 0.15, Ambient = Color3.fromRGB(20, 10, 10), OutdoorAmbient = Color3.fromRGB(15, 10, 10), FogStart = 10, FogEnd = 120, FogColor = Color3.fromRGB(10, 8, 8) },
  }
  local preset = presets[mood]
  if not preset then error("Unknown mood '" .. tostring(mood) .. "'. Use day, night, sunset, foggy, or horror") end
  for k, v in pairs(preset) do L[k] = v end
  if A.overrides then RB.setProps(L, A.overrides) end
  if A.properties then RB.setProps(L, A.properties) end
  local atm = L:FindFirstChildOfClass("Atmosphere")
  if not atm then atm = Instance.new("Atmosphere") atm.Parent = L end
  if mood == "foggy" then atm.Density = 0.45 atm.Haze = 2
  elseif mood == "horror" then atm.Density = 0.5 atm.Haze = 1.5 atm.Color = Color3.fromRGB(20, 10, 10)
  elseif mood == "night" then atm.Density = 0.3 atm.Haze = 0.4
  else atm.Density = 0.22 atm.Haze = 0 end
  RB.waypoint("mood " .. mood)
  return { mood = mood, lighting = lightingState() }
elseif A.action == "add_effect" then
  local e = Instance.new(A.effectType)
  if A.properties then RB.setProps(e, A.properties) end
  e.Parent = L
  RB.waypoint("lighting effect")
  return RB.summary(e, true)
elseif A.action == "clear_effects" then
  local removed = {}
  for _, c in ipairs(L:GetChildren()) do
    if c:IsA("PostEffect") or c:IsA("Atmosphere") or c:IsA("Sky") or c:IsA("Clouds") then
      table.insert(removed, c.ClassName)
      c:Destroy()
    end
  end
  RB.waypoint("clear lighting effects")
  return { removed = removed }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );

  defineTool(
    ctx,
    "manage_camera",
    "Control the Studio viewport camera. Actions: get/info, set, focus/focus_path, focus_position (look at a world point), suggest (recommended views for a target or the selection — does not move the camera), zoom_extents, screenshot, record, record_stop. screenshot captures the Edit-mode viewport via Roblox CaptureService (works even if Studio is in the background). record captures a short viewport clip (CaptureService frame burst → Node stitch). CaptureService allows only one in-flight shot and typically lands around 1.5–2 fps; that cap is expected. record_stop aborts an in-flight recording. Requires File → Game Settings → Security → Allow Mesh / Image APIs.",
    {
      action: z.enum(["get", "info", "set", "focus", "focus_path", "focus_position", "suggest", "zoom_extents", "screenshot", "record", "record_stop"]),
      position: z.array(z.number()).optional().describe("[x,y,z] camera position"),
      lookAt: z.array(z.number()).optional().describe("[x,y,z] point to look at"),
      path: z.string().optional().describe("Instance to focus for focus/screenshot/record"),
      distance: z.number().optional().describe("Distance from target when focusing"),
      maxDimension: z.number().optional().describe("Longest screenshot/record side in pixels (screenshot default 1024, record default 480)"),
      seconds: z.number().optional().describe("record duration in seconds (default 4, max 12)"),
      fps: z.number().optional().describe("record target frames per second (default 15, range 4–24). Actual rate is CaptureService-limited (~1.5–2 fps)."),
    },
    async (args, ctx) => {
      if (args.action === "info") args = { ...args, action: "get" };
      if (args.action === "focus_path") args = { ...args, action: "focus" };
      if (args.action === "focus_position") {
        return runLuau(
          ctx,
          "manage_camera",
          `
local RB, A = ...
local cam = workspace.CurrentCamera
local target = Vector3.new((A.lookAt or A.position)[1], (A.lookAt or A.position)[2], (A.lookAt or A.position)[3])
local dist = A.distance or 24
local eye = target + Vector3.new(0.6, 0.45, 0.6).Unit * dist
cam.CFrame = CFrame.lookAt(eye, target)
cam.Focus = CFrame.new(target)
return { position = RB.encode(eye), target = RB.encode(target) }
`,
          args
        );
      }
      if (args.action === "record_stop") {
        return runLuau(
          ctx,
          "manage_camera",
          `local RB = ...
RB.state.recording = false
if RB.stopRecording then RB.stopRecording() end
return { stopped = true }`,
          {}
        );
      }
      if (args.action === "record") {
        const seconds = Math.min(Math.max(Number(args.seconds ?? 4), 1), 12);
        const fps = Math.min(Math.max(Number(args.fps ?? 15), 4), 24);
        const maxDimension = Math.min(Math.max(Number(args.maxDimension ?? 480), 160), 1280);
        const captured = (await runLuau(
          ctx,
          "manage_camera",
          `
local RB, A = ...
RB.state.recording = true
local cam = workspace.CurrentCamera
if A.path and A.path ~= "" then
  local inst = RB.resolve(A.path)
  local cf, size
  if inst:IsA("Model") then
    cf, size = inst:GetBoundingBox()
  elseif inst:IsA("BasePart") then
    cf, size = inst.CFrame, inst.Size
  else
    error("focus target must be a Model or BasePart")
  end
  local dist = A.distance or (size.Magnitude * 1.5 + 5)
  local target = cf.Position
  cam.CFrame = CFrame.lookAt(target + Vector3.new(0.6, 0.45, 0.6).Unit * dist, target)
  cam.Focus = CFrame.new(target)
  task.wait(0.05)
end
local cs = game:GetService("CaptureService")
local AssetService = game:GetService("AssetService")
local HttpService = game:GetService("HttpService")
local okProbe, probeErr = pcall(function()
  return AssetService:CreateEditableImage({ Size = Vector2.new(4, 4) })
end)
if not okProbe then
  RB.state.recording = false
  error("CreateEditableImage failed. Enable File → Game Settings → Security → Allow Mesh / Image APIs. Detail: " .. tostring(probeErr))
end
local function scaleRgba(src, sw, sh, dw, dh)
  local dst = buffer.create(dw * dh * 4)
  for y = 0, dh - 1 do
    local sy = math.min(sh - 1, math.floor(y * sh / dh))
    local srcRow, dstRow = sy * sw, y * dw
    for x = 0, dw - 1 do
      local sx = math.min(sw - 1, math.floor(x * sw / dw))
      buffer.writeu32(dst, (dstRow + x) * 4, buffer.readu32(src, (srcRow + sx) * 4))
    end
  end
  return dst
end
local function startCapture()
  local box = { id = nil, done = false }
  cs:CaptureScreenshot(function(id)
    box.id = id
    box.done = true
  end)
  return box
end
local function waitCapture(box)
  local t = 0
  while not box.done and t < 4 do
    task.wait()
    t += 0.016
  end
  if not box.id then error("CaptureService did not return a screenshot. Enable File → Game Settings → Security → Allow Mesh / Image APIs, and wait if another shot is in flight.") end
  return box.id
end
local small
local function consume(contentId)
  local ok, img = pcall(function()
    return AssetService:CreateEditableImageAsync(contentId)
  end)
  if not ok then
    error("CreateEditableImageAsync failed. Enable File → Game Settings → Security → Allow Mesh / Image APIs. Detail: " .. tostring(img))
  end
  return img
end
local function extract(img)
  local sw, sh = img.Size.X, img.Size.Y
  local maxDim = A.maxDimension or 480
  local scale = math.min(1, maxDim / math.max(sw, sh))
  local dw = math.max(2, math.floor(sw * scale + 0.5))
  local dh = math.max(2, math.floor(sh * scale + 0.5))
  if dw ~= sw or dh ~= sh then
    if not small or small.Size.X ~= dw or small.Size.Y ~= dh then
      small = AssetService:CreateEditableImage({ Size = Vector2.new(dw, dh) })
    end
    local drew = pcall(function()
      small:DrawImageTransformed(
        Vector2.new(dw / 2, dh / 2),
        Vector2.new(dw / sw, dh / sh),
        0,
        img,
        { CombineType = Enum.ImageCombineType.Overwrite }
      )
    end)
    if drew then
      local buf = small:ReadPixelsBuffer(Vector2.zero, Vector2.new(dw, dh))
      pcall(function() img:Destroy() end)
      return buffer.readstring(buf, 0, buffer.len(buf)), dw, dh
    end
    local full = img:ReadPixelsBuffer(Vector2.zero, Vector2.new(sw, sh))
    pcall(function() img:Destroy() end)
    local dst = scaleRgba(full, sw, sh, dw, dh)
    return buffer.readstring(dst, 0, buffer.len(dst)), dw, dh
  end
  local buf = img:ReadPixelsBuffer(Vector2.zero, Vector2.new(dw, dh))
  pcall(function() img:Destroy() end)
  return buffer.readstring(buf, 0, buffer.len(buf)), dw, dh
end
local seconds = A.seconds or 4
local fps = A.fps or 15
local maxFrames = math.min(math.floor(seconds * fps + 0.5), 200)
local pending = startCapture()
local tStart = os.clock()
local firstImg = consume(waitCapture(pending))
pending = startCapture()
local first, width, height = extract(firstImg)
local uploadId = HttpService:GenerateGUID(false)
local beginRes = HttpService:RequestAsync({
  Url = "http://127.0.0.1:" .. tostring(A.port or 3737) .. "/api/plugin/record-begin",
  Method = "POST",
  Headers = { ["Content-Type"] = "application/json" },
  Body = HttpService:JSONEncode({ uploadId = uploadId, width = width, height = height, fps = fps }),
})
if not beginRes.Success then
  RB.state.recording = false
  error("record-begin failed: " .. tostring(beginRes.StatusCode))
end
local function postFrame(payload)
  local tileRes = HttpService:RequestAsync({
    Url = "http://127.0.0.1:" .. tostring(A.port or 3737) .. "/api/plugin/record-frame",
    Method = "POST",
    Headers = {
      ["Content-Type"] = "application/octet-stream",
      ["X-Upload-Id"] = uploadId,
    },
    Body = payload,
  })
  if not tileRes.Success then error("record-frame failed: " .. tostring(tileRes.StatusCode)) end
end
local queue = { first }
local uploadErr
local uploading = true
task.spawn(function()
  while uploading or #queue > 0 do
    if #queue > 0 then
      local payload = table.remove(queue, 1)
      local ok, err = pcall(postFrame, payload)
      if not ok then
        uploadErr = err
        uploading = false
        return
      end
    else
      task.wait()
    end
  end
end)
local frames = 1
local deadline = tStart + seconds
while RB.state.recording and os.clock() < deadline and frames < maxFrames do
  local img = consume(waitCapture(pending))
  pending = startCapture()
  local raw, dw, dh = extract(img)
  if dw == width and dh == height then
    table.insert(queue, raw)
    frames += 1
  end
end
local elapsed = math.max(os.clock() - tStart, 0.001)
RB.state.recording = false
uploading = false
local drainT = 0
while #queue > 0 and not uploadErr and drainT < 15 do
  task.wait()
  drainT += 0.016
end
if uploadErr then error(tostring(uploadErr)) end
return {
  uploadId = uploadId,
  width = width,
  height = height,
  frames = frames,
  fps = frames / elapsed,
  elapsed = elapsed,
  requestedFps = fps,
}
`,
          { ...args, port: ctx.config.port, seconds, fps, maxDimension },
          Math.max(60_000, seconds * 20_000)
        )) as { uploadId: string; width: number; height: number; frames: number; fps: number; elapsed: number };
        try {
          const finished = finishRecordingUpload(captured.uploadId, captured.fps);
          return {
            recorded: true,
            method: "CaptureService-frames",
            ...finished,
            requestedSeconds: seconds,
            requestedFps: fps,
            capturedFrames: captured.frames,
            elapsed: captured.elapsed,
            url: `/api/screenshots/${finished.galleryId}`,
          };
        } catch (err) {
          abortRecordingUpload(captured.uploadId);
          throw err;
        }
      }
      if (args.action === "screenshot") {
        const captured = (await runLuau(
          ctx,
          "manage_camera",
          `
local RB, A = ...
if not game:GetService("RunService"):IsEdit() then
  error("screenshot is Edit-mode only (CaptureService → EditableImage is blocked during playtest)")
end
local cam = workspace.CurrentCamera
if A.path and A.path ~= "" then
  local inst = RB.resolve(A.path)
  local cf, size
  if inst:IsA("Model") then
    cf, size = inst:GetBoundingBox()
  elseif inst:IsA("BasePart") then
    cf, size = inst.CFrame, inst.Size
  else
    error("focus target must be a Model or BasePart")
  end
  local dist = A.distance or (size.Magnitude * 1.5 + 5)
  local target = cf.Position
  cam.CFrame = CFrame.lookAt(target + Vector3.new(0.6, 0.45, 0.6).Unit * dist, target)
  cam.Focus = CFrame.new(target)
  task.wait(0.2)
end
local cs = game:GetService("CaptureService")
local AssetService = game:GetService("AssetService")
local HttpService = game:GetService("HttpService")
local got
local done = false
cs:CaptureScreenshot(function(id) got = id done = true end)
local t = 0
while not done and t < 4 do task.wait(0.1) t += 0.1 end
if not got then error("CaptureService did not return a screenshot. Enable File → Game Settings → Security → Allow Mesh / Image APIs, and wait if another shot is in flight.") end
local ok, img = pcall(function()
  return AssetService:CreateEditableImageAsync(got)
end)
if not ok then
  error("CreateEditableImageAsync failed. Enable File → Game Settings → Security → Allow Mesh / Image APIs. Detail: " .. tostring(img))
end
local w, h = img.Size.X, img.Size.Y
local uploadId = HttpService:GenerateGUID(false)
local beginRes = HttpService:RequestAsync({
  Url = "http://127.0.0.1:" .. tostring(A.port or 3737) .. "/api/plugin/screenshot-begin",
  Method = "POST",
  Headers = { ["Content-Type"] = "application/json" },
  Body = HttpService:JSONEncode({ uploadId = uploadId, width = w, height = h }),
})
if not beginRes.Success then error("screenshot-begin failed: " .. tostring(beginRes.StatusCode)) end
local tileH = 40
for y = 0, h - 1, tileH do
  local rows = math.min(tileH, h - y)
  local part = img:ReadPixelsBuffer(Vector2.new(0, y), Vector2.new(w, rows))
  local raw = buffer.readstring(part, 0, buffer.len(part))
  local tileRes = HttpService:RequestAsync({
    Url = "http://127.0.0.1:" .. tostring(A.port or 3737) .. "/api/plugin/screenshot-tile",
    Method = "POST",
    Headers = {
      ["Content-Type"] = "application/octet-stream",
      ["X-Upload-Id"] = uploadId,
      ["X-Y"] = tostring(y),
      ["X-Rows"] = tostring(rows),
    },
    Body = raw,
  })
  if not tileRes.Success then error("screenshot-tile failed at y=" .. y .. ": " .. tostring(tileRes.StatusCode)) end
end
return { uploadId = uploadId, width = w, height = h }
`,
          { ...args, port: ctx.config.port },
          60_000
        )) as { uploadId: string; width: number; height: number };
        return { captured: true, source: "CaptureService", ...finishScreenshotUpload(captured.uploadId) };
      }
      return runLuau(
        ctx,
        "manage_camera",
        `
local RB, A = ...
local cam = workspace.CurrentCamera
if A.action == "get" then
  return { cframe = RB.encode(cam.CFrame), position = RB.encode(cam.CFrame.Position), lookVector = RB.encode(cam.CFrame.LookVector), fieldOfView = cam.FieldOfView, focus = RB.encode(cam.Focus.Position) }
elseif A.action == "set" then
  local pos = A.position and Vector3.new(A.position[1], A.position[2], A.position[3]) or cam.CFrame.Position
  if A.lookAt then
    local target = Vector3.new(A.lookAt[1], A.lookAt[2], A.lookAt[3])
    cam.CFrame = CFrame.lookAt(pos, target)
    cam.Focus = CFrame.new(target)
  else
    cam.CFrame = CFrame.new(pos) * (cam.CFrame - cam.CFrame.Position)
  end
  return { position = RB.encode(cam.CFrame.Position) }
elseif A.action == "focus" then
  local inst = RB.resolve(A.path)
  local cf, size
  if inst:IsA("Model") then
    cf, size = inst:GetBoundingBox()
  elseif inst:IsA("BasePart") then
    cf, size = inst.CFrame, inst.Size
  else
    error("focus target must be a Model or BasePart")
  end
  local dist = A.distance or (size.Magnitude * 1.5 + 5)
  local target = cf.Position
  local eye = target + Vector3.new(0.6, 0.45, 0.6).Unit * dist
  cam.CFrame = CFrame.lookAt(eye, target)
  cam.Focus = CFrame.new(target)
  return { position = RB.encode(eye), target = RB.encode(target) }
elseif A.action == "suggest" then
  local cf, size
  if A.path and A.path ~= "" then
    local inst = RB.resolve(A.path)
    if inst:IsA("Model") then
      cf, size = inst:GetBoundingBox()
    elseif inst:IsA("BasePart") then
      cf, size = inst.CFrame, inst.Size
    else
      error("suggest target must be a Model or BasePart")
    end
  else
    local sel = game:GetService("Selection"):Get()
    if #sel == 0 then error("suggest needs path or a non-empty Studio selection") end
    local first = sel[1]
    if first:IsA("Model") then
      cf, size = first:GetBoundingBox()
    elseif first:IsA("BasePart") then
      cf, size = first.CFrame, first.Size
    else
      error("Selected instance is not a Model or BasePart")
    end
  end
  local target = cf.Position
  local dist = A.distance or (size.Magnitude * 1.5 + 5)
  local function view(name, dir, d)
    local eye = target + dir.Unit * (d or dist)
    return { name = name, position = RB.encode(eye), lookAt = RB.encode(target), distance = d or dist }
  end
  return {
    target = RB.encode(target),
    size = RB.encode(size),
    views = {
      view("iso", Vector3.new(0.6, 0.45, 0.6)),
      view("front", Vector3.new(0, 0.15, 1)),
      view("top", Vector3.new(0.01, 1, 0.01)),
      view("closeup", Vector3.new(0.6, 0.3, 0.6), dist * 0.5),
    },
    hint = "Apply a view with manage_camera.set { position, lookAt }",
  }
elseif A.action == "zoom_extents" then
  local cf, size = workspace:GetBoundingBox()
  local dist = math.max(size.Magnitude, 10) * 0.9
  local target = cf.Position
  local eye = target + Vector3.new(0.6, 0.5, 0.6).Unit * dist
  cam.CFrame = CFrame.lookAt(eye, target)
  cam.Focus = CFrame.new(target)
  return { position = RB.encode(eye), target = RB.encode(target) }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      );
    }
  );

  defineTool(
    ctx,
    "manage_effects",
    "Add visual effects to parts. Actions: create (ParticleEmitter, Fire, Smoke, Sparkles, Trail, Beam, PointLight, SpotLight, SurfaceLight, Highlight), remove/clear, list, emit (ParticleEmitter:Emit), toggle (Enabled).",
    {
      action: z.enum(["create", "remove", "clear", "list", "emit", "toggle"]),
      path: z.string().describe("Target part/instance path"),
      effectType: z.string().optional(),
      name: z.string().optional(),
      properties: z.record(jsonValue).optional(),
      count: z.number().optional().describe("Particle count for emit (default 16)"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_effects",
        `
local RB, A = ...
local inst = RB.resolve(A.path)
if A.action == "create" then
  local e = Instance.new(A.effectType)
  if A.name then e.Name = A.name end
  if A.properties then RB.setProps(e, A.properties) end
  e.Parent = inst
  RB.waypoint("effect")
  return RB.summary(e, true)
elseif A.action == "remove" or A.action == "clear" then
  local removed = 0
  for _, c in ipairs(inst:GetDescendants()) do
    if not A.effectType or c.ClassName == A.effectType then
      if c:IsA("ParticleEmitter") or c:IsA("Fire") or c:IsA("Smoke") or c:IsA("Sparkles") or c:IsA("Trail") or c:IsA("Beam") or c:IsA("Light") or c:IsA("Highlight") then
        c:Destroy()
        removed += 1
      elseif A.effectType and c.ClassName == A.effectType then
        c:Destroy()
        removed += 1
      end
    end
  end
  RB.waypoint("remove effects")
  return { removed = removed }
elseif A.action == "emit" then
  local n = 0
  local count = A.count or 16
  local function emit(e)
    if e:IsA("ParticleEmitter") then e:Emit(count) n += 1 end
  end
  emit(inst)
  for _, c in ipairs(inst:GetDescendants()) do emit(c) end
  return { emitted = n, count = count }
elseif A.action == "toggle" then
  local n = 0
  local function tog(e)
    if e:IsA("ParticleEmitter") or e:IsA("Light") or e:IsA("Fire") or e:IsA("Smoke") or e:IsA("Sparkles") or e:IsA("Beam") or e:IsA("Trail") then
      e.Enabled = not e.Enabled
      n += 1
    end
  end
  tog(inst)
  for _, c in ipairs(inst:GetDescendants()) do tog(c) end
  return { toggled = n }
elseif A.action == "list" then
  local out = {}
  for _, c in ipairs(inst:GetDescendants()) do
    if c:IsA("ParticleEmitter") or c:IsA("Fire") or c:IsA("Smoke") or c:IsA("Sparkles") or c:IsA("Trail") or c:IsA("Beam") or c:IsA("Light") or c:IsA("Highlight") then
      table.insert(out, RB.summary(c))
    end
  end
  return { items = out }
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );

  defineTool(
    ctx,
    "manage_physics",
    "Physics helpers. Actions: anchor / unanchor, set_collide, weld, get_mass, set_physical_properties, create_constraint, register_group, set_collidable, get_groups (PhysicsService collision groups).",
    {
      action: z.enum([
        "anchor",
        "unanchor",
        "set_collide",
        "weld",
        "get_mass",
        "set_physical_properties",
        "create_constraint",
        "register_group",
        "set_collidable",
        "get_groups",
      ]),
      path: z.string().optional(),
      otherPath: z.string().optional(),
      canCollide: z.boolean().optional(),
      constraintType: z.string().optional(),
      properties: z.record(jsonValue).optional(),
      density: z.number().optional(),
      friction: z.number().optional(),
      elasticity: z.number().optional(),
      group: z.string().optional().describe("Collision group name"),
      groupA: z.string().optional(),
      groupB: z.string().optional(),
      collidable: z.boolean().optional(),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_physics",
        `
local RB, A = ...
if A.action == "register_group" then
  if not A.group then error("register_group requires group") end
  local ok, err = pcall(function() game:GetService("PhysicsService"):RegisterCollisionGroup(A.group) end)
  if not ok and not string.find(tostring(err), "already", 1, true) then error(tostring(err)) end
  return { group = A.group, created = ok }
elseif A.action == "set_collidable" then
  game:GetService("PhysicsService"):CollisionGroupSetCollidable(A.groupA, A.groupB, A.collidable ~= false)
  return { groupA = A.groupA, groupB = A.groupB, collidable = A.collidable ~= false }
elseif A.action == "get_groups" then
  return { groups = game:GetService("PhysicsService"):GetRegisteredCollisionGroups() }
end
local inst = RB.resolve(A.path)
local function eachPart(root, fn)
  if root:IsA("BasePart") then fn(root) end
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("BasePart") then fn(c) end
  end
end
if A.action == "anchor" or A.action == "unanchor" then
  local n = 0
  eachPart(inst, function(p) p.Anchored = (A.action == "anchor") n += 1 end)
  RB.waypoint(A.action)
  return { affected = n, anchored = A.action == "anchor" }
elseif A.action == "set_collide" then
  local n = 0
  eachPart(inst, function(p) p.CanCollide = A.canCollide and true or false n += 1 end)
  RB.waypoint("collide")
  return { affected = n }
elseif A.action == "weld" then
  local other = RB.resolve(A.otherPath)
  local w = Instance.new("WeldConstraint")
  w.Part0 = inst
  w.Part1 = other
  w.Parent = inst
  RB.waypoint("weld")
  return RB.summary(w)
elseif A.action == "get_mass" then
  return { assemblyMass = inst:IsA("BasePart") and inst.AssemblyMass or nil }
elseif A.action == "set_physical_properties" then
  local cur = inst.CurrentPhysicalProperties
  inst.CustomPhysicalProperties = PhysicalProperties.new(A.density or cur.Density, A.friction or cur.Friction, A.elasticity or cur.Elasticity)
  RB.waypoint("physical properties")
  return { density = inst.CurrentPhysicalProperties.Density, friction = inst.CurrentPhysicalProperties.Friction, elasticity = inst.CurrentPhysicalProperties.Elasticity }
elseif A.action == "create_constraint" then
  local other = RB.resolve(A.otherPath)
  local a0 = Instance.new("Attachment") a0.Parent = inst
  local a1 = Instance.new("Attachment") a1.Parent = other
  local c = Instance.new(A.constraintType)
  c.Attachment0 = a0
  c.Attachment1 = a1
  if A.properties then RB.setProps(c, A.properties) end
  c.Parent = inst
  RB.waypoint("constraint")
  return RB.summary(c)
end
error("Unknown action: " .. tostring(A.action))
`,
        args
      )
  );

  defineTool(
    ctx,
    "manage_terrain",
    "Edit Terrain. Actions: fill_block, fill_ball, fill_cylinder, fill_wedge, clear, clear_region (center+size or region {min,max}), clear_bounds (min+max), replace_material (fromMaterial→material), colors_get / colors_set (per-material terrain colors), read_voxel (position), read_voxels / write_voxels (bulk region voxels), generate (procedural fBm terrain with presets mountains/hills/plains/dunes/islands/canyon), smooth (blur occupancy in a region), get_info. Regions: {min:[x,y,z], max:[x,y,z]}. Materials: Grass, Sand, Rock, Water, Snow, Mud, Asphalt, Basalt, Brick, Cobblestone, Concrete, CrackedLava, Glacier, Ground, Ice, LeafyGrass, Limestone, Pavement, Salt, Sandstone, Slate, WoodPlanks.",
    {
      action: z.enum([
        "fill_block",
        "fill_ball",
        "fill_cylinder",
        "fill_wedge",
        "clear",
        "clear_region",
        "clear_bounds",
        "replace_material",
        "colors_get",
        "colors_set",
        "read_voxel",
        "read_voxels",
        "write_voxels",
        "generate",
        "smooth",
        "get_info",
      ]),
      center: z.array(z.number()).optional(),
      size: z.array(z.number()).optional(),
      region: z
        .object({ min: z.array(z.number()), max: z.array(z.number()) })
        .optional()
        .describe("World AABB for clear_region/replace_material/read_voxels/write_voxels/generate/smooth"),
      min: z.array(z.number()).optional().describe("Min corner for clear_bounds"),
      max: z.array(z.number()).optional().describe("Max corner for clear_bounds"),
      radius: z.number().optional(),
      height: z.number().optional(),
      material: z.string().optional(),
      fromMaterial: z.string().optional().describe("Source material for replace_material. Alias: sourceMaterial"),
      sourceMaterial: z.string().optional().describe("Alias for fromMaterial"),
      targetMaterial: z.string().optional().describe("Alias for material (replace_material)"),
      color: z.union([z.array(z.number()), z.string()]).optional().describe("Color for colors_set: [r,g,b] 0-255 or '#hex'"),
      position: z.array(z.number()).optional().describe("[x,y,z] for read_voxel"),
      resolution: z.number().optional().describe("Voxel resolution in studs (always 4 in Roblox; other values are rejected)"),
      materials: jsonValue.optional().describe("write_voxels: 3D array of material names [x][y][z]"),
      occupancy: jsonValue.optional().describe("write_voxels: 3D array of occupancy 0-1 [x][y][z]"),
      preset: z.enum(["mountains", "hills", "plains", "dunes", "islands", "canyon"]).optional(),
      seed: z.number().optional(),
      baseHeight: z.number().optional().describe("generate: base terrain height in studs (default 32)"),
      amplitude: z.number().optional().describe("generate: height variation in studs"),
      frequency: z.number().optional().describe("generate: noise frequency (default 0.01)"),
      octaves: z.number().optional().describe("generate: fBm octaves 1-8 (default 4)"),
      persistence: z.number().optional().describe("generate: amplitude decay per octave (default 0.5)"),
      waterLevel: z.number().optional().describe("generate: absolute water surface height"),
      materialPalette: z
        .object({ surface: z.string().optional(), cliff: z.string().optional(), shore: z.string().optional(), underwater: z.string().optional() })
        .optional(),
      intensity: z.number().optional().describe("smooth: 0-1 blend strength (default 0.5)"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_terrain",
        `
local RB, A = ...
local T = workspace.Terrain
local RES = 4
if A.resolution and A.resolution ~= 4 then error("Roblox terrain voxel resolution is always 4 studs") end
local function matOf(name, fallback)
  local n = name or fallback
  local m = Enum.Material[n]
  if not m then error("Unknown terrain material '" .. tostring(n) .. "'") end
  return m
end
local function mat() return matOf(A.targetMaterial or A.material, "Grass") end
local function vec(a)
  if typeof(a) == "Vector3" then return a end
  if a.x or a.X then return Vector3.new(a.x or a.X, a.y or a.Y, a.z or a.Z) end
  return Vector3.new(a[1], a[2], a[3])
end
local function regionOf()
  if A.region and A.region.min and A.region.max then
    return vec(A.region.min), vec(A.region.max)
  end
  if A.min and A.max then return vec(A.min), vec(A.max) end
  if A.center and A.size then
    local c, s = vec(A.center), vec(A.size)
    return c - s / 2, c + s / 2
  end
  error("Provide region {min,max}, min+max, or center+size")
end
local function region3()
  local mn, mx = regionOf()
  return Region3.new(mn, mx):ExpandToGrid(RES)
end
if A.action == "fill_block" then
  T:FillBlock(CFrame.new(vec(A.center)), vec(A.size), mat())
  RB.waypoint("terrain block")
  return { ok = true }
elseif A.action == "fill_ball" then
  T:FillBall(vec(A.center), A.radius or 10, mat())
  RB.waypoint("terrain ball")
  return { ok = true }
elseif A.action == "fill_cylinder" then
  T:FillCylinder(CFrame.new(vec(A.center)), A.height or 10, A.radius or 10, mat())
  RB.waypoint("terrain cylinder")
  return { ok = true }
elseif A.action == "fill_wedge" then
  T:FillWedge(CFrame.new(vec(A.center)), vec(A.size or { 16, 8, 16 }), mat())
  RB.waypoint("terrain wedge")
  return { ok = true }
elseif A.action == "clear_region" or A.action == "clear_bounds" then
  local mn, mx = regionOf()
  local c, s = (mn + mx) / 2, mx - mn
  T:FillBlock(CFrame.new(c), s, Enum.Material.Air)
  RB.waypoint("terrain clear")
  return { ok = true, min = RB.encode(mn), max = RB.encode(mx) }
elseif A.action == "replace_material" then
  T:ReplaceMaterial(region3(), RES, matOf(A.sourceMaterial or A.fromMaterial, "Grass"), mat())
  RB.waypoint("terrain replace")
  return { ok = true }
elseif A.action == "colors_get" then
  if A.material then
    return { material = A.material, color = RB.encode(T:GetMaterialColor(matOf(A.material))) }
  end
  local out = {}
  for _, m in ipairs(Enum.Material:GetEnumItems()) do
    local ok, c = pcall(function() return T:GetMaterialColor(m) end)
    if ok then out[m.Name] = RB.encode(c) end
  end
  return { colors = out }
elseif A.action == "colors_set" then
  if not A.material then error("colors_set requires material") end
  if not A.color then error("colors_set requires color ([r,g,b] 0-255 or '#hex')") end
  local c
  if type(A.color) == "string" then
    c = RB.toValue(A.color, "Color3", nil)
  else
    c = Color3.fromRGB(A.color[1] or 0, A.color[2] or 0, A.color[3] or 0)
  end
  T:SetMaterialColor(matOf(A.material), c)
  RB.waypoint("terrain color")
  return { material = A.material, color = RB.encode(T:GetMaterialColor(matOf(A.material))) }
elseif A.action == "read_voxel" then
  if not A.position then error("read_voxel requires position [x,y,z]") end
  local p = vec(A.position)
  local region = Region3.new(p, p + Vector3.new(RES, RES, RES)):ExpandToGrid(RES)
  local mats, occ = T:ReadVoxels(region, RES)
  return { position = RB.encode(p), material = mats[1][1][1].Name, occupancy = occ[1][1][1] }
elseif A.action == "read_voxels" then
  local region = region3()
  local s = region.Size
  local count = (s.X / RES) * (s.Y / RES) * (s.Z / RES)
  if count > 40000 then error("read_voxels region has " .. math.floor(count) .. " voxels (max 40000). Use a smaller region.") end
  local mats, occ = T:ReadVoxels(region, RES)
  local outM, outO = {}, {}
  for x = 1, mats.Size.X do
    outM[x], outO[x] = {}, {}
    for y = 1, mats.Size.Y do
      outM[x][y], outO[x][y] = {}, {}
      for z = 1, mats.Size.Z do
        outM[x][y][z] = mats[x][y][z].Name
        outO[x][y][z] = math.floor(occ[x][y][z] * 1000) / 1000
      end
    end
  end
  return { min = RB.encode(region.CFrame.Position - region.Size / 2), size = RB.encode(region.Size), resolution = RES, materials = outM, occupancy = outO }
elseif A.action == "write_voxels" then
  if type(A.materials) ~= "table" or type(A.occupancy) ~= "table" then
    error("write_voxels requires materials and occupancy 3D arrays [x][y][z]")
  end
  local region = region3()
  local sx = #A.materials
  local sy = sx > 0 and #A.materials[1] or 0
  local sz = sy > 0 and #A.materials[1][1] or 0
  local ex, ey, ez = region.Size.X / RES, region.Size.Y / RES, region.Size.Z / RES
  if sx ~= ex or sy ~= ey or sz ~= ez then
    error("write_voxels array is " .. sx .. "x" .. sy .. "x" .. sz .. " but the region needs " .. ex .. "x" .. ey .. "x" .. ez .. " voxels at resolution 4")
  end
  local mats, occ = {}, {}
  for x = 1, sx do
    mats[x], occ[x] = {}, {}
    for y = 1, sy do
      mats[x][y], occ[x][y] = {}, {}
      for z = 1, sz do
        mats[x][y][z] = matOf(A.materials[x][y][z], "Air")
        occ[x][y][z] = math.clamp(tonumber(((A.occupancy[x] or {})[y] or {})[z]) or 0, 0, 1)
      end
    end
  end
  T:WriteVoxels(region, RES, mats, occ)
  RB.waypoint("terrain write_voxels")
  return { ok = true, voxels = sx * sy * sz }
elseif A.action == "generate" then
  local presets = {
    mountains = { amplitude = 60, frequency = 0.008, octaves = 5, persistence = 0.5, surface = "Rock", cliff = "Rock", shore = "Slate", underwater = "Rock" },
    hills = { amplitude = 20, frequency = 0.01, octaves = 4, persistence = 0.5, surface = "Grass", cliff = "Rock", shore = "Sand", underwater = "Sand" },
    plains = { amplitude = 6, frequency = 0.006, octaves = 3, persistence = 0.5, surface = "Grass", cliff = "Ground", shore = "Sand", underwater = "Sand" },
    dunes = { amplitude = 12, frequency = 0.02, octaves = 2, persistence = 0.6, surface = "Sand", cliff = "Sandstone", shore = "Sand", underwater = "Sand" },
    islands = { amplitude = 30, frequency = 0.008, octaves = 4, persistence = 0.5, surface = "Grass", cliff = "Rock", shore = "Sand", underwater = "Sand", falloff = true, water = true },
    canyon = { amplitude = 40, frequency = 0.01, octaves = 4, persistence = 0.45, surface = "Sandstone", cliff = "Sandstone", shore = "Sand", underwater = "Rock", ridged = true },
  }
  local p = presets[A.preset or "hills"] or presets.hills
  local mn, mx = regionOf()
  local baseHeight = A.baseHeight or 32
  local amplitude = A.amplitude or p.amplitude
  local frequency = A.frequency or p.frequency
  local octaves = math.clamp(A.octaves or p.octaves, 1, 8)
  local persistence = A.persistence or p.persistence
  local seed = A.seed or 1337
  local pal = A.materialPalette or {}
  local surfaceM = matOf(pal.surface or p.surface)
  local cliffM = matOf(pal.cliff or p.cliff)
  local shoreM = matOf(pal.shore or p.shore)
  local underM = matOf(pal.underwater or p.underwater)
  local waterLevel = A.waterLevel or (p.water and (baseHeight - 4) or nil)
  local region = Region3.new(mn, mx):ExpandToGrid(RES)
  local origin = region.CFrame.Position - region.Size / 2
  local nx = region.Size.X / RES
  local ny = region.Size.Y / RES
  local nz = region.Size.Z / RES
  if nx * ny * nz > 1000000 then
    error("generate region has " .. math.floor(nx * ny * nz) .. " voxels (max 1000000). Shrink the region or lower its height.")
  end
  local cx, cz = (mn.X + mx.X) / 2, (mn.Z + mx.Z) / 2
  local halfX, halfZ = (mx.X - mn.X) / 2, (mx.Z - mn.Z) / 2
  local function fbm(wx, wz)
    local amp, f, sum, norm = 1, frequency, 0, 0
    for o = 1, octaves do
      local n = math.noise(wx * f + seed * 17.17, wz * f - seed * 31.3, seed + o * 101.7)
      if p.ridged then n = 1 - 2 * math.abs(n) end
      sum += n * amp
      norm += amp
      amp *= persistence
      f *= 2
    end
    return sum / norm
  end
  local heights = {}
  for x = 1, nx do
    heights[x] = {}
    for z = 1, nz do
      local wx = origin.X + (x - 0.5) * RES
      local wz = origin.Z + (z - 0.5) * RES
      local h = baseHeight + fbm(wx, wz) * amplitude
      if p.falloff then
        local dx = math.abs(wx - cx) / math.max(halfX, 1)
        local dz = math.abs(wz - cz) / math.max(halfZ, 1)
        local d = math.min(math.sqrt(dx * dx + dz * dz), 1)
        h = (h - mn.Y) * (1 - d * d) + mn.Y
      end
      heights[x][z] = h
    end
  end
  local mats, occ = {}, {}
  for x = 1, nx do
    mats[x], occ[x] = {}, {}
    for y = 1, ny do
      mats[x][y], occ[x][y] = {}, {}
    end
  end
  for x = 1, nx do
    for z = 1, nz do
      local h = heights[x][z]
      local hl = heights[math.max(x - 1, 1)][z]
      local hr = heights[math.min(x + 1, nx)][z]
      local hd = heights[x][math.max(z - 1, 1)]
      local hu = heights[x][math.min(z + 1, nz)]
      local slope = math.max(math.abs(hr - hl), math.abs(hu - hd)) / (2 * RES)
      local steep = slope > 1
      for y = 1, ny do
        local vBottom = origin.Y + (y - 1) * RES
        local vTop = vBottom + RES
        local m, o = Enum.Material.Air, 0
        if vTop <= h then
          o = 1
          local depth = h - vTop
          if depth < RES then
            m = steep and cliffM or surfaceM
            if waterLevel and h <= waterLevel + 2 then m = shoreM end
            if waterLevel and h < waterLevel - 2 then m = underM end
          else
            m = Enum.Material.Ground
          end
        elseif vBottom < h then
          o = (h - vBottom) / RES
          m = steep and cliffM or surfaceM
          if waterLevel and h <= waterLevel + 2 then m = shoreM end
          if waterLevel and h < waterLevel - 2 then m = underM end
        elseif waterLevel and vBottom < waterLevel then
          o = math.min((waterLevel - vBottom) / RES, 1)
          m = Enum.Material.Water
        end
        mats[x][y][z] = m
        occ[x][y][z] = o
      end
    end
  end
  T:WriteVoxels(region, RES, mats, occ)
  RB.waypoint("terrain generate " .. (A.preset or "hills"))
  return { ok = true, preset = A.preset or "hills", voxels = nx * ny * nz, columns = nx * nz, baseHeight = baseHeight, amplitude = amplitude, waterLevel = waterLevel }
elseif A.action == "smooth" then
  local region = region3()
  local s = region.Size
  local count = (s.X / RES) * (s.Y / RES) * (s.Z / RES)
  if count > 200000 then error("smooth region has " .. math.floor(count) .. " voxels (max 200000). Use a smaller region.") end
  local intensity = math.clamp(A.intensity or 0.5, 0, 1)
  local mats, occ = T:ReadVoxels(region, RES)
  local nx, ny, nz = occ.Size.X, occ.Size.Y, occ.Size.Z
  local out = {}
  for x = 1, nx do
    out[x] = {}
    for y = 1, ny do
      out[x][y] = {}
      for z = 1, nz do
        local sum, n = 0, 0
        for dx = -1, 1 do
          for dy = -1, 1 do
            for dz = -1, 1 do
              local xx, yy, zz = x + dx, y + dy, z + dz
              if xx >= 1 and xx <= nx and yy >= 1 and yy <= ny and zz >= 1 and zz <= nz then
                sum += occ[xx][yy][zz]
                n += 1
              end
            end
          end
        end
        local blurred = sum / n
        local v = occ[x][y][z] * (1 - intensity) + blurred * intensity
        out[x][y][z] = v
        if v > 0 and mats[x][y][z] == Enum.Material.Air then
          mats[x][y][z] = Enum.Material.Ground
        elseif v <= 0.02 then
          out[x][y][z] = 0
          mats[x][y][z] = Enum.Material.Air
        end
      end
    end
  end
  T:WriteVoxels(region, RES, mats, out)
  RB.waypoint("terrain smooth")
  return { ok = true, voxels = nx * ny * nz, intensity = intensity }
elseif A.action == "clear" then
  T:Clear()
  RB.waypoint("terrain clear")
  return { ok = true }
elseif A.action == "get_info" then
  local region = T.MaxExtents
  return { maxExtents = tostring(region), waterWaveSize = T.WaterWaveSize, waterColor = RB.encode(T.WaterColor) }
end
error("Unknown action: " .. tostring(A.action))
`,
        args,
        120_000
      )
  );

  defineTool(
    ctx,
    "spatial_query",
    "Spatial queries in workspace. Actions: raycast (filterList/filterType/ignoreWater), multi_raycast (rays[], max 50), in_radius, in_box, ground_height/find_ground (position or x/z), check_placement (is a box placeable at position), scan_area (heightmap grid), find_flat (flat build spots), find_spawn (clear spawn positions), analyze_walkable (walkability grid), spatial_map (all BasePart/Model positions), find_space (empty spot for a box), bounds (one path or paths[]), snap_grid (snap an instance pivot to a grid), collision. Areas: searchArea/area/region are {min:[x,y,z], max:[x,y,z]}.",
    {
      action: z.enum([
        "raycast",
        "multi_raycast",
        "in_radius",
        "in_box",
        "ground_height",
        "find_ground",
        "check_placement",
        "scan_area",
        "find_flat",
        "find_spawn",
        "analyze_walkable",
        "spatial_map",
        "find_space",
        "bounds",
        "snap_grid",
        "collision",
      ]),
      path: z.string().optional().describe("Instance path for bounds / collision / snap_grid / spatial_map root. Alias: rootPath"),
      rootPath: z.string().optional().describe("Alias for path (spatial_map)"),
      paths: z.array(z.string()).optional().describe("Multiple paths for bounds"),
      otherPath: z.string().optional().describe("Second instance for collision"),
      origin: z.array(z.number()).optional(),
      direction: z.array(z.number()).optional(),
      rays: z
        .array(z.object({ origin: z.array(z.number()), direction: z.array(z.number()) }))
        .optional()
        .describe("Ray list for multi_raycast (max 50)"),
      center: z.array(z.number()).optional(),
      position: z.array(z.number()).optional().describe("[x,y,z] for find_ground / check_placement / collision / find_space result bias"),
      radius: z.number().optional(),
      size: z.array(z.number()).optional().describe("[x,y,z] box size for in_box / check_placement / find_space / scan_area (x,z used)"),
      rotation: z.array(z.number()).optional().describe("[rx,ry,rz] degrees for check_placement"),
      searchArea: z
        .object({ min: z.array(z.number()), max: z.array(z.number()) })
        .optional()
        .describe("World AABB for find_flat / find_spawn / find_space / analyze_walkable. Alias: area"),
      area: z.object({ min: z.array(z.number()), max: z.array(z.number()) }).optional().describe("Alias for searchArea"),
      filterList: z.array(z.string()).optional().describe("Instance paths to exclude/include in raycasts. Alias: filterInstances"),
      filterInstances: z.array(z.string()).optional().describe("Alias for filterList"),
      filterType: z.enum(["Exclude", "Include"]).optional().describe("Raycast filter type (default Exclude)"),
      ignoreWater: z.boolean().optional(),
      checkGround: z.boolean().optional().describe("check_placement: also require ground support (default true)"),
      resolution: z.number().optional().describe("Grid resolution in studs for scan_area/analyze_walkable/find_flat (default 4)"),
      maxDistance: z.number().optional().describe("find_ground max cast distance (default 1000)"),
      offset: z.number().optional().describe("find_ground vertical offset added to result (default 0)"),
      maxSlope: z.number().optional().describe("Max slope degrees for find_flat (default 10) / analyze_walkable (default 45)"),
      tolerance: z.number().optional().describe("find_flat height variation tolerance in studs (default 2)"),
      minSize: z.array(z.number()).optional().describe("find_flat minimum flat area size [x,z] (default [8,8])"),
      spawnSize: z.array(z.number()).optional().describe("find_spawn entity size (default [4,5,4])"),
      minSpacing: z.number().optional().describe("find_spawn min distance between results (default 10)"),
      preferOutdoor: z.boolean().optional().describe("find_spawn: require open sky (default false)"),
      count: z.number().optional().describe("find_spawn result count (default 10)"),
      characterHeight: z.number().optional().describe("analyze_walkable clearance height (default 5)"),
      maxStepHeight: z.number().optional().describe("analyze_walkable max step between cells (default 2)"),
      includeModels: z.boolean().optional().describe("spatial_map: include Model bounding boxes (default true)"),
      gridSize: z.number().optional().describe("snap_grid / find_space grid size (default 4). Alias: gridSnap"),
      gridSnap: z.number().optional().describe("Alias for gridSize"),
      axes: z.array(z.enum(["x", "y", "z"])).optional().describe("snap_grid axes (default all)"),
      padding: z.number().optional().describe("find_space clearance around the box (default 1)"),
      x: z.number().optional(),
      z: z.number().optional(),
      maxResults: z.number().optional(),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "spatial_query",
        `
local RB, A = ...
local function vec(a)
  if typeof(a) == "Vector3" then return a end
  if a.x or a.X then return Vector3.new(a.x or a.X or 0, a.y or a.Y or 0, a.z or a.Z or 0) end
  return Vector3.new(a[1], a[2], a[3])
end
local function areaOf()
  local sa = A.searchArea or A.area or A.region
  if sa and sa.min and sa.max then return vec(sa.min), vec(sa.max) end
  if A.center and A.size then
    local c, s = vec(A.center), vec(A.size)
    return c - s / 2, c + s / 2
  end
  error("Provide searchArea/area {min=[x,y,z], max=[x,y,z]} or center+size")
end
local function rayParams()
  local params = RaycastParams.new()
  local list = A.filterList or A.filterInstances
  if list and #list > 0 then
    local insts = {}
    for _, p in ipairs(list) do table.insert(insts, RB.resolve(p)) end
    params.FilterDescendantsInstances = insts
    params.FilterType = Enum.RaycastFilterType[A.filterType or "Exclude"]
  end
  if A.ignoreWater then params.IgnoreWater = true end
  return params
end
local function castDown(x, y, z, dist, params)
  return workspace:Raycast(Vector3.new(x, y, z), Vector3.new(0, -(dist or 2000), 0), params or rayParams())
end
local function hitInfo(r)
  if not r then return { hit = false } end
  return { hit = true, instance = r.Instance:GetFullName(), position = RB.encode(r.Position), normal = RB.encode(r.Normal), material = tostring(r.Material), distance = r.Distance }
end
local function boundsOf(inst)
  if inst:IsA("Model") then
    return inst:GetBoundingBox()
  elseif inst:IsA("BasePart") then
    return inst.CFrame, inst.Size
  end
  error(inst:GetFullName() .. " is not a Model or BasePart")
end
if A.action == "raycast" then
  return hitInfo(workspace:Raycast(vec(A.origin), vec(A.direction), rayParams()))
elseif A.action == "multi_raycast" then
  if not A.rays or #A.rays == 0 then error("multi_raycast requires rays[] of {origin, direction}") end
  if #A.rays > 50 then error("multi_raycast supports at most 50 rays, got " .. #A.rays) end
  local params = rayParams()
  local out = {}
  for _, ray in ipairs(A.rays) do
    table.insert(out, hitInfo(workspace:Raycast(vec(ray.origin), vec(ray.direction), params)))
  end
  return { items = out, count = #out }
elseif A.action == "in_radius" then
  local parts = workspace:GetPartBoundsInRadius(vec(A.center), A.radius or 10)
  local out = {}
  for i, p in ipairs(parts) do
    if i > (A.maxResults or 50) then break end
    table.insert(out, { path = p:GetFullName(), position = RB.encode(p.Position) })
  end
  return { count = #parts, items = out }
elseif A.action == "in_box" then
  local parts = workspace:GetPartBoundsInBox(CFrame.new(vec(A.center)), vec(A.size))
  local out = {}
  for i, p in ipairs(parts) do
    if i > (A.maxResults or 50) then break end
    table.insert(out, { path = p:GetFullName(), position = RB.encode(p.Position) })
  end
  return { count = #parts, items = out }
elseif A.action == "ground_height" or A.action == "find_ground" then
  local px, py, pz
  if A.position then
    local p = vec(A.position)
    px, py, pz = p.X, p.Y, p.Z
  else
    px, py, pz = A.x or 0, 10000, A.z or 0
  end
  local r = castDown(px, py, pz, A.maxDistance or (A.position and 1000 or 20000))
  if not r then return { hit = false } end
  return { hit = true, height = r.Position.Y + (A.offset or 0), position = RB.encode(r.Position), instance = r.Instance:GetFullName(), material = tostring(r.Material), normal = RB.encode(r.Normal) }
elseif A.action == "check_placement" then
  if not A.position or not A.size then error("check_placement requires position and size") end
  local pos, size = vec(A.position), vec(A.size)
  local rot = A.rotation and CFrame.Angles(math.rad(A.rotation[1] or 0), math.rad(A.rotation[2] or 0), math.rad(A.rotation[3] or 0)) or CFrame.new()
  local cf = CFrame.new(pos) * rot
  local overlap = OverlapParams.new()
  local list = A.filterList or A.filterInstances
  if list and #list > 0 then
    local insts = {}
    for _, p in ipairs(list) do table.insert(insts, RB.resolve(p)) end
    overlap.FilterDescendantsInstances = insts
    overlap.FilterType = Enum.RaycastFilterType[A.filterType or "Exclude"]
  end
  local parts = workspace:GetPartBoundsInBox(cf, size, overlap)
  local blockers = {}
  for i, p in ipairs(parts) do
    if p ~= workspace.Terrain then
      table.insert(blockers, p:GetFullName())
      if #blockers >= 10 then break end
    end
  end
  local ground = nil
  if A.checkGround ~= false then
    local r = castDown(pos.X, pos.Y - size.Y / 2 + 0.1, pos.Z, 50)
    ground = r and { supported = (r.Position.Y >= pos.Y - size.Y / 2 - 4), height = r.Position.Y, instance = r.Instance:GetFullName() } or { supported = false }
  end
  local canPlace = #blockers == 0 and (ground == nil or ground.supported)
  return { canPlace = canPlace, blockers = blockers, ground = ground, position = RB.encode(pos), size = RB.encode(size) }
elseif A.action == "scan_area" then
  if not A.center or not A.size then error("scan_area requires center and size ([x,_,z] used)") end
  local c, s = vec(A.center), vec(A.size)
  local res = math.max(A.resolution or 4, 1)
  local maxResults = A.maxResults or 500
  local top = c.Y + math.max(s.Y / 2, 50)
  local params = rayParams()
  local grid = {}
  local x = c.X - s.X / 2
  while x <= c.X + s.X / 2 and #grid < maxResults do
    local z = c.Z - s.Z / 2
    while z <= c.Z + s.Z / 2 and #grid < maxResults do
      local r = castDown(x, top, z, s.Y + 200, params)
      table.insert(grid, r and { x = x, z = z, y = r.Position.Y, material = tostring(r.Material) } or { x = x, z = z, y = nil })
      z += res
    end
    x += res
  end
  return { cells = grid, resolution = res, truncated = #grid >= maxResults }
elseif A.action == "find_flat" then
  local mn, mx = areaOf()
  local res = math.max(A.resolution or 4, 1)
  local maxSlope = A.maxSlope or 10
  local tolerance = A.tolerance or 2
  local minSize = A.minSize or { 8, 8 }
  local winX = math.max(math.ceil((minSize[1] or 8) / res), 1)
  local winZ = math.max(math.ceil((minSize[2] or minSize[1] or 8) / res), 1)
  local nx = math.min(math.floor((mx.X - mn.X) / res) + 1, 80)
  local nz = math.min(math.floor((mx.Z - mn.Z) / res) + 1, 80)
  local params = rayParams()
  local h = {}
  for i = 1, nx do
    h[i] = {}
    for j = 1, nz do
      local r = castDown(mn.X + (i - 1) * res, mx.Y + 50, mn.Z + (j - 1) * res, (mx.Y - mn.Y) + 200, params)
      h[i][j] = r and r.Position.Y or nil
    end
  end
  local found = {}
  for i = 1, nx - winX + 1 do
    for j = 1, nz - winZ + 1 do
      local lo, hi, okCell = math.huge, -math.huge, true
      for a = i, i + winX - 1 do
        for b = j, j + winZ - 1 do
          local v = h[a][b]
          if not v then okCell = false break end
          lo = math.min(lo, v)
          hi = math.max(hi, v)
        end
        if not okCell then break end
      end
      if okCell and (hi - lo) <= tolerance then
        local slopeDeg = math.deg(math.atan((hi - lo) / math.max(winX, winZ) / res))
        if slopeDeg <= maxSlope then
          table.insert(found, {
            center = { mn.X + (i - 1 + (winX - 1) / 2) * res, (lo + hi) / 2, mn.Z + (j - 1 + (winZ - 1) / 2) * res },
            size = { winX * res, winZ * res },
            height = (lo + hi) / 2,
            heightRange = hi - lo,
          })
        end
      end
    end
  end
  table.sort(found, function(a, b) return a.heightRange < b.heightRange end)
  local out = {}
  for i = 1, math.min(#found, A.maxResults or 10) do table.insert(out, found[i]) end
  return { items = out, scanned = nx * nz, resolution = res }
elseif A.action == "find_spawn" then
  local mn, mx = areaOf()
  local ss = A.spawnSize and vec(A.spawnSize) or Vector3.new(4, 5, 4)
  local minSpacing = A.minSpacing or 10
  local want = math.clamp(A.count or 10, 1, 50)
  local params = rayParams()
  local accepted = {}
  local res = math.max(minSpacing / 2, 4)
  local x = mn.X
  while x <= mx.X and #accepted < want do
    local z = mn.Z
    while z <= mx.Z and #accepted < want do
      local r = castDown(x, mx.Y + 50, z, (mx.Y - mn.Y) + 200, params)
      if r and tostring(r.Material) ~= "Enum.Material.Water" then
        local pos = r.Position + Vector3.new(0, ss.Y / 2 + 0.5, 0)
        local tooClose = false
        for _, a in ipairs(accepted) do
          if (Vector3.new(a.position[1], a.position[2], a.position[3]) - pos).Magnitude < minSpacing then tooClose = true break end
        end
        if not tooClose then
          local blocked = #workspace:GetPartBoundsInBox(CFrame.new(pos), ss) > 0
          local skyOk = true
          if A.preferOutdoor then
            skyOk = workspace:Raycast(pos, Vector3.new(0, 500, 0), params) == nil
          end
          if not blocked and skyOk then
            table.insert(accepted, { position = { pos.X, pos.Y, pos.Z }, groundHeight = r.Position.Y, material = tostring(r.Material) })
          end
        end
      end
      z += res
    end
    x += res
  end
  return { items = accepted, count = #accepted }
elseif A.action == "analyze_walkable" then
  local mn, mx = areaOf()
  local res = math.max(A.resolution or 4, 1)
  local maxSlope = A.maxSlope or 45
  local charH = A.characterHeight or 5
  local maxStep = A.maxStepHeight or 2
  local nx = math.min(math.floor((mx.X - mn.X) / res) + 1, 50)
  local nz = math.min(math.floor((mx.Z - mn.Z) / res) + 1, 50)
  local params = rayParams()
  local heights, normals = {}, {}
  for i = 1, nx do
    heights[i], normals[i] = {}, {}
    for j = 1, nz do
      local r = castDown(mn.X + (i - 1) * res, mx.Y + 50, mn.Z + (j - 1) * res, (mx.Y - mn.Y) + 200, params)
      heights[i][j] = r and r.Position.Y or nil
      normals[i][j] = r and r.Normal or nil
    end
  end
  local cells, walkableCount = {}, 0
  for i = 1, nx do
    for j = 1, nz do
      local hij = heights[i][j]
      local walkable = false
      local reason = "no_ground"
      if hij then
        local slope = normals[i][j] and math.deg(math.acos(math.clamp(normals[i][j]:Dot(Vector3.yAxis), -1, 1))) or 90
        if slope > maxSlope then
          reason = "too_steep"
        else
          local stepOk = true
          for _, d in ipairs({ { i - 1, j }, { i + 1, j }, { i, j - 1 }, { i, j + 1 } }) do
            local nh = heights[d[1]] and heights[d[1]][d[2]]
            if nh and math.abs(nh - hij) > maxStep then stepOk = false break end
          end
          if not stepOk then
            reason = "step_too_high"
          else
            local pos = Vector3.new(mn.X + (i - 1) * res, hij + charH / 2 + 0.2, mn.Z + (j - 1) * res)
            if #workspace:GetPartBoundsInBox(CFrame.new(pos), Vector3.new(res * 0.9, charH, res * 0.9)) > 0 then
              reason = "blocked"
            else
              walkable = true
              reason = nil
              walkableCount += 1
            end
          end
        end
      end
      table.insert(cells, { x = mn.X + (i - 1) * res, z = mn.Z + (j - 1) * res, y = hij, walkable = walkable, reason = reason })
    end
  end
  return { cells = cells, walkableCount = walkableCount, totalCells = #cells, walkableFraction = #cells > 0 and walkableCount / #cells or 0, resolution = res }
elseif A.action == "spatial_map" then
  local root = RB.resolve(A.rootPath or A.path or "game.Workspace")
  local includeModels = A.includeModels ~= false
  local maxResults = A.maxResults or 500
  local out = {}
  for _, inst in ipairs(root:GetDescendants()) do
    if #out >= maxResults then break end
    if inst:IsA("BasePart") and inst ~= workspace.Terrain then
      table.insert(out, { path = inst:GetFullName(), className = inst.ClassName, position = RB.encode(inst.Position), size = RB.encode(inst.Size) })
    elseif includeModels and inst:IsA("Model") then
      local okB, cf, size = pcall(function() return inst:GetBoundingBox() end)
      if okB and cf then
        table.insert(out, { path = inst:GetFullName(), className = "Model", position = RB.encode(cf.Position), size = RB.encode(size) })
      end
    end
  end
  return { items = out, truncated = #out >= maxResults }
elseif A.action == "find_space" then
  if not A.size then error("find_space requires size [x,y,z]") end
  local mn, mx = areaOf()
  local size = vec(A.size)
  local pad = A.padding or 1
  local grid = A.gridSize or A.gridSnap or 4
  local checkSize = size + Vector3.new(pad * 2, 0, pad * 2)
  local params = rayParams()
  local found = {}
  local x = mn.X + size.X / 2
  while x <= mx.X - size.X / 2 and #found < 5 do
    local z = mn.Z + size.Z / 2
    while z <= mx.Z - size.Z / 2 and #found < 5 do
      local gx = math.floor(x / grid + 0.5) * grid
      local gz = math.floor(z / grid + 0.5) * grid
      local r = castDown(gx, mx.Y + 50, gz, (mx.Y - mn.Y) + 200, params)
      if r then
        local pos = r.Position + Vector3.new(0, size.Y / 2 + 0.1, 0)
        if #workspace:GetPartBoundsInBox(CFrame.new(pos), checkSize) == 0 then
          table.insert(found, { position = { pos.X, pos.Y, pos.Z }, groundHeight = r.Position.Y })
        end
      end
      z += math.max(grid, size.Z)
    end
    x += math.max(grid, size.X)
  end
  if #found == 0 then
    return { items = {}, found = false, note = "No clear spot for that size in the search area. Widen searchArea or shrink size/padding." }
  end
  return { items = found, found = true }
elseif A.action == "bounds" then
  if A.paths and #A.paths > 0 then
    local out = {}
    for _, p in ipairs(A.paths) do
      local inst = RB.resolve(p)
      local cf, size = boundsOf(inst)
      table.insert(out, { path = inst:GetFullName(), cframe = RB.encode(cf), size = RB.encode(size), position = RB.encode(cf.Position) })
    end
    return { items = out }
  end
  local inst = RB.resolve(A.path)
  local cf, size = boundsOf(inst)
  return { path = inst:GetFullName(), cframe = RB.encode(cf), size = RB.encode(size), position = RB.encode(cf.Position) }
elseif A.action == "snap_grid" then
  local inst = RB.resolve(A.path)
  if not inst:IsA("PVInstance") then error("snap_grid requires a Model or BasePart") end
  local grid = A.gridSize or A.gridSnap or 4
  local axes = {}
  for _, a in ipairs(A.axes or { "x", "y", "z" }) do axes[string.lower(a)] = true end
  local pivot = inst:GetPivot()
  local p = pivot.Position
  local snapped = Vector3.new(
    axes.x and math.floor(p.X / grid + 0.5) * grid or p.X,
    axes.y and math.floor(p.Y / grid + 0.5) * grid or p.Y,
    axes.z and math.floor(p.Z / grid + 0.5) * grid or p.Z
  )
  inst:PivotTo(pivot - p + snapped)
  RB.waypoint("snap_grid")
  return { path = inst:GetFullName(), before = RB.encode(p), after = RB.encode(snapped), gridSize = grid }
elseif A.action == "collision" then
  local a = RB.resolve(A.path)
  if A.position then
    local cf, size = boundsOf(a)
    local pos = vec(A.position)
    local overlap = OverlapParams.new()
    local ignore = { a }
    for _, p in ipairs(A.paths or {}) do table.insert(ignore, RB.resolve(p)) end
    overlap.FilterDescendantsInstances = ignore
    overlap.FilterType = Enum.RaycastFilterType.Exclude
    local parts = workspace:GetPartBoundsInBox(CFrame.new(pos) * (cf - cf.Position), size, overlap)
    local out = {}
    for i, p in ipairs(parts) do
      if i > (A.maxResults or 50) then break end
      table.insert(out, p:GetFullName())
    end
    return { hit = #parts > 0, count = #parts, items = out, hypotheticalPosition = RB.encode(pos) }
  end
  if A.otherPath then
    local b = RB.resolve(A.otherPath)
    if a:IsA("BasePart") and b:IsA("BasePart") then
      local parts = workspace:GetPartsInPart(a)
      local hit = false
      for _, p in ipairs(parts) do if p == b then hit = true break end end
      return { hit = hit, a = a:GetFullName(), b = b:GetFullName() }
    end
    error("collision with otherPath requires two BaseParts")
  end
  if not a:IsA("BasePart") then error("collision requires a BasePart path") end
  local parts = workspace:GetPartsInPart(a)
  local out = {}
  for i, p in ipairs(parts) do
    if i > (A.maxResults or 50) then break end
    table.insert(out, p:GetFullName())
  end
  return { count = #parts, items = out }
end
error("Unknown action: " .. tostring(A.action))
`,
        args,
        60_000
      )
  );
}
