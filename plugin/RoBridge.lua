--!nocheck
-- RoBridge Studio Plugin
-- Long-polls the local RoBridge server (http://127.0.0.1:3737) for Luau jobs,
-- executes them at plugin security level, and posts results back.

local VERSION = "0.1.8"

local HttpService = game:GetService("HttpService")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local LogService = game:GetService("LogService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

if not RunService:IsStudio() then
	return
end

-- Play/Run DataModels also load local plugins. loadstring is unavailable
-- there, and this instance would steal Edit jobs and spam Output. Play
-- jobs belong to the injected s0/c1 agents, not this plugin.
if RunService:IsRunning() or not RunService:IsEdit() then
	return
end

local HOST = plugin:GetSetting("RoBridgeHost") or "127.0.0.1"
local PORT = plugin:GetSetting("RoBridgePort") or 3737
local BASE_URL = ("http://%s:%d"):format(HOST, PORT)
local SESSION_ID = HttpService:GenerateGUID(false)

--------------------------------------------------------------------
-- RB helper library (passed to every job as the first vararg)
--------------------------------------------------------------------
local RB = {}
RB.plugin = plugin
RB.state = {} -- scratch space shared across jobs (tweens, tracks, ...)
RB.state.recording = false

function RB.beginRecording()
	RB.state.recording = true
	return true
end

function RB.stopRecording()
	RB.state.recording = false
	return { stopped = true }
end

function RB.isRecording()
	return RB.state.recording == true
end
RB.logBuffer = {}

-- Lazy unique IDs (Lemonade-style). Stamped only when RoBridge touches
-- an instance — never a full DataModel walk on connect.
local RB_ID_ATTR = "RBId"
local RB_ID_TAG = "RBId"
local GUID_PATTERN = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local idIndex = {}

RB.ID_ATTR = RB_ID_ATTR

local function looksLikeId(s)
	return type(s) == "string" and string.match(s, GUID_PATTERN) ~= nil
end

local function underService(inst, name)
	local ok, svc = pcall(game.GetService, game, name)
	return ok and svc and (inst == svc or inst:IsDescendantOf(svc))
end

function RB.canStamp(inst)
	if typeof(inst) ~= "Instance" or inst == game or inst.Parent == game then
		return false
	end
	if inst:IsA("Terrain") or inst:IsA("Camera") then
		return false
	end
	local okLock, locked = pcall(function()
		return inst.RobloxLocked
	end)
	if okLock and locked then
		return false
	end
	if underService(inst, "CoreGui") or underService(inst, "PluginGuiService") or underService(inst, "CorePackages") then
		return false
	end
	if inst:IsA("PluginGui") then
		return false
	end
	return true
end

function RB.findById(id)
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local cached = idIndex[id]
	if cached then
		local ok, val = pcall(function()
			return cached.Parent and cached:GetAttribute(RB_ID_ATTR)
		end)
		if ok and val == id then
			return cached
		end
		idIndex[id] = nil
	end
	local okTagged, tagged = pcall(function()
		return CollectionService:GetTagged(RB_ID_TAG)
	end)
	if okTagged then
		for _, inst in ipairs(tagged) do
			local ok, val = pcall(function()
				return inst:GetAttribute(RB_ID_ATTR)
			end)
			if ok and val == id then
				idIndex[id] = inst
				return inst
			end
		end
	end
	local okDesc, descendants = pcall(function()
		return game:GetDescendants()
	end)
	if okDesc then
		for _, inst in ipairs(descendants) do
			local ok, val = pcall(function()
				return inst:GetAttribute(RB_ID_ATTR)
			end)
			if ok and val == id then
				idIndex[id] = inst
				pcall(function()
					CollectionService:AddTag(inst, RB_ID_TAG)
				end)
				return inst
			end
		end
	end
	return nil
end

local function otherOwner(id, inst)
	local cached = idIndex[id]
	if cached and cached ~= inst then
		local ok, val = pcall(function()
			return cached.Parent and cached:GetAttribute(RB_ID_ATTR)
		end)
		if ok and val == id then
			return cached
		end
		idIndex[id] = nil
	end
	local okTagged, tagged = pcall(function()
		return CollectionService:GetTagged(RB_ID_TAG)
	end)
	if okTagged then
		for _, other in ipairs(tagged) do
			if other ~= inst then
				local ok, val = pcall(function()
					return other:GetAttribute(RB_ID_ATTR)
				end)
				if ok and val == id then
					idIndex[id] = other
					return other
				end
			end
		end
	end
	return nil
end

function RB.ensureId(inst)
	if not RB.canStamp(inst) then
		return nil
	end
	local okGet, existing = pcall(function()
		return inst:GetAttribute(RB_ID_ATTR)
	end)
	if okGet and type(existing) == "string" and existing ~= "" and not otherOwner(existing, inst) then
		idIndex[existing] = inst
		pcall(function()
			CollectionService:AddTag(inst, RB_ID_TAG)
		end)
		return existing
	end
	local id = HttpService:GenerateGUID(false)
	local okSet = pcall(function()
		inst:SetAttribute(RB_ID_ATTR, id)
		CollectionService:AddTag(inst, RB_ID_TAG)
	end)
	if not okSet then
		return nil
	end
	idIndex[id] = inst
	return id
end

function RB.stripIds()
	local stripped = 0
	local function stripOne(inst)
		local okAttr, val = pcall(function()
			return inst:GetAttribute(RB_ID_ATTR)
		end)
		if okAttr and val ~= nil then
			pcall(function()
				inst:SetAttribute(RB_ID_ATTR, nil)
			end)
			stripped += 1
		end
		pcall(function()
			if CollectionService:HasTag(inst, RB_ID_TAG) then
				CollectionService:RemoveTag(inst, RB_ID_TAG)
			end
		end)
	end
	local okTagged, tagged = pcall(function()
		return CollectionService:GetTagged(RB_ID_TAG)
	end)
	if okTagged then
		for _, inst in ipairs(tagged) do
			stripOne(inst)
		end
	end
	local okDesc, descendants = pcall(function()
		return game:GetDescendants()
	end)
	if okDesc then
		for _, inst in ipairs(descendants) do
			local ok, val = pcall(function()
				return inst:GetAttribute(RB_ID_ATTR)
			end)
			if ok and val ~= nil then
				stripOne(inst)
			end
		end
	end
	idIndex = {}
	return { stripped = stripped }
end

local function resolvePath(path)
	if path == nil or path == "" or path == "game" then
		return game
	end
	local s = tostring(path):gsub("^game[%./]", "")
	local cur = game
	for token in s:gmatch("[^%./]+") do
		local nxt = cur:FindFirstChild(token)
		if not nxt and cur == game then
			local ok, svc = pcall(game.GetService, game, token)
			if ok and svc then
				nxt = svc
			end
		end
		if not nxt then
			error(("Instance not found: '%s' (in path '%s')"):format(token, tostring(path)), 0)
		end
		cur = nxt
	end
	return cur
end

-- path: existing dotted/slashed path, an RBId GUID, or { path, rbId/id }.
-- id: optional RBId. Preferred when both path and id are present.
function RB.resolve(path, id)
	if type(path) == "table" then
		id = id or path.rbId or path.id
		path = path.path
	end
	if id == nil and looksLikeId(path) then
		id = path
		path = nil
	end
	if type(id) == "string" and id ~= "" then
		local inst = RB.findById(id)
		if inst then
			return inst
		end
		if path == nil or path == "" then
			error(("Instance not found for RBId '%s'"):format(id), 0)
		end
	end
	local cur = resolvePath(path)
	RB.ensureId(cur)
	return cur
end

function RB.encode(v, depth)
	depth = depth or 0
	if depth > 8 then
		return tostring(v)
	end
	local t = typeof(v)
	if t == "nil" or t == "boolean" or t == "string" then
		return v
	elseif t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then
			return tostring(v)
		end
		return v
	elseif t == "Vector3" then
		return { __t = "Vector3", x = v.X, y = v.Y, z = v.Z }
	elseif t == "Vector2" then
		return { __t = "Vector2", x = v.X, y = v.Y }
	elseif t == "CFrame" then
		local lv = v.LookVector
		return { __t = "CFrame", position = { v.X, v.Y, v.Z }, lookVector = { lv.X, lv.Y, lv.Z } }
	elseif t == "Color3" then
		return { __t = "Color3", hex = "#" .. v:ToHex() }
	elseif t == "UDim2" then
		return { __t = "UDim2", v = { v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset } }
	elseif t == "UDim" then
		return { __t = "UDim", v = { v.Scale, v.Offset } }
	elseif t == "EnumItem" or t == "BrickColor" or t == "NumberSequence" or t == "ColorSequence" or t == "NumberRange" or t == "Rect" or t == "Ray" then
		return tostring(v)
	elseif t == "Instance" then
		return v:GetFullName()
	elseif t == "table" then
		local out = {}
		local n = 0
		for k, val in pairs(v) do
			n += 1
			if n > 500 then
				out.__truncated = true
				break
			end
			local key = (type(k) == "number") and k or tostring(k)
			out[key] = RB.encode(val, depth + 1)
		end
		return out
	end
	return tostring(v)
end

-- Convert a JSON value into a Luau value suitable for the target type `t`
-- (typeof of the current property value). `cur` is the current value (for enums).
function RB.toValue(v, t, cur)
	local vt = type(v)
	if vt == "table" and v.__t then
		local tt = v.__t
		if tt == "Vector3" then
			return Vector3.new(v.x or v.v[1], v.y or v.v[2], v.z or v.v[3])
		elseif tt == "Vector2" then
			return Vector2.new(v.x or v.v[1], v.y or v.v[2])
		elseif tt == "Color3" then
			return Color3.fromHex(v.hex)
		elseif tt == "UDim2" then
			return UDim2.new(v.v[1], v.v[2], v.v[3], v.v[4])
		elseif tt == "UDim" then
			return UDim.new(v.v[1], v.v[2])
		elseif tt == "CFrame" then
			if v.position and v.lookAt then
				return CFrame.lookAt(Vector3.new(unpack(v.position)), Vector3.new(unpack(v.lookAt)))
			end
			return CFrame.new(unpack(v.position or v.v))
		elseif tt == "Instance" then
			return RB.resolve(v.path)
		end
	end
	if t == "Vector3" and vt == "table" then
		return Vector3.new(v[1], v[2], v[3])
	elseif t == "Vector2" and vt == "table" then
		return Vector2.new(v[1], v[2])
	elseif t == "CFrame" and vt == "table" then
		if v.position and v.lookAt then
			return CFrame.lookAt(Vector3.new(unpack(v.position)), Vector3.new(unpack(v.lookAt)))
		elseif #v == 3 then
			return CFrame.new(v[1], v[2], v[3])
		elseif #v == 12 then
			return CFrame.new(unpack(v))
		end
	elseif t == "Color3" then
		if vt == "string" then
			return Color3.fromHex(v)
		elseif vt == "table" and #v == 3 then
			if v[1] > 1 or v[2] > 1 or v[3] > 1 then
				return Color3.fromRGB(v[1], v[2], v[3])
			end
			return Color3.new(v[1], v[2], v[3])
		end
	elseif t == "UDim2" and vt == "table" then
		return UDim2.new(v[1], v[2], v[3], v[4])
	elseif t == "UDim" and vt == "table" then
		return UDim.new(v[1], v[2])
	elseif t == "BrickColor" and vt == "string" then
		return BrickColor.new(v)
	elseif t == "Instance" and vt == "string" then
		return RB.resolve(v)
	elseif t == "EnumItem" and vt == "string" then
		local etype, ename = string.match(v, "^Enum%.([%w_]+)%.([%w_]+)$")
		if etype and Enum[etype] then
			return Enum[etype][ename]
		end
		if cur then
			return cur.EnumType[v]
		end
	elseif t == "NumberSequence" then
		if vt == "number" then
			return NumberSequence.new(v)
		elseif vt == "table" then
			local kps = {}
			for _, kp in ipairs(v) do
				table.insert(kps, NumberSequenceKeypoint.new(kp.time or kp[1], kp.value or kp[2], kp.envelope or 0))
			end
			return NumberSequence.new(kps)
		end
	elseif t == "ColorSequence" then
		if vt == "string" then
			return ColorSequence.new(Color3.fromHex(v))
		elseif vt == "table" then
			local kps = {}
			for _, kp in ipairs(v) do
				local c = kp.color or kp[2]
				if type(c) == "string" then
					c = Color3.fromHex(c)
				elseif type(c) == "table" then
					c = Color3.new(c[1], c[2], c[3])
				end
				table.insert(kps, ColorSequenceKeypoint.new(kp.time or kp[1], c))
			end
			return ColorSequence.new(kps)
		end
	elseif t == "NumberRange" then
		if vt == "number" then
			return NumberRange.new(v)
		elseif vt == "table" then
			return NumberRange.new(v[1], v[2] or v[1])
		end
	end
	-- Untyped fallback: recognize enum strings like "Enum.Material.Neon"
	if vt == "string" then
		local etype, ename = string.match(v, "^Enum%.([%w_]+)%.([%w_]+)$")
		if etype and Enum[etype] then
			return Enum[etype][ename]
		end
	end
	return v
end

function RB.setProp(inst, name, value)
	if type(name) ~= "string" or name == "" then
		error(
			("Failed to set %s: property name is missing. Use manage_properties action 'set' with property + value, or action 'set_many' with properties={Name=value,...}."):format(
				inst:GetFullName()
			),
			0
		)
	end
	local okCur, cur = pcall(function()
		return inst[name]
	end)
	local t = okCur and typeof(cur) or nil
	local converted = RB.toValue(value, t, okCur and cur or nil)
	local ok, err = pcall(function()
		inst[name] = converted
	end)
	if not ok then
		error(("Failed to set %s.%s: %s"):format(inst:GetFullName(), name, tostring(err)), 0)
	end
end

function RB.setProps(inst, props)
	if type(props) ~= "table" then
		error("set_many requires a properties map like {Transparency=0.5, Anchored=true}", 0)
	end
	for name, value in pairs(props) do
		if type(name) ~= "string" then
			error("properties map keys must be property name strings, got " .. type(name), 0)
		end
		RB.setProp(inst, name, value)
	end
end

function RB.getProps(inst, names)
	local out = {}
	for _, n in ipairs(names or {}) do
		local ok, v = pcall(function()
			return inst[n]
		end)
		if ok then
			out[n] = RB.encode(v)
		end
	end
	return out
end

local COMMON_PROPS = {
	"Position", "Size", "Anchored", "CanCollide", "Transparency", "Color", "Material", "Reflectance",
	"Shape", "Orientation", "Massless",
	"Enabled", "Visible", "Text", "TextColor3", "TextSize", "Font", "BackgroundColor3", "BackgroundTransparency", "ZIndex",
	"Brightness", "Range", "SoundId", "Volume", "Looped", "IsPlaying", "AnimationId", "Value",
	"ClockTime", "Ambient", "FieldOfView", "Image", "ScaleType",
}

function RB.commonProps(inst)
	local out = RB.getProps(inst, COMMON_PROPS)
	out.Name = inst.Name
	out.ClassName = inst.ClassName
	out.Parent = inst.Parent and inst.Parent:GetFullName() or nil
	return out
end

function RB.summary(inst, includeProps)
	local s = {
		name = inst.Name,
		className = inst.ClassName,
		path = inst:GetFullName(),
		childCount = #inst:GetChildren(),
		rbId = RB.ensureId(inst),
	}
	if includeProps then
		s.properties = RB.commonProps(inst)
	end
	return s
end

function RB.getSource(inst)
	local ok, src = pcall(function()
		return game:GetService("ScriptEditorService"):GetEditorSource(inst)
	end)
	if ok and type(src) == "string" then
		return src
	end
	return inst.Source
end

function RB.setSource(inst, src)
	local ok = pcall(function()
		game:GetService("ScriptEditorService"):UpdateSourceAsync(inst, function()
			return src
		end)
	end)
	if not ok then
		inst.Source = src
	end
end

function RB.waypoint(name)
	pcall(function()
		ChangeHistoryService:SetWaypoint("RoBridge: " .. tostring(name))
	end)
end

function RB.clickGui(inst)
	if not inst:IsA("GuiButton") then
		error("Not a GuiButton: " .. inst.ClassName, 0)
	end
	pcall(function()
		inst:SetAttribute("RoBridgeClicked", os.clock())
	end)
	local sg = inst
	while sg and not sg:IsA("LayerCollector") do
		sg = sg.Parent
	end
	if sg then
		pcall(function()
			sg:SetAttribute("LastClick", inst.Name)
		end)
	end
	local pos, size = inst.AbsolutePosition, inst.AbsoluteSize
	local x = pos.X + math.max(size.X, 1) / 2
	local y = pos.Y + math.max(size.Y, 1) / 2
	local method = "Attribute"
	local viOk, vi = pcall(function()
		return game:GetService("UserInputService"):CreateVirtualInput()
	end)
	if viOk and vi then
		local sent = pcall(function()
			vi:SendMousePosition(Vector2.new(x, y))
			vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, true)
			task.wait(0.05)
			vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, false)
		end)
		if sent then
			method = "VirtualInput"
		end
	end
	local ev = inst:FindFirstChild("RoBridgeClick")
	if ev and ev:IsA("BindableEvent") then
		pcall(function()
			ev:Fire()
		end)
	end
	return {
		clicked = inst:GetFullName(),
		className = inst.ClassName,
		method = method,
		at = { x, y },
		abs = { pos.X, pos.Y, size.X, size.Y },
		mode = "edit",
	}
