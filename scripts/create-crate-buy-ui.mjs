const BASE = `http://127.0.0.1:${process.env.ROBRIDGE_PORT ?? 3737}`;

async function call(tool, args) {
  const res = await fetch(`${BASE}/api/tool`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || JSON.stringify(data));
  return data.result;
}

function corner(r = 16) {
  return { className: "UICorner", properties: { CornerRadius: [0, r] } };
}
function stroke(color = "#2b1b0e", thickness = 4) {
  return { className: "UIStroke", properties: { Color: color, Thickness: thickness, ApplyStrokeMode: "Border" } };
}

await call("execute_luau", {
  code: `
local rs = game:GetService("ReplicatedStorage")
local ev = rs:FindFirstChild("CrateShopOpen")
if not ev then
  ev = Instance.new("RemoteEvent")
  ev.Name = "CrateShopOpen"
  ev.Parent = rs
end
for _, name in ipairs({"CrateShop", "RoBridgeShop"}) do
  local g = game:GetService("StarterGui"):FindFirstChild(name)
  if g then g:Destroy() end
end
local p = game:GetService("CoreGui"):FindFirstChild("RoBridgePreview")
if p then p:Destroy() end
return { remote = ev:GetFullName() }
`,
});

const tree = {
  className: "Frame",
  name: "Root",
  properties: {
    Size: [1, 0, 1, 0],
    BackgroundTransparency: 1,
    Visible: false,
    BorderSizePixel: 0,
  },
  children: [
    {
      className: "Frame",
      name: "Dimmer",
      properties: {
        Size: [1, 0, 1, 0],
        BackgroundColor3: "#120c1c",
        BackgroundTransparency: 0.4,
        BorderSizePixel: 0,
      },
    },
    {
      className: "Frame",
      name: "Panel",
      properties: {
        Size: [0, 420, 0, 460],
        Position: [0.5, 0, 0.5, 0],
        AnchorPoint: [0.5, 0.5],
        BackgroundColor3: "#ffcf4a",
        BorderSizePixel: 0,
      },
      children: [
        corner(28),
        stroke("#2b1b0e", 6),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
        {
          className: "Frame",
          name: "Header",
          properties: {
            Size: [1, -28, 0, 78],
            Position: [0, 14, 0, 14],
            BackgroundColor3: "#ff4d3a",
            BorderSizePixel: 0,
          },
          children: [
            corner(20),
            stroke("#2b1b0e", 4),
            {
              className: "TextLabel",
              name: "Title",
              properties: {
                Size: [1, -20, 1, 0],
                BackgroundTransparency: 1,
                Text: "MYSTERY CRATE",
                TextColor3: "#fff8e7",
                TextSize: 30,
                Font: "FredokaOne",
              },
            },
          ],
        },
        {
          className: "Frame",
          name: "Preview",
          properties: {
            Size: [0, 150, 0, 150],
            Position: [0.5, 0, 0, 118],
            AnchorPoint: [0.5, 0],
            BackgroundColor3: "#ff9430",
            BorderSizePixel: 0,
          },
          children: [
            corner(24),
            stroke("#2b1b0e", 5),
            {
              className: "TextLabel",
              name: "Icon",
              properties: {
                Size: [1, 0, 1, 0],
                BackgroundTransparency: 1,
                Text: "📦",
                TextSize: 72,
                Font: "GothamBold",
              },
            },
          ],
        },
        {
          className: "TextLabel",
          name: "Blurb",
          properties: {
            Size: [1, -48, 0, 44],
            Position: [0, 24, 0, 280],
            BackgroundTransparency: 1,
            Text: "A wacky crate sitting on the ground.\nWho knows what's inside?!",
            TextColor3: "#6a3d12",
            TextSize: 16,
            Font: "GothamBold",
            TextWrapped: true,
          },
        },
        {
          className: "TextLabel",
          name: "Price",
          properties: {
            Size: [1, -40, 0, 32],
            Position: [0, 20, 0, 328],
            BackgroundTransparency: 1,
            Text: "★  250",
            TextColor3: "#e08a00",
            TextSize: 26,
            Font: "FredokaOne",
          },
        },
        {
          className: "TextButton",
          name: "Buy",
          properties: {
            Size: [0, 180, 0, 52],
            Position: [0.5, -96, 1, -70],
            BackgroundColor3: "#5ad36a",
            Text: "BUY!",
            TextColor3: "#ffffff",
            TextSize: 24,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
          },
          children: [corner(16), stroke("#2b1b0e", 4)],
        },
        {
          className: "TextButton",
          name: "Close",
          properties: {
            Size: [0, 180, 0, 52],
            Position: [0.5, 16, 1, -70],
            BackgroundColor3: "#ff4d3a",
            Text: "NOPE",
            TextColor3: "#ffffff",
            TextSize: 24,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
          },
          children: [corner(16), stroke("#2b1b0e", 4)],
        },
      ],
    },
  ],
};

