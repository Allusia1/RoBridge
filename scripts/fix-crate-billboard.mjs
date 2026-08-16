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

function corner(r) {
  return { className: "UICorner", properties: { CornerRadius: [0, r] } };
}
function stroke(color, thickness) {
  return { className: "UIStroke", properties: { Color: color, Thickness: thickness, ApplyStrokeMode: "Border" } };
}

await call("execute_luau", {
  code: `
local preview = game:GetService("CoreGui"):FindFirstChild("RoBridgePreview")
if preview then preview:Destroy() end
local sg = game:GetService("StarterGui"):FindFirstChild("CrateShop")
if sg then sg:Destroy() end
local box = workspace.HoverBox.Box
for _, c in ipairs(box:GetChildren()) do
  if c:IsA("LayerCollector") then c:Destroy() end
end
return { cleared = true }
`,
});

const tree = {
  className: "BillboardGui",
  name: "CrateBillboard",
  properties: {
    Active: true,
    AlwaysOnTop: true,
    Enabled: false,
    LightInfluence: 0,
    MaxDistance: 40,
    Size: [0, 200, 0, 136],
    StudsOffset: [0, 5.1, 0],
    ZIndexBehavior: "Sibling",
    ClipsDescendants: false,
  },
  children: [
    {
      className: "Frame",
      name: "Shadow",
      properties: {
        Size: [1, -20, 1, -20],
        Position: [0.5, 6, 0.5, 8],
        AnchorPoint: [0.5, 0.5],
        BackgroundColor3: "#1a1208",
        BackgroundTransparency: 0.45,
        BorderSizePixel: 0,
        ZIndex: 0,
      },
      children: [corner(18)],
    },
    {
      className: "Frame",
      name: "Panel",
      properties: {
        Size: [1, -20, 1, -20],
        Position: [0.5, 0, 0.5, 0],
        AnchorPoint: [0.5, 0.5],
        BackgroundColor3: "#fff4d2",
        BorderSizePixel: 0,
        ZIndex: 1,
      },
      children: [
        corner(18),
        stroke("#3a2412", 3),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
        {
          className: "Frame",
          name: "Accent",
          properties: {
            Size: [1, 0, 0, 10],
            BackgroundColor3: "#ff7a2f",
            BorderSizePixel: 0,
            ZIndex: 2,
          },
          children: [corner(18)],
        },
        {
          className: "TextLabel",
          name: "Title",
          properties: {
            Size: [1, -20, 0, 28],
            Position: [0, 10, 0, 18],
            BackgroundTransparency: 1,
            Text: "Mystery Crate",
            TextColor3: "#3a2412",
            TextSize: 22,
            Font: "FredokaOne",
            ZIndex: 2,
          },
        },
        {
          className: "TextLabel",
          name: "Price",
          properties: {
            Size: [1, -20, 0, 26],
            Position: [0, 10, 0, 46],
            BackgroundTransparency: 1,
            Text: "250 Stars",
            TextColor3: "#d88900",
            TextSize: 18,
            Font: "GothamBold",
            ZIndex: 2,
          },
        },
        {
          className: "TextButton",
          name: "Buy",
          properties: {
            Size: [1, -28, 0, 40],
            Position: [0, 14, 1, -52],
            BackgroundColor3: "#3ecf6a",
            Text: "Buy",
            TextColor3: "#ffffff",
            TextSize: 20,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
            ZIndex: 2,
          },
          children: [corner(12), stroke("#3a2412", 2)],
        },
      ],
    },
  ],
};

await call("manage_ui", {
  action: "create_tree",
  parentPath: "game.Workspace.HoverBox.Box",
  tree,
});