end

--------------------------------------------------------------------
-- Output log capture
--------------------------------------------------------------------
local LEVEL_NAMES = {
	[Enum.MessageType.MessageOutput] = "Print",
	[Enum.MessageType.MessageWarning] = "Warning",
	[Enum.MessageType.MessageError] = "Error",
	[Enum.MessageType.MessageInfo] = "Info",
}

LogService.MessageOut:Connect(function(message, messageType)
	table.insert(RB.logBuffer, {
		time = os.time(),
		level = LEVEL_NAMES[messageType] or "Print",
		message = string.sub(message, 1, 2000),
	})
	if #RB.logBuffer > 500 then
		table.remove(RB.logBuffer, 1)
	end
end)

--------------------------------------------------------------------
-- HTTP bridge
--------------------------------------------------------------------
local connected = false
local pendingPlay = nil
local playAgentConfig = nil

-- Play agents are plugin-owned. They are inserted into the Edit DataModel
-- only long enough for Studio to snapshot them into Play, then sealed
-- (Archivable=false) and stripped so they are never saved with the place.
-- Archivable stays true until after the Play snapshot — otherwise Play
-- would omit them.
local PLAY_SERVER_NAMES = { "s0", "RoBridgePlayServer", "t0", "RoBridgeTestRunner" }
local PLAY_CLIENT_NAMES = { "c1", "RoBridgePlayClient" }
local PLAY_RF_NAMES = { "q9", "RoBridgePlayRF" }