const created = await call("manage_ui", {
  action: "create_tree",
  screenGuiName: "CrateShop",
  tree,
});
console.log("ui", created.parent);

const clientSource = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local gui = script.Parent
local root = gui:WaitForChild("Root")
local dimmer = root:WaitForChild("Dimmer")
local panel = root:WaitForChild("Panel")
local pop = panel:WaitForChild("PopScale")
local buy = panel:WaitForChild("Buy")
local close = panel:WaitForChild("Close")
local price = panel:WaitForChild("Price")
local blurb = panel:WaitForChild("Blurb")
local openEvent = ReplicatedStorage:WaitForChild("CrateShopOpen")

local PRICE = 250
local coins = 1250
local open = false
local bought = false

local function tween(inst, time, style, dir, props)
	local t = TweenService:Create(inst, TweenInfo.new(time, style, dir), props)
	t:Play()
	return t
end

local function hide()
	if not open then return end
	open = false
	tween(pop, 0.18, Enum.EasingStyle.Back, Enum.EasingDirection.In, { Scale = 0.4 })
	tween(panel, 0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.In, { Rotation = 8 })
	tween(dimmer, 0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.In, { BackgroundTransparency = 1 })
	task.wait(0.18)
	if not open then root.Visible = false end
end

local function show()
	open = true
	root.Visible = true
	pop.Scale = 0.45
	panel.Rotation = -7
	dimmer.BackgroundTransparency = 1
	tween(dimmer, 0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, { BackgroundTransparency = 0.4 })
	tween(pop, 0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out, { Scale = 1 })
	tween(panel, 0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out, { Rotation = 0 })
end

local function refresh()
	if bought then
		price.Text = "OWNED!"
		price.TextColor3 = Color3.fromRGB(42, 140, 72)
		buy.Text = "YOURS"
		buy.BackgroundColor3 = Color3.fromRGB(160, 160, 160)
		blurb.Text = "Nice! The mystery crate is yours.\\nCheck your backpack later."
	else
		price.Text = "★  " .. tostring(PRICE)
		price.TextColor3 = Color3.fromRGB(224, 138, 0)
		buy.Text = "BUY!"
		buy.BackgroundColor3 = Color3.fromRGB(90, 211, 106)
		blurb.Text = "A wacky crate sitting on the ground.\\nWho knows what's inside?!"
	end
end

openEvent.OnClientEvent:Connect(function()
	refresh()
	show()
end)

buy.MouseButton1Down:Connect(function()
	tween(buy, 0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, { Size = UDim2.fromOffset(168, 46) })
end)
buy.MouseButton1Up:Connect(function()
	tween(buy, 0.16, Enum.EasingStyle.Back, Enum.EasingDirection.Out, { Size = UDim2.fromOffset(180, 52) })
end)

buy.Activated:Connect(function()
	if bought then return end
	if coins < PRICE then
		blurb.Text = "Not enough stars! Come back later."
		tween(panel, 0.06, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, { Rotation = 4 })
		task.wait(0.06)
		tween(panel, 0.2, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out, { Rotation = 0 })
		return
	end
	coins -= PRICE
	bought = true
	print("[CrateShop] Bought Mystery Crate")
	refresh()
	tween(panel, 0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, { Rotation = 6 })
	task.wait(0.12)
	tween(panel, 0.3, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out, { Rotation = 0 })
end)

close.Activated:Connect(hide)
dimmer.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 then hide() end
end)

refresh()
`;

await call("manage_scripts", {
  action: "create",
  className: "LocalScript",
  parentPath: "game.StarterGui.CrateShop",
  name: "CrateShopClient",
  source: clientSource,
});

const serverSource = `local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local model = script.Parent
local box = model:WaitForChild("Box")
local stripe = model:WaitForChild("Stripe")
local lid = model:WaitForChild("Lid")
local glow = model:WaitForChild("HoverGlow")
local click = box:WaitForChild("ClickDetector")
local openEvent = ReplicatedStorage:WaitForChild("CrateShopOpen")

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

click.MouseClick:Connect(function(player)
	if tapping then return end
	tapping = true
	print("[HoverBox] tapped")
	if player then
		openEvent:FireClient(player)
	end
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
  action: "set_source",
  path: "game.Workspace.HoverBox.HoverTap",
  source: serverSource,
});

console.log("wired click -> CrateShop UI");
