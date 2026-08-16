const BASE = `http://127.0.0.1:${process.env.ROBRIDGE_PORT ?? 3737}`;

async function call(tool, args, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool, args }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || JSON.stringify(data));
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

const build = await call("execute_luau", {
  code: `
local existing = workspace:FindFirstChild("HoverBox")
if existing then existing:Destroy() end

local groundY = 0
local ok, hit = pcall(function()
  local params = RaycastParams.new()
  params.FilterType = Enum.RaycastFilterType.Exclude
  return workspace:Raycast(Vector3.new(0, 80, 0), Vector3.new(0, -200, 0), params)
end)
if ok and hit then groundY = hit.Position.Y end

local model = Instance.new("Model")
model.Name = "HoverBox"
model.Parent = workspace

local box = Instance.new("Part")
box.Name = "Box"
box.Size = Vector3.new(5, 5, 5)
box.Anchored = true
box.CanCollide = true
box.Material = Enum.Material.SmoothPlastic
box.Color = Color3.fromRGB(255, 148, 48)
box.TopSurface = Enum.SurfaceType.Smooth
box.BottomSurface = Enum.SurfaceType.Smooth
box.CFrame = CFrame.new(0, groundY + 2.5, -8)
box.Parent = model

local stripe = Instance.new("Part")
stripe.Name = "Stripe"
stripe.Size = Vector3.new(5.15, 1.1, 5.15)
stripe.Anchored = true
stripe.CanCollide = false
stripe.Material = Enum.Material.SmoothPlastic
stripe.Color = Color3.fromRGB(255, 214, 74)
stripe.CFrame = box.CFrame
stripe.Parent = model

local lid = Instance.new("Part")
lid.Name = "Lid"
lid.Size = Vector3.new(5.4, 0.7, 5.4)
lid.Anchored = true
lid.CanCollide = false
lid.Material = Enum.Material.SmoothPlastic
lid.Color = Color3.fromRGB(255, 92, 58)
lid.CFrame = box.CFrame * CFrame.new(0, 2.85, 0)
lid.Parent = model

local highlight = Instance.new("Highlight")
highlight.Name = "HoverGlow"
highlight.FillColor = Color3.fromRGB(255, 230, 90)
highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
highlight.FillTransparency = 0.65
highlight.OutlineTransparency = 0.1
highlight.Enabled = false
highlight.Adornee = model
highlight.Parent = model

local click = Instance.new("ClickDetector")
click.Name = "ClickDetector"
click.MaxActivationDistance = 32
click.CursorIcon = ""
click.Parent = box

model.PrimaryPart = box
return { path = model:GetFullName(), position = { box.Position.X, box.Position.Y, box.Position.Z } }
`,
});

console.log("box", build);

const source = `local TweenService = game:GetService("TweenService")
local model = script.Parent
local box = model:WaitForChild("Box")
local stripe = model:WaitForChild("Stripe")
local lid = model:WaitForChild("Lid")
local glow = model:WaitForChild("HoverGlow")
local click = box:WaitForChild("ClickDetector")

local BASE = {
	box = Vector3.new(5, 5, 5),
	stripe = Vector3.new(5.15, 1.1, 5.15),
	lid = Vector3.new(5.4, 0.7, 5.4),
}
local HOVER = {
	box = BASE.box * 1.12,
	stripe = BASE.stripe * 1.12,
	lid = BASE.lid * 1.12,
}
local BOX_COLOR = Color3.fromRGB(255, 148, 48)
local HOVER_COLOR = Color3.fromRGB(255, 196, 64)

local hovering = 0
local tapping = false
local boxCF = box.CFrame
local stripeCF = stripe.CFrame
local lidCF = lid.CFrame

local function play(inst, time, style, props)
	local t = TweenService:Create(inst, TweenInfo.new(time, style, Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

local function setHovered(on)
	glow.Enabled = on
	local sizes = on and HOVER or BASE
	local color = on and HOVER_COLOR or BOX_COLOR
	local lift = on and 0.45 or 0
	play(box, 0.22, Enum.EasingStyle.Back, {
		Size = sizes.box,
		Color = color,
		CFrame = boxCF * CFrame.new(0, lift, 0),
	})
	play(stripe, 0.22, Enum.EasingStyle.Back, {
		Size = sizes.stripe,
		CFrame = stripeCF * CFrame.new(0, lift, 0),
	})
	play(lid, 0.22, Enum.EasingStyle.Back, {
		Size = sizes.lid,
		CFrame = lidCF * CFrame.new(0, lift, 0) * CFrame.Angles(0, math.rad(on and 8 or 0), 0),
	})
end

click.MouseHoverEnter:Connect(function()
	hovering += 1
	if tapping then return end
	setHovered(true)
end)

click.MouseHoverLeave:Connect(function()
	hovering = math.max(0, hovering - 1)
	if tapping or hovering > 0 then return end
	setHovered(false)
end)

click.MouseClick:Connect(function()
	if tapping then return end
	tapping = true
	print("[HoverBox] tapped")
	local squashBox = Vector3.new(BASE.box.X * 1.22, BASE.box.Y * 0.52, BASE.box.Z * 1.22)
	local squashStripe = Vector3.new(BASE.stripe.X * 1.22, BASE.stripe.Y * 0.7, BASE.stripe.Z * 1.22)
	play(box, 0.08, Enum.EasingStyle.Quad, {
		Size = squashBox,
		CFrame = boxCF * CFrame.new(0, -0.7, 0),
	})
	play(stripe, 0.08, Enum.EasingStyle.Quad, {
		Size = squashStripe,
		CFrame = stripeCF * CFrame.new(0, -0.7, 0),
	})
	play(lid, 0.08, Enum.EasingStyle.Quad, {
		Size = Vector3.new(BASE.lid.X * 1.18, BASE.lid.Y, BASE.lid.Z * 1.18),
		CFrame = lidCF * CFrame.new(0, -1.15, 0),
	})
	task.wait(0.08)
	play(box, 0.4, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.box or BASE.box,
		CFrame = hovering > 0 and (boxCF * CFrame.new(0, 0.45, 0)) or boxCF,
		Color = hovering > 0 and HOVER_COLOR or BOX_COLOR,
	})
	play(stripe, 0.4, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.stripe or BASE.stripe,
		CFrame = hovering > 0 and (stripeCF * CFrame.new(0, 0.45, 0)) or stripeCF,
	})
	play(lid, 0.4, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.lid or BASE.lid,
		CFrame = hovering > 0 and (lidCF * CFrame.new(0, 0.45, 0) * CFrame.Angles(0, math.rad(8), 0)) or lidCF,
	})
	task.wait(0.4)
	tapping = false
end)
`;

await call("manage_scripts", {
  action: "create",
  className: "Script",
  parentPath: "game.Workspace.HoverBox",
  name: "HoverTap",
  source,
});

console.log("script attached");
console.log(JSON.stringify(build));