local function nameSet(list)
	local set = {}
	for _, name in ipairs(list) do
		set[name] = true
	end
	return set
end

local PLAY_SERVER_SET = nameSet(PLAY_SERVER_NAMES)
local PLAY_CLIENT_SET = nameSet(PLAY_CLIENT_NAMES)
local PLAY_RF_SET = nameSet(PLAY_RF_NAMES)

local function markTemp(inst)
	pcall(function()
		inst:SetAttribute("RoBridgeTemp", true)
	end)
end

local function sealTemp(inst)
	pcall(function()
		inst.Archivable = false
	end)
end

local function isPlayAgent(inst, names)
	if inst:GetAttribute("RoBridgeTemp") == true then
		return true
	end
	return names[inst.Name] == true
end

local function playAgentParents()
	local rs = game:GetService("ReplicatedStorage")
	local sss = game:GetService("ServerScriptService")
	local starterPlayer = game:GetService("StarterPlayer")
	local sps = starterPlayer:FindFirstChild("StarterPlayerScripts")
	local ss = game:GetService("ServerStorage")
	return {
		{ parent = sss, names = PLAY_SERVER_SET },
		{ parent = sps, names = PLAY_CLIENT_SET },
		{ parent = rs, names = PLAY_RF_SET },
		{ parent = ss, names = PLAY_SERVER_SET },
	}
