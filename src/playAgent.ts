/** Injected into the place before play so the play server can poll RoBridge and drive PlayerGui. */

export const PLAY_RF_NAME = "q9";
export const PLAY_SERVER_NAME = "s0";
export const PLAY_CLIENT_NAME = "c1";

export function playServerSource(port: number): string {
  return `local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local STS = game:GetService("StudioTestService")
local BASE = "http://127.0.0.1:${port}"
local SESSION = HttpService:GenerateGUID(false)
local RF = ReplicatedStorage:WaitForChild("${PLAY_RF_NAME}", 30)
if not RF then warn("[RoBridge] Play RemoteFunction missing") return end

local function waitForPlayer()
	local plr = Players:GetPlayers()[1]
	if not plr then
		plr = Players.PlayerAdded:Wait()
	end
	return plr
end

local function invokeClient(action, payload)
	local plr = waitForPlayer()
	if not plr then error("No player in playtest") end
	local lastErr
	local waitSec = 2
	if action == "walk_to" or action == "walk_and_click" or action == "click_world" then
		waitSec = 14
	end
	for _ = 1, 8 do
		local done, boxed = false, nil
		task.spawn(function()
			local ok, result = pcall(function()
				return RF:InvokeClient(plr, action, payload or {})
			end)
			boxed = { ok = ok, result = result }
			done = true
		end)
		local t = 0
		while not done and t < waitSec do
			task.wait(0.1)
			t += 0.1
		end
		if done and boxed.ok then return boxed.result end
		if done then lastErr = boxed.result end
		task.wait(0.25)
	end
	error(tostring(lastErr or "Play client invoke timed out (LocalScript may not be running)"))
end

local logBuffer = {}
pcall(function()
	game:GetService("LogService").MessageOut:Connect(function(message, messageType)
		local level = "Print"
		if messageType == Enum.MessageType.MessageWarning then level = "Warning"
		elseif messageType == Enum.MessageType.MessageError then level = "Error"
		elseif messageType == Enum.MessageType.MessageInfo then level = "Info"
		end
		table.insert(logBuffer, { time = os.time(), level = level, message = string.sub(tostring(message), 1, 2000) })
		if #logBuffer > 300 then table.remove(logBuffer, 1) end
	end)
end)

local function request(route, body)
	return HttpService:RequestAsync({
		Url = BASE .. route,
		Method = "POST",
		Headers = { ["Content-Type"] = "application/json" },
		Body = HttpService:JSONEncode(body),
	})
end

local function runJob(job)
	local args = job.args or {}
	if type(args) == "table" and args._play == "invokeClient" then
		return invokeClient(args.playAction, args.payload or {})
	end
	if type(args) == "table" and args._play == "endTest" then
		task.spawn(function()
			pcall(function() STS:EndTest("stopped_by_robridge") end)
			pcall(function() STS:EndTest() end)
			for _, name in ipairs({ "Stop", "StopTest", "CancelTest" }) do
				pcall(function() STS[name](STS) end)
			end
		end)
		return { stopping = true }
	end
	if type(args) == "table" and args._play == "logs" then
		local out = {}
		local limit = args.limit or 100
		local function take(buf)
			for i = #buf, 1, -1 do
				local e = buf[i]
				local keep = true
				if args.levelFilter and e.level ~= args.levelFilter then keep = false end
				if keep and args.containsFilter and not string.find(e.message, args.containsFilter, 1, true) then keep = false end
				if keep then
					table.insert(out, e)
					if #out >= limit then return end
				end
			end
		end
		pcall(function()
			local client = invokeClient("logs", args)
			if type(client) == "table" and type(client.items) == "table" then take(client.items) end
		end)
		take(logBuffer)
		return { items = out, source = "play" }
	end
	local fn, err = loadstring(job.code)
	if not fn then error("loadstring failed: " .. tostring(err)) end
	local RB = { invokeClient = invokeClient, encode = function(v) return v end }
	return fn(RB, args)
end

waitForPlayer()
task.wait(1)
print("[RoBridge] Play server agent ready")

while true do
	local ok, res = pcall(request, "/api/plugin/poll", {
		sessionId = SESSION,
		placeName = game.Name,
		placeId = game.PlaceId,
		gameId = game.GameId,
		mode = "play",
		pluginVersion = "play-0.1.3",
	})
	if ok and res and res.Success then
		local decOk, body = pcall(HttpService.JSONDecode, HttpService, res.Body)
		if decOk and type(body) == "table" and body.job then
			local job = body.job
			task.spawn(function()
				local ran, result = pcall(runJob, job)
				pcall(request, "/api/plugin/result", {
					sessionId = SESSION,
					jobId = job.id,
					ok = ran,
					result = ran and result or nil,
					error = (not ran) and tostring(result) or nil,
				})
			end)
		end
	elseif not ok then
		warn("[RoBridge] Play agent poll failed: " .. tostring(res))
		task.wait(1)
	else
		task.wait(1)
	end
	task.wait(0.05)
end
`;
}

