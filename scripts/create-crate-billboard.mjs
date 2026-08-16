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
local sg = game:GetService("StarterGui"):FindFirstChild("CrateShop")
if sg then sg:Destroy() end
local preview = game:GetService("CoreGui"):FindFirstChild("RoBridgePreview")
if preview then preview:Destroy() end
local box = workspace.HoverBox.Box
for _, c in ipairs(box:GetChildren()) do
  if c:IsA("BillboardGui") or c:IsA("SurfaceGui") then c:Destroy() end
end
local rs = game:GetService("ReplicatedStorage")
local ev = rs:FindFirstChild("CrateShopAction")
if not ev then
  ev = Instance.new("RemoteEvent")
  ev.Name = "CrateShopAction"
  ev.Parent = rs
end
local old = rs:FindFirstChild("CrateShopOpen")
if old then old:Destroy() end
local sps = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
local stale = sps and sps:FindFirstChild("CrateBillboardClient")
if stale then stale:Destroy() end
return { cleaned = true }
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
    MaxDistance: 60,
    Size: [0, 200, 0, 136],
    StudsOffset: [0, 8.4, 0],
    ZIndexBehavior: "Sibling",
    ClipsDescendants: false,
  },
  children: [
    {
      className: "Frame",
      name: "Panel",
      properties: {
        Size: [1, -20, 1, -20],
        Position: [0.5, 0, 0.5, 0],
        AnchorPoint: [0.5, 0.5],
        BackgroundColor3: "#ffcf4a",
        BorderSizePixel: 0,
      },
      children: [
        corner(22),
        stroke("#2b1b0e", 5),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
        {
          className: "TextLabel",
          name: "Title",
          properties: {
            Size: [1, -20, 0, 52],
            Position: [0, 10, 0, 10],
            BackgroundColor3: "#ff4d3a",
            Text: "MYSTERY CRATE",
            TextColor3: "#fff8e7",
            TextSize: 22,
            Font: "FredokaOne",
            BorderSizePixel: 0,
          },
          children: [corner(14), stroke("#2b1b0e", 3)],
        },
        {
          className: "TextLabel",
          name: "Icon",
          properties: {
            Size: [0, 90, 0, 90],
            Position: [0.5, -45, 0, 74],
            BackgroundColor3: "#ff9430",
            Text: "📦",
            TextSize: 48,
            Font: "GothamBold",
            BorderSizePixel: 0,
          },
          children: [corner(18), stroke("#2b1b0e", 4)],
        },
        {
          className: "TextLabel",
          name: "Blurb",
          properties: {
            Size: [1, -24, 0, 40],
            Position: [0, 12, 0, 172],
            BackgroundTransparency: 1,
            Text: "Grab this wacky crate?",
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
            Size: [1, -20, 0, 30],
            Position: [0, 10, 0, 210],
            BackgroundTransparency: 1,
            Text: "★  250",
            TextColor3: "#e08a00",
            TextSize: 24,
            Font: "FredokaOne",
          },
        },
        {
          className: "TextButton",
          name: "Buy",
          properties: {
            Size: [0.42, 0, 0, 44],
            Position: [0.06, 0, 1, -58],
            BackgroundColor3: "#5ad36a",
            Text: "BUY!",
            TextColor3: "#ffffff",
            TextSize: 20,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
          },
          children: [corner(12), stroke("#2b1b0e", 3)],
        },
        {
          className: "TextButton",
          name: "Close",
          properties: {
            Size: [0.42, 0, 0, 44],
            Position: [0.52, 0, 1, -58],
            BackgroundColor3: "#ff4d3a",
            Text: "NOPE",
            TextColor3: "#ffffff",
            TextSize: 20,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
          },
          children: [corner(12), stroke("#2b1b0e", 3)],
        },
      ],
    },
  ],
};

const created = await call("manage_ui", {
  action: "create_tree",
  parentPath: "game.Workspace.HoverBox.Box",
  tree,
});
console.log("billboard", created.parent, created.root);

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
local blurb = panel:WaitForChild("Blurb")
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
local PRICE = 250

local hovering = 0
local tapping = false
local bought = false
local boxCF, stripeCF, lidCF = box.CFrame, stripe.CFrame, lid.CFrame

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
	billboard.Enabled = true
	pop.Scale = 0.4
	play(pop, 0.4, Enum.EasingStyle.Back, { Scale = 1 })
end

local function hideBillboard()
	play(pop, 0.16, Enum.EasingStyle.Back, { Scale = 0.35 })
	task.delay(0.16, function()
		if pop.Scale < 0.5 then
			billboard.Enabled = false
			pop.Scale = 1
		end
	end)
end

local function markBought()
	bought = true
	priceLabel.Text = "OWNED!"
	priceLabel.TextColor3 = Color3.fromRGB(42, 140, 72)
	buyBtn.Text = "YOURS"
	buyBtn.BackgroundColor3 = Color3.fromRGB(160, 160, 160)
	blurb.Text = "Nice! It's yours."
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
	showBillboard()
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

action.OnServerEvent:Connect(function(player, kind)
	if kind == "close" then
		hideBillboard()
	elseif kind == "buy" then
		if bought then return end
		print("[CrateShop] " .. player.Name .. " bought Mystery Crate")
		markBought()
		task.delay(1.1, hideBillboard)
	end
end)
`;

await call("manage_scripts", {
  action: "set_source",
  path: "game.Workspace.HoverBox.HoverTap",
  source: serverSource,
});

const clientSource = `local ReplicatedStorage = game:GetService("ReplicatedStorage")
local action = ReplicatedStorage:WaitForChild("CrateShopAction")
local box = workspace:WaitForChild("HoverBox"):WaitForChild("Box")
local billboard = box:WaitForChild("CrateBillboard")
local panel = billboard:WaitForChild("Panel")
local buy = panel:WaitForChild("Buy")
local close = panel:WaitForChild("Close")

buy.Activated:Connect(function()
	action:FireServer("buy")
end)
close.Activated:Connect(function()
	action:FireServer("close")
end)
`;

await call("manage_scripts", {
  action: "create",
  className: "LocalScript",
  parentPath: "game.StarterPlayer.StarterPlayerScripts",
  name: "CrateBillboardClient",
  source: clientSource,
});

console.log("billboard shop ready");