end

function RB.stripPlayAgents()
	for _, spec in ipairs(playAgentParents()) do
		local parent = spec.parent
		if parent then
			for _, inst in ipairs(parent:GetDescendants()) do
				if isPlayAgent(inst, spec.names) then
					sealTemp(inst)
					inst:Destroy()
				end
			end
			for _, inst in ipairs(parent:GetChildren()) do
				if isPlayAgent(inst, spec.names) then
					sealTemp(inst)
					inst:Destroy()
				end
			end
		end
	end
	return { stripped = true }
end

function RB.sealPlayAgents()
	for _, spec in ipairs(playAgentParents()) do
		local parent = spec.parent
		if parent then
			for _, inst in ipairs(parent:GetDescendants()) do
				if isPlayAgent(inst, spec.names) then
					sealTemp(inst)
				end
			end
			for _, inst in ipairs(parent:GetChildren()) do
				if isPlayAgent(inst, spec.names) then
					sealTemp(inst)
				end
			end
		end
	end
	return { sealed = true }
end

function RB.installPlayAgents(args)
	playAgentConfig = args
	return { staged = true }
end

local function materializePlayAgents()
	if type(playAgentConfig) ~= "table" or type(playAgentConfig.serverSource) ~= "string" then
		return { ok = false, error = "play agents not staged" }
	end
	local A = playAgentConfig
	RB.stripPlayAgents()
	pcall(function()
		game:GetService("HttpService").HttpEnabled = true
	end)
	pcall(function()
		game:GetService("ServerScriptService").LoadStringEnabled = true
	end)
	local rs = game:GetService("ReplicatedStorage")
	local sss = game:GetService("ServerScriptService")
	local sps = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
	if not sps then
		sps = Instance.new("StarterPlayerScripts")
		sps.Parent = game:GetService("StarterPlayer")
	end
	local rf = Instance.new("RemoteFunction")
	rf.Name = A.rfName or "q9"
	markTemp(rf)
	rf.Parent = rs
	local function upsert(parent, className, name, source)
		local inst = Instance.new(className)
		inst.Name = name
		markTemp(inst)
		-- Archivable remains true until Play snapshots, then seal+strip.
		inst.Parent = parent
		RB.setSource(inst, source)
		pcall(function()
			inst.Enabled = true
		end)
		return inst:GetFullName()
	end
	local serverPath = upsert(sss, "Script", A.serverName or "s0", A.serverSource)
	local clientPath = upsert(sps, "LocalScript", A.clientName or "c1", A.clientSource)
	local testPath = nil
	if type(A.testSource) == "string" and A.testSource ~= "" then
		testPath = upsert(sss, "Script", A.testName or "t0", A.testSource)
	end
	print("[RoBridge] Play agents materialized in Edit", serverPath, clientPath, rf:GetFullName())
	return { ok = true, rf = rf:GetFullName(), server = serverPath, client = clientPath, test = testPath }