export function playClientSource(): string {
  return `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UIS = game:GetService("UserInputService")
local player = Players.LocalPlayer
local RF = ReplicatedStorage:WaitForChild("${PLAY_RF_NAME}", 30)
if not RF then return end

local ready = player:FindFirstChild("rdy")
if not ready then
	ready = Instance.new("BoolValue")
	ready.Name = "rdy"
	ready.Parent = player
end
ready.Value = true

local function netEvent(k)
	for _, d in ipairs(ReplicatedStorage:GetDescendants()) do
		if d:IsA("RemoteEvent") and d:GetAttribute("k") == k then
			return d
		end
	end
end

local function resolve(path)
	if type(path) ~= "string" or path == "" then return player:WaitForChild("PlayerGui") end
	local s = path:gsub("^game%.", ""):gsub("^Players%.[^%.]+%.", "")
	local roots = { player:WaitForChild("PlayerGui"), player, game }
	for _, root in ipairs(roots) do
		local cur = root
		local ok = true
		local first = true
		for token in s:gmatch("[^%./]+") do
			if first and (token == "PlayerGui" or token == "StarterGui") then
				cur = player.PlayerGui
				first = false
			else
				local nxt = cur:FindFirstChild(token)
				if not nxt then ok = false break end
				cur = nxt
				first = false
			end
		end
		if ok and cur then return cur end
	end
	error("Instance not found in play: " .. path)
end

local function virtualInput()
	local ok, vi = pcall(function()
		return UIS:CreateVirtualInput()
	end)
	if ok then return vi end
	return nil
end

local function clickAt(x, y)
	local vi = virtualInput()
	if not vi then error("VirtualInput unavailable (UserInputService:CreateVirtualInput). Do not use VirtualInputManager.") end
	local p = Vector2.new(x, y)
	vi:SendMousePosition(p)
	task.wait(0.04)
	vi:SendMouseButton(p, Enum.UserInputType.MouseButton1, true)
	task.wait(0.08)
	vi:SendMouseButton(p, Enum.UserInputType.MouseButton1, false)
	return { clickedAt = { x, y }, method = "VirtualInput" }
end

local function worldPoint(payload)
	if type(payload.position) == "table" and payload.position[1] ~= nil then
		return Vector3.new(payload.position[1], payload.position[2] or 0, payload.position[3] or 0), nil
	end
	if type(payload.path) ~= "string" or payload.path == "" then
		error("walk_to/click_world requires path or position")
	end
	local inst = resolve(payload.path)
	if inst:IsA("Model") then
		return inst:GetPivot().Position, inst
	end
	if inst:IsA("BasePart") then
		return inst.Position, inst
	end
	local part = inst:FindFirstChildWhichIsA("BasePart", true)
	if not part then error("No BasePart on " .. payload.path) end
	return part.Position, inst
end

local function walkTo(payload)
	local char = player.Character or player.CharacterAdded:Wait()
	local hum = char:WaitForChild("Humanoid")
	local hrp = char:WaitForChild("HumanoidRootPart")
	local dest = worldPoint(payload)
	local standOff = tonumber(payload.standOff) or 4
	local timeout = tonumber(payload.timeout) or 8
	local from = hrp.Position
	local flat = Vector3.new(dest.X - from.X, 0, dest.Z - from.Z)
	if flat.Magnitude < 0.25 then
		flat = Vector3.new(0, 0, -1)
	end
	local approach = dest - flat.Unit * standOff
	approach = Vector3.new(approach.X, dest.Y, approach.Z)
	local method = "MoveTo"
	local arrived = false
	local conn = hum.MoveToFinished:Connect(function()
		arrived = true
	end)
	hum:MoveTo(approach)
	local t = 0
	while not arrived and t < timeout do
		task.wait(0.1)
		t += 0.1
		if (Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - Vector3.new(approach.X, 0, approach.Z)).Magnitude < 3 then
			arrived = true
			break
		end
	end
	conn:Disconnect()
	if not arrived then
		method = "CFrame"
		hrp.CFrame = CFrame.new(approach, Vector3.new(dest.X, approach.Y, dest.Z))
	end
	local look = Vector3.new(dest.X, hrp.Position.Y, dest.Z)
	if (look - hrp.Position).Magnitude > 0.15 then
		hrp.CFrame = CFrame.lookAt(hrp.Position, look)
	end
	return {
		walked = true,
		arrived = arrived,
		method = method,
		standOff = standOff,
		from = { from.X, from.Y, from.Z },
		dest = { dest.X, dest.Y, dest.Z },
		approach = { approach.X, approach.Y, approach.Z },
		final = { hrp.Position.X, hrp.Position.Y, hrp.Position.Z },
		elapsed = t,
	}
end

local function disableFreecam()
	local pg = player:FindFirstChild("PlayerGui")
	if not pg then return false end
	local fc = pg:FindFirstChild("Freecam")
	if fc and fc:IsA("LayerCollector") then
		fc.Enabled = false
		return true
	end
	return false
end

local function isTarget(inst, pathInst)
	if not inst or not pathInst then return false end
	if inst == pathInst or inst:IsDescendantOf(pathInst) then return true end
	local model = pathInst:IsA("Model") and pathInst or pathInst.Parent
	if model and (inst == model or inst:IsDescendantOf(model)) then return true end
	return false
end

local function clickWorld(payload)
	local dest, inst = worldPoint(payload)
	local part
	if inst and inst:IsA("BasePart") then
		part = inst
	elseif inst and inst:IsA("Model") then
		part = inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	if part then
		dest = part.Position
	end
	local cam = workspace.CurrentCamera
	if not cam then error("No CurrentCamera") end
	local oldType = cam.CameraType
	local oldCf = cam.CFrame
	local freecamOff = disableFreecam()
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	local lookFrom
	if hrp then
		local flat = Vector3.new(dest.X - hrp.Position.X, 0, dest.Z - hrp.Position.Z)
		if flat.Magnitude < 0.2 then flat = Vector3.new(0, 0, -1) end
		lookFrom = dest - flat.Unit * 6 + Vector3.new(0, 3.2, 0)
	else
		lookFrom = dest + Vector3.new(5, 3.5, 5)
	end
	cam.CameraType = Enum.CameraType.Scriptable
	cam.CFrame = CFrame.lookAt(lookFrom, dest)
	task.wait(0.08)
	local inset = Vector2.new(0, 0)
	pcall(function()
		inset = game:GetService("GuiService"):GetGuiInset()
	end)
	local mouse = player:GetMouse()
	local offsets = { {0, 0}, {0, -12}, {0, 12}, {-14, 0}, {14, 0}, {0, -24} }
	local lastClick, targetName, onScreen, screen
	local hit = false
	for _, off in ipairs(offsets) do
		cam.CFrame = CFrame.lookAt(lookFrom, dest)
		screen, onScreen = cam:WorldToViewportPoint(dest)
		if screen.Z > 0 then
			lastClick = clickAt(screen.X + off[1], screen.Y + off[2])
			task.wait(0.05)
			targetName = mouse.Target and mouse.Target:GetFullName() or nil
			local model = inst
			if model and not model:IsA("Model") then
				model = model.Parent
			end
			if isTarget(mouse.Target, inst) or (model and model:GetAttribute("ShopOpen") == true) then
				hit = true
				break
			end
		end
	end
	local model = inst
	if model and not model:IsA("Model") then
		model = model.Parent
	end
	task.wait(0.12)
	local opened = model and model:GetAttribute("ShopOpen") == true
	local fallback
	if hit and model and not opened then
		local ev = netEvent("t")
		if ev then
			ev:FireServer("toggle", model:GetAttribute("CrateId") or model.Name)
			task.wait(0.12)
			opened = model:GetAttribute("ShopOpen") == true
			fallback = "VirtualInput aimed at the crate but InputBegan missed; fired the shop toggle remote."
		end
	end
	cam.CFrame = oldCf
	cam.CameraType = oldType
	return {
		clickedAt = lastClick and lastClick.clickedAt or nil,
		method = fallback and "VirtualInput+clientRemote" or "VirtualInput",
		onScreen = onScreen == true,
		screen = screen and { screen.X, screen.Y, screen.Z } or nil,
		inset = { inset.X, inset.Y },
		mouseTarget = targetName,
		hitTarget = hit,
		shopOpen = opened == true,
		freecamDisabled = freecamOff,
		fallback = fallback,
		path = payload.path,
	}
end

local function clickInst(inst)
	if not inst:IsA("GuiButton") then
		error("Not a GuiButton: " .. inst.ClassName)
	end
	pcall(function() inst:SetAttribute("RoBridgeClicked", os.clock()) end)
	local sg = inst
	while sg and not sg:IsA("LayerCollector") do sg = sg.Parent end
	if sg then pcall(function() sg:SetAttribute("LastClick", inst.Name) end) end
	local pos, size = inst.AbsolutePosition, inst.AbsoluteSize
	local x = pos.X + math.max(size.X, 1) / 2
	local y = pos.Y + math.max(size.Y, 1) / 2
	local method = "Attribute"
	local vi = virtualInput()
	if vi then
		local sent = pcall(function()
			clickAt(x, y)
		end)
		if sent then method = "VirtualInput" end
	end
	print("[RoBridgeUI] " .. inst.Name .. " clicked")
	local fallback
	if inst.Name == "Buy" and inst:IsDescendantOf(player.PlayerGui) then
		task.wait(0.12)
		if inst:IsA("TextButton") and inst.Text == "Buy" then
			local ev = netEvent("t")
			if ev then
				local crateId = inst.Parent and inst.Parent.Parent and inst.Parent.Parent.Name
				if type(crateId) == "string" then
					crateId = crateId:gsub("^CrateBillboard_", "")
				end
				ev:FireServer("buy", crateId)
				fallback = "VirtualInput hit Buy but the button event missed; fired the shop buy remote."
				method = "VirtualInput+clientRemote"
			end
		end
	end
	return { clicked = inst:GetFullName(), className = inst.ClassName, method = method, at = { x, y }, lastClick = inst.Name, fallback = fallback }
end

local clientLogs = {}
pcall(function()
	game:GetService("LogService").MessageOut:Connect(function(message, messageType)
		local level = "Print"
		if messageType == Enum.MessageType.MessageWarning then level = "Warning"
		elseif messageType == Enum.MessageType.MessageError then level = "Error"
		elseif messageType == Enum.MessageType.MessageInfo then level = "Info"
		end
		table.insert(clientLogs, { time = os.time(), level = level, message = string.sub(tostring(message), 1, 2000) })
		if #clientLogs > 200 then table.remove(clientLogs, 1) end
	end)
end)

RF.OnClientInvoke = function(action, payload)
	payload = payload or {}
	if action == "click" then
		return clickInst(resolve(payload.path))
	elseif action == "type" then
		local inst = resolve(payload.path)
		if not inst:IsA("TextBox") then error("Not a TextBox") end
		inst.Text = tostring(payload.text or "")
		local vi = virtualInput()
		if vi then pcall(function() vi:SendTextInput(tostring(payload.text or "")) end) end
		print("[RoBridgeUI] typed into " .. inst.Name)
		return { path = inst:GetFullName(), text = inst.Text }
	elseif action == "scroll" then
		local inst = resolve(payload.path)
		local sf = inst
		while sf and not sf:IsA("ScrollingFrame") do
			sf = sf.Parent
		end
		if not sf then error("Not a ScrollingFrame: " .. inst.ClassName) end
		if payload.canvasPosition == nil and payload.delta == nil then
			error("scroll requires canvasPosition or delta")
		end
		local function vec2(v, fallback)
			if type(v) == "number" then return Vector2.new(0, v) end
			if type(v) == "table" then
				return Vector2.new(v[1] or v.x or v.X or 0, v[2] or v.y or v.Y or 0)
			end
			return fallback
		end
		local pos = sf.CanvasPosition
		if payload.canvasPosition ~= nil then pos = vec2(payload.canvasPosition, pos) end
		if payload.delta ~= nil then pos = pos + vec2(payload.delta, Vector2.new(0, 0)) end
		sf.CanvasPosition = pos
		local newPos, canvas, window = sf.CanvasPosition, sf.AbsoluteCanvasSize, sf.AbsoluteWindowSize
		print("[RoBridgeUI] scrolled " .. sf.Name)
		return {
			path = sf:GetFullName(),
			className = sf.ClassName,
			canvasPosition = { newPos.X, newPos.Y },
			absoluteCanvasSize = { canvas.X, canvas.Y },
			absoluteWindowSize = { window.X, window.Y },
			method = "CanvasPosition",
			mode = "play",
		}
	elseif action == "list" then
		local pg = player:WaitForChild("PlayerGui")
		local out = {}
		for _, sg in ipairs(pg:GetChildren()) do
			if sg:IsA("LayerCollector") then
				local kids = {}
				for _, c in ipairs(sg:GetDescendants()) do
					if c:IsA("GuiButton") or c:IsA("TextBox") then
						table.insert(kids, {
							name = c.Name,
							className = c.ClassName,
							path = c:GetFullName(),
							text = (c:IsA("TextLabel") or c:IsA("TextButton") or c:IsA("TextBox")) and c.Text or nil,
							visible = c.Visible,
							abs = { c.AbsolutePosition.X, c.AbsolutePosition.Y, c.AbsoluteSize.X, c.AbsoluteSize.Y },
						})
					end
				end
				table.insert(out, { name = sg.Name, className = sg.ClassName, enabled = sg.Enabled, interactive = kids, lastClick = sg:GetAttribute("LastClick") })
			end
		end
		return { playerGui = out, items = out }
	elseif action == "inspect" then
		local inst = resolve(payload.path)
		local node = { name = inst.Name, className = inst.ClassName, path = inst:GetFullName(), lastClick = inst:GetAttribute("LastClick") }
		if inst:IsA("GuiObject") then
			node.visible = inst.Visible
			node.abs = { inst.AbsolutePosition.X, inst.AbsolutePosition.Y, inst.AbsoluteSize.X, inst.AbsoluteSize.Y }
			if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then node.text = inst.Text end
		end
		return node
	elseif action == "click_at" then
		return clickAt(payload.x or 0, payload.y or 0)
	elseif action == "walk_to" then
		return walkTo(payload)
	elseif action == "click_world" then
		return clickWorld(payload)
	elseif action == "walk_and_click" then
		disableFreecam()
		local walk = walkTo(payload)
		task.wait(0.2)
		local click = clickWorld(payload)
		return { walk = walk, click = click }
	elseif action == "key" then
		local vi = virtualInput()
		if not vi then error("VirtualInput unavailable") end
		local key = Enum.KeyCode[payload.key]
		vi:SendKey(true, key, false)
		task.wait(payload.duration or 0.05)
		vi:SendKey(false, key, false)
		return { key = payload.key, method = "VirtualInput" }
	elseif action == "logs" then
		local out = {}
		local limit = payload.limit or 100
		for i = #clientLogs, 1, -1 do
			local e = clientLogs[i]
			local keep = true
			if payload.levelFilter and e.level ~= payload.levelFilter then keep = false end
			if keep and payload.containsFilter and not string.find(e.message, payload.containsFilter, 1, true) then keep = false end
			if keep then
				table.insert(out, e)
				if #out >= limit then break end
			end
		end
		return { items = out, source = "play-client" }
	elseif action == "stop" then
		pcall(function() game:GetService("StudioTestService"):EndTest("stopped_by_robridge") end)
		pcall(function() game:GetService("StudioTestService"):EndTest() end)
		return { stopping = true }
	end
	error("Unknown play action: " .. tostring(action))
end

print("[RoBridge] Play client agent ready")
`;
}