const serverSource = `local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local model = script.Parent
local box = model:WaitForChild("Box")
local stripe = model:WaitForChild("Stripe")
local lid = model:WaitForChild("Lid")
local glow = model:WaitForChild("HoverGlow")
local click = box:WaitForChild("ClickDetector")
local billboard = box:WaitForChild("CrateBillboard")
local panel = billboard:WaitForChild("Panel")
local pop = panel:WaitForChild("PopScale")
local priceLabel = panel:WaitForChild("Price")
local buyBtn = panel:WaitForChild("Buy")
local action = ReplicatedStorage:WaitForChild("CrateShopAction")

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
local open = false
local bought = false
local boxCF, stripeCF, lidCF = box.CFrame, stripe.CFrame, lid.CFrame

billboard.Enabled = false

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

local function showBillboard()
	open = true
	billboard.Enabled = true
	pop.Scale = 0.35
	play(pop, 0.28, Enum.EasingStyle.Back, { Scale = 1 })
end

local function hideBillboard()
	open = false
	play(pop, 0.14, Enum.EasingStyle.Quad, { Scale = 0.3 })
	task.delay(0.14, function()
		if not open then
			billboard.Enabled = false
			pop.Scale = 1
		end
	end)
end

local function playTap()
	play(box, 0.08, Enum.EasingStyle.Quad, {
		Size = Vector3.new(BASE.box.X * 1.22, BASE.box.Y * 0.52, BASE.box.Z * 1.22),
		CFrame = boxCF * CFrame.new(0, -0.7, 0),
	})
	play(stripe, 0.08, Enum.EasingStyle.Quad, {
		Size = Vector3.new(BASE.stripe.X * 1.22, BASE.stripe.Y * 0.7, BASE.stripe.Z * 1.22),
		CFrame = stripeCF * CFrame.new(0, -0.7, 0),
	})
	play(lid, 0.08, Enum.EasingStyle.Quad, {
		Size = Vector3.new(BASE.lid.X * 1.18, BASE.lid.Y, BASE.lid.Z * 1.18),
		CFrame = lidCF * CFrame.new(0, -1.15, 0),
	})
	task.wait(0.08)
	play(box, 0.35, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.box or BASE.box,
		CFrame = hovering > 0 and (boxCF * CFrame.new(0, 0.45, 0)) or boxCF,
		Color = hovering > 0 and HOVER_COLOR or BOX_COLOR,
	})
	play(stripe, 0.35, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.stripe or BASE.stripe,
		CFrame = hovering > 0 and (stripeCF * CFrame.new(0, 0.45, 0)) or stripeCF,
	})
	play(lid, 0.35, Enum.EasingStyle.Elastic, {
		Size = hovering > 0 and HOVER.lid or BASE.lid,
		CFrame = hovering > 0 and (lidCF * CFrame.new(0, 0.45, 0) * CFrame.Angles(0, math.rad(8), 0)) or lidCF,
	})
	task.wait(0.28)
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
	if open then
		hideBillboard()
	else
		showBillboard()
	end
	playTap()
	tapping = false
end)

action.OnServerEvent:Connect(function(player, kind)
	if kind == "close" then
		hideBillboard()
	elseif kind == "buy" then
		if bought then return end
		bought = true
		print("[CrateShop] " .. player.Name .. " bought Mystery Crate")
		priceLabel.Text = "Owned"
		priceLabel.TextColor3 = Color3.fromRGB(42, 140, 72)
		buyBtn.Text = "Yours"
		buyBtn.BackgroundColor3 = Color3.fromRGB(170, 170, 170)
		task.delay(0.7, hideBillboard)
	end
end)
`;

await call("manage_scripts", {
  action: "set_source",
  path: "game.Workspace.HoverBox.HoverTap",
  source: serverSource,
});

await call("manage_scripts", {
  action: "set_source",
  path: "game.StarterPlayer.StarterPlayerScripts.CrateBillboardClient",
  source: `local ReplicatedStorage = game:GetService("ReplicatedStorage")
local action = ReplicatedStorage:WaitForChild("CrateShopAction")
local box = workspace:WaitForChild("HoverBox"):WaitForChild("Box")
local billboard = box:WaitForChild("CrateBillboard")
local buy = billboard:WaitForChild("Panel"):WaitForChild("Buy")

buy.Activated:Connect(function()
	action:FireServer("buy")
end)
`,
});

const state = await call("execute_luau", {
  code: `local bb=workspace.HoverBox.Box.CrateBillboard
bb.Enabled=false
return {enabled=bb.Enabled,size=RB.encode(bb.Size)}`,
});
console.log(state);