end

local function editDataModel()
	return not RunService:IsRunning()
end

local function stripIfEdit()
	if not editDataModel() then
		return
	end
	RB.stripPlayAgents()
end

local function isWedgeError(err)
	local msg = string.lower(tostring(err or ""))
	return string.find(msg, "still in progress", 1, true) ~= nil
		or string.find(msg, "previous test", 1, true) ~= nil
		or string.find(msg, "previous one", 1, true) ~= nil
		or string.find(msg, "already in progress", 1, true) ~= nil
end

local function endStudioTest(reason)
	local STS = game:GetService("StudioTestService")
	local why = reason or "stopped_by_robridge"
	if pcall(function()
		STS:EndTest(why)
	end) then
		return true
	end
	if pcall(function()
		STS:EndTest()
	end) then
		return true
	end
	for _, name in ipairs({ "Stop", "StopTest", "CancelTest" }) do
		local ok = pcall(function()
			STS[name](STS)
		end)
		if ok then
			return true
		end
	end
	return false
end

-- Spawn ExecutePlay/RunModeAsync and wait briefly so immediate
-- StudioTestService failures (zombie "previous test still in progress")
-- are returned to the MCP job instead of only warned in Output.
local function executePlay(mode)
	local STS = game:GetService("StudioTestService")
	RB.state.playStartError = nil
	RB.state.playStarting = true
	local snapshotReady = false
	task.delay(1, function()
		snapshotReady = true
		RB.sealPlayAgents()
		RB.stripPlayAgents()
	end)
	local immediateErr
	local finished = false
	task.spawn(function()
		print("[RoBridge] Starting Studio " .. mode .. " via StudioTestService")
		local ok, err = pcall(function()
			if mode == "run" then
				STS:ExecuteRunModeAsync("RoBridge")
			else
				STS:ExecutePlayModeAsync("RoBridge")
			end
		end)
		finished = true
		RB.state.playStarting = false
		if not ok then
			immediateErr = err
			RB.state.playStartError = tostring(err)
			warn("[RoBridge] play_start failed: " .. tostring(err))
			RB.stripPlayAgents()
		else
			print("[RoBridge] Studio " .. mode .. " session ended")
			if snapshotReady then
				RB.stripPlayAgents()
			end
		end
	end)
	local t = 0
	while t < 0.5 and not immediateErr and not finished do
		task.wait(0.05)
		t += 0.05
	end
	if immediateErr then
		local wedged = isWedgeError(immediateErr)
		return {
			started = false,
			queued = false,
			mode = mode,
			error = tostring(immediateErr),
			wedged = wedged,
			code = wedged and "studio_test_wedged" or "play_start_failed",
		}
	end
	return { queued = true, started = true, mode = mode }
end

function RB.startPlay(mode)
	mode = mode == "run" and "run" or "play"
	pendingPlay = nil
	endStudioTest("robridge_prestart_stop")
	task.wait(0.2)
	local agents = materializePlayAgents()
	local result = executePlay(mode)
	result.agents = agents
	return result
end

function RB.stopPlay()
	pendingPlay = nil
	RB.state.playStarting = false
	RB.state.playStartError = nil
	task.spawn(function()
		endStudioTest("stopped_by_robridge")
	end)
	local deadline = os.clock() + 3
	while os.clock() < deadline and RunService:IsRunning() do
		task.wait(0.1)
	end
	if not RunService:IsRunning() then
		RB.sealPlayAgents()
		RB.stripPlayAgents()
	end
	return {
		stopAttempted = true,
		stopped = not RunService:IsRunning(),
		isEdit = RunService:IsEdit() and not RunService:IsRunning(),
		isRunning = RunService:IsRunning(),
		endTestFromEdit = true,
	}
end

function RB.playStatus()
	local mode = "edit"
	if RunService:IsRunning() then
		mode = RunService:IsClient() and "play" or "run"
	end
	return {
		mode = mode,
		isEdit = RunService:IsEdit() and not RunService:IsRunning(),
		isRunning = RunService:IsRunning(),
		placeName = game.Name,
		placeId = game.PlaceId,
		playStarting = RB.state.playStarting == true,
		lastPlayStartError = RB.state.playStartError,
	}
end

local function tryStudioTestMethods(names)
	local STS = game:GetService("StudioTestService")
	for _, name in ipairs(names) do
		local ok = pcall(function()
			STS[name](STS)
		end)
		if ok then
			return { ok = true, method = name }
		end
	end
	return nil
end

function RB.pausePlay()
	local hit = tryStudioTestMethods({ "Pause", "PauseTest", "PauseCurrentTest" })
	if hit then
		hit.action = "play_pause"
		return hit
	end
	return {
		ok = false,
		action = "play_pause",
		code = "play_pause_manual_required",
		warning = "StudioTestService has no public pause API in this Studio build. Use play_stop or run_test.",
	}
end

function RB.resumePlay()
	local hit = tryStudioTestMethods({ "Resume", "ResumeTest", "ResumeCurrentTest" })
	if hit then
		hit.action = "play_resume"
		return hit
	end
	return {
		ok = false,
		action = "play_resume",
		code = "play_resume_manual_required",
		warning = "StudioTestService has no public resume API in this Studio build. Use play_start or run_test.",
	}
end

local function pumpPendingPlay()
	if not pendingPlay then
		return
	end
	local mode = pendingPlay
	pendingPlay = nil
	local snapshotReady = false
	-- Play snapshots the Edit DataModel as it starts. After that, seal
	-- Archivable=false and strip from Edit so agents exist only in Play.
	task.delay(1, function()
		snapshotReady = true
		RB.sealPlayAgents()
		RB.stripPlayAgents()
	end)
	task.spawn(function()
		local STS = game:GetService("StudioTestService")
		print("[RoBridge] Starting Studio " .. mode .. " via StudioTestService")
		local ok, err = pcall(function()
			if mode == "run" then
				STS:ExecuteRunModeAsync("RoBridge")
			else
				STS:ExecutePlayModeAsync("RoBridge")
			end
		end)
		if not ok then
			RB.state.playStartError = tostring(err)
			RB.state.playStarting = false
			warn("[RoBridge] play_start failed: " .. tostring(err))
			RB.stripPlayAgents()
		else
			print("[RoBridge] Studio " .. mode .. " session ended")
			if snapshotReady then
				RB.stripPlayAgents()
			end
		end
	end)
end

local meshImageOk = nil
local lastMeshCheck = 0

local function currentPreflight()
	local httpOk, http = pcall(function()
		return HttpService.HttpEnabled
	end)
	local loadOk, fn = pcall(function()
		return loadstring("return 1")
	end)
	if meshImageOk == nil or os.clock() - lastMeshCheck > 30 then
		lastMeshCheck = os.clock()
		meshImageOk = pcall(function()
			local img = game:GetService("AssetService"):CreateEditableImage({ Size = Vector2.new(4, 4) })
			if img then
				pcall(function()
					img:Destroy()
				end)
			end
		end)
	end
	return {
		mode = "edit",
		httpEnabled = httpOk and http == true,
		loadstring = loadOk and fn ~= nil,
		meshImageApis = meshImageOk == true,
		placeId = game.PlaceId,
	}
end

local function request(routePath, body)
	return HttpService:RequestAsync({
		Url = BASE_URL .. routePath,
		Method = "POST",
		Headers = { ["Content-Type"] = "application/json" },
		Body = HttpService:JSONEncode(body),
	})
end

local function runJob(job)
	local compiled, fn, err = pcall(function()
		return loadstring(job.code)
	end)
	if not compiled then
		return false, nil, tostring(fn)
	end
	if not fn then
		return false, nil, "loadstring failed: " .. tostring(err) .. ". execute_luau is Edit-only; in Play use manage_studio.run_test / play agents."
	end
	local ok, result = pcall(fn, RB, job.args or {})
	if not ok then
		return false, nil, tostring(result)
	end
	return true, result, nil
end

local function postResult(jobId, ok, result, err)
	local payload = { sessionId = SESSION_ID, jobId = jobId, ok = ok, error = err }
	local encodeOk = pcall(function()
		payload.result = result
		HttpService:JSONEncode(payload)
	end)
	if not encodeOk then
		payload.result = tostring(result)
	end
	pcall(request, "/api/plugin/result", payload)
end

local function pollOnce()
	if RunService:IsRunning() or not RunService:IsEdit() then
		return false
	end
	local ok, res = pcall(request, "/api/plugin/poll", {
		sessionId = SESSION_ID,
		placeName = game.Name,
		placeId = game.PlaceId,
		gameId = game.GameId,
		mode = "edit",
		pluginVersion = VERSION,
		preflight = currentPreflight(),
	})
	if not ok or not res.Success then
		return false
	end
	local decodeOk, body = pcall(HttpService.JSONDecode, HttpService, res.Body)
	if not decodeOk or type(body) ~= "table" then
		return false
	end
	local job = body.job
	if job then
		task.spawn(function()
			local jobOk, result, jobErr = runJob(job)
			postResult(job.id, jobOk, result, jobErr)
		end)
	end
	return true
end

local function pollLoop()
	local announced = false
	while connected do
		local ok = pollOnce()
		if ok then
			if not announced then
				print(("[RoBridge] Connected to %s (session %s)"):format(BASE_URL, string.sub(SESSION_ID, 1, 8)))
				announced = true
			end
		else
			if announced then
				warn("[RoBridge] Lost connection to " .. BASE_URL .. " — retrying...")
				announced = false
			end
			task.wait(3)
		end
		pumpPendingPlay()
		task.wait(0.05)
	end
end

--------------------------------------------------------------------
-- Toolbar
--------------------------------------------------------------------
local toolbar = plugin:CreateToolbar("RoBridge")
local button = toolbar:CreateButton("RoBridge", "Toggle RoBridge connection to the local MCP server", "rbxassetid://14978048121")
button.ClickableWhenViewportHidden = true

local function setConnected(v)
	if connected == v then
		return
	end
	connected = v
	button:SetActive(v)
	plugin:SetSetting("RoBridgeAutoConnect", v)
	if v then
		task.spawn(pollLoop)
	else
		print("[RoBridge] Disconnected")
		RB.state.recording = false
		RB.stripIds()
		stripIfEdit()
	end
end

button.Click:Connect(function()
	setConnected(not connected)
end)

if plugin:GetSetting("RoBridgeAutoConnect") ~= false then
	setConnected(true)
end

stripIfEdit()

plugin.Unloading:Connect(function()
	connected = false
	RB.state.recording = false
	RB.stripIds()
	stripIfEdit()
end)
