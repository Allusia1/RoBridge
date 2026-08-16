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
function pad(n = 12) {
  return {
    className: "UIPadding",
    properties: {
      PaddingTop: [0, n],
      PaddingBottom: [0, n],
      PaddingLeft: [0, n],
      PaddingRight: [0, n],
    },
  };
}

function itemCard({ name, title, emoji, price, accent, layoutOrder }) {
  return {
    className: "Frame",
    name,
    properties: {
      Size: [0.23, 0, 1, 0],
      BackgroundColor3: "#fff6d8",
      BorderSizePixel: 0,
      LayoutOrder: layoutOrder,
    },
    children: [
      corner(18),
      stroke("#2b1b0e", 4),
      {
        className: "UIScale",
        name: "HoverScale",
        properties: { Scale: 1 },
      },
      {
        className: "Frame",
        name: "Banner",
        properties: {
          Size: [1, 0, 0, 10],
          BackgroundColor3: accent,
          BorderSizePixel: 0,
        },
        children: [corner(18)],
      },
      {
        className: "TextLabel",
        name: "Emoji",
        properties: {
          Size: [1, 0, 0, 72],
          Position: [0, 0, 0, 18],
          BackgroundTransparency: 1,
          Text: emoji,
          TextSize: 48,
          Font: "GothamBold",
        },
      },
      {
        className: "TextLabel",
        name: "Title",
        properties: {
          Size: [1, -16, 0, 28],
          Position: [0, 8, 0, 92],
          BackgroundTransparency: 1,
          Text: title,
          TextColor3: "#2b1b0e",
          TextSize: 18,
          Font: "FredokaOne",
          TextWrapped: true,
        },
      },
      {
        className: "TextLabel",
        name: "Price",
        properties: {
          Size: [1, -16, 0, 24],
          Position: [0, 8, 0, 122],
          BackgroundTransparency: 1,
          Text: `${price}  ★`,
          TextColor3: "#e08a00",
          TextSize: 16,
          Font: "GothamBold",
        },
      },
      {
        className: "TextButton",
        name: "Buy",
        properties: {
          Size: [0.82, 0, 0, 40],
          Position: [0.09, 0, 1, -52],
          BackgroundColor3: accent,
          Text: "BUY!",
          TextColor3: "#ffffff",
          TextSize: 20,
          Font: "FredokaOne",
          AutoButtonColor: false,
          BorderSizePixel: 0,
        },
        children: [corner(12), stroke("#2b1b0e", 3)],
      },
    ],
  };
}

const tree = {
  className: "Frame",
  name: "Root",
  properties: {
    Size: [1, 0, 1, 0],
    BackgroundTransparency: 1,
    BorderSizePixel: 0,
  },
  children: [
    {
      className: "Frame",
      name: "Dimmer",
      properties: {
        Size: [1, 0, 1, 0],
        BackgroundColor3: "#120c1c",
        BackgroundTransparency: 0.35,
        BorderSizePixel: 0,
      },
    },
    {
      className: "Frame",
      name: "Panel",
      properties: {
        Size: [0.72, 0, 0.68, 0],
        Position: [0.14, 0, 0.16, 0],
        BackgroundColor3: "#ffcf4a",
        BorderSizePixel: 0,
      },
      children: [
        corner(28),
        stroke("#2b1b0e", 6),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
        {
          className: "UIGradient",
          properties: {
            Color: [
              { time: 0, color: "#ffd95c" },
              { time: 1, color: "#ffb02e" },
            ],
            Rotation: 90,
          },
        },
        {
          className: "Frame",
          name: "Header",
          properties: {
            Size: [1, -28, 0, 72],
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
                Size: [0.7, 0, 1, 0],
                Position: [0.04, 0, 0, 0],
                BackgroundTransparency: 1,
                Text: "ITEM SHOP",
                TextColor3: "#fff8e7",
                TextSize: 36,
                Font: "FredokaOne",
                TextXAlignment: "Left",
              },
            },
            {
              className: "TextLabel",
              name: "Subtitle",
              properties: {
                Size: [0.7, 0, 0, 18],
                Position: [0.04, 0, 1, -22],
                BackgroundTransparency: 1,
                Text: "Today's wacky deals!",
                TextColor3: "#ffe7c2",
                TextSize: 14,
                Font: "GothamBold",
                TextXAlignment: "Left",
              },
            },
            {
              className: "Frame",
              name: "Coins",
              properties: {
                Size: [0, 150, 0, 44],
                Position: [1, -168, 0.5, -22],
                BackgroundColor3: "#ffe27a",
                BorderSizePixel: 0,
              },
              children: [
                corner(22),
                stroke("#2b1b0e", 3),
                {
                  className: "TextLabel",
                  name: "Amount",
                  properties: {
                    Size: [1, 0, 1, 0],
                    BackgroundTransparency: 1,
                    Text: "★  1,250",
                    TextColor3: "#2b1b0e",
                    TextSize: 20,
                    Font: "FredokaOne",
                  },
                },
              ],
            },
          ],
        },
        {
          className: "Frame",
          name: "Shelf",
          properties: {
            Size: [1, -36, 0, 250],
            Position: [0, 18, 0, 102],
            BackgroundTransparency: 1,
            BorderSizePixel: 0,
          },
          children: [
            {
              className: "UIListLayout",
              properties: {
                FillDirection: "Horizontal",
                HorizontalAlignment: "Center",
                VerticalAlignment: "Center",
                Padding: [0, 14],
                SortOrder: "LayoutOrder",
              },
            },
            itemCard({
              name: "SwordCard",
              title: "Super Sword",
              emoji: "⚔",
              price: 150,
              accent: "#ff5a4d",
              layoutOrder: 1,
            }),
            itemCard({
              name: "PetCard",
              title: "Lucky Pet",
              emoji: "🐾",
              price: 300,
              accent: "#5ad36a",
              layoutOrder: 2,
            }),
            itemCard({
              name: "SodaCard",
              title: "Speed Soda",
              emoji: "🥤",
              price: 80,
              accent: "#4ec6ff",
              layoutOrder: 3,
            }),
            itemCard({
              name: "WandCard",
              title: "Magic Wand",
              emoji: "✨",
              price: 220,
              accent: "#b56bff",
              layoutOrder: 4,
            }),
          ],
        },
        {
          className: "TextLabel",
          name: "Footer",
          properties: {
            Size: [1, -40, 0, 28],
            Position: [0, 20, 1, -44],
            BackgroundTransparency: 1,
            Text: "Tap BUY!  ·  New stock every day",
            TextColor3: "#6a3d12",
            TextSize: 16,
            Font: "GothamBold",
          },
        },
        {
          className: "TextButton",
          name: "Close",
          properties: {
            Size: [0, 48, 0, 48],
            Position: [1, -22, 0, -18],
            AnchorPoint: [0.5, 0.5],
            BackgroundColor3: "#ff4d3a",
            Text: "X",
            TextColor3: "#ffffff",
            TextSize: 24,
            Font: "FredokaOne",
            AutoButtonColor: false,
            BorderSizePixel: 0,
            ZIndex: 5,
          },
          children: [corner(24), stroke("#2b1b0e", 4)],
        },
      ],
    },
  ],
};

const animSource = `local TweenService = game:GetService("TweenService")
local gui = script.Parent
local dimmer = gui:WaitForChild("Root"):WaitForChild("Dimmer")
local panel = gui.Root:WaitForChild("Panel")
local pop = panel:WaitForChild("PopScale")
local header = panel:WaitForChild("Header")
local title = header:WaitForChild("Title")
local coins = header:WaitForChild("Coins")
local shelf = panel:WaitForChild("Shelf")
local close = panel:WaitForChild("Close")

local function tween(inst, info, props)
	local t = TweenService:Create(inst, info, props)
	t:Play()
	return t
end

local popInfo = TweenInfo.new(0.55, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
local fadeInfo = TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local bounceInfo = TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
local hoverInfo = TweenInfo.new(0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

dimmer.BackgroundTransparency = 1
pop.Scale = 0.45
panel.Rotation = -6
tween(dimmer, fadeInfo, { BackgroundTransparency = 0.35 })
tween(pop, popInfo, { Scale = 1 })
tween(panel, popInfo, { Rotation = 0 })

task.delay(0.15, function()
	tween(coins, TweenInfo.new(0.4, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out), { Size = UDim2.new(0, 150, 0, 44) })
end)

local cards = {}
for _, child in ipairs(shelf:GetChildren()) do
	if child:IsA("Frame") then
		table.insert(cards, child)
	end
end
table.sort(cards, function(a, b) return a.LayoutOrder < b.LayoutOrder end)

for i, card in ipairs(cards) do
	card.BackgroundTransparency = 1
	for _, d in ipairs(card:GetDescendants()) do
		if d:IsA("TextLabel") or d:IsA("TextButton") then
			d.TextTransparency = 1
		elseif d:IsA("GuiObject") and d.Name ~= "HoverScale" then
			d.BackgroundTransparency = math.clamp(d.BackgroundTransparency + 1, 0, 1)
		end
	end
	task.delay(0.12 + i * 0.08, function()
		tween(card, bounceInfo, { BackgroundTransparency = 0 })
		for _, d in ipairs(card:GetDescendants()) do
			if d:IsA("TextLabel") or d:IsA("TextButton") then
				tween(d, bounceInfo, { TextTransparency = 0 })
			elseif d:IsA("Frame") or d:IsA("TextButton") then
				tween(d, bounceInfo, { BackgroundTransparency = 0 })
			end
		end
	end)
end

task.spawn(function()
	while title.Parent do
		tween(title, TweenInfo.new(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Rotation = 2 }):Wait()
		tween(title, TweenInfo.new(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Rotation = -2 }):Wait()
	end
end)

task.spawn(function()
	local amount = coins:FindFirstChild("Amount")
	while coins.Parent do
		tween(coins, TweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Rotation = 3 }):Wait()
		tween(coins, TweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Rotation = -3 }):Wait()
		if amount then
			tween(amount, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = 22 })
			task.wait(0.18)
			tween(amount, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { TextSize = 20 })
		end
	end
end)

local function hookHover(card)
	local scale = card:FindFirstChild("HoverScale")
	if not scale then return end
	card.MouseEnter:Connect(function()
		tween(scale, hoverInfo, { Scale = 1.07 })
		tween(card, hoverInfo, { Rotation = -2 })
	end)
	card.MouseLeave:Connect(function()
		tween(scale, hoverInfo, { Scale = 1 })
		tween(card, hoverInfo, { Rotation = 0 })
	end)
end

local function hookBuy(btn)
	btn.MouseButton1Down:Connect(function()
		tween(btn, TweenInfo.new(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = UDim2.new(0.76, 0, 0, 36) })
	end)
	btn.MouseButton1Up:Connect(function()
		tween(btn, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Size = UDim2.new(0.82, 0, 0, 40) })
	end)
	btn.Activated:Connect(function()
		local card = btn.Parent
		local titleLbl = card:FindFirstChild("Title")
		local name = titleLbl and titleLbl.Text or card.Name
		print("[RoBridgeShop] Bought " .. name)
		tween(card, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Rotation = 6 })
		task.wait(0.12)
		tween(card, TweenInfo.new(0.28, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out), { Rotation = 0 })
	end)
end

for _, card in ipairs(cards) do
	hookHover(card)
	local buy = card:FindFirstChild("Buy")
	if buy then hookBuy(buy) end
end

close.Activated:Connect(function()
	tween(pop, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.In), { Scale = 0.4 })
	tween(panel, TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Rotation = 8 })
	tween(dimmer, fadeInfo, { BackgroundTransparency = 1 })
	task.wait(0.22)
	gui.Enabled = false
end)
`;

const created = await call("manage_ui", {
  action: "create_tree",
  screenGuiName: "RoBridgeShop",
  tree,
});
console.log("created", created.parent, created.instanceCount);

await call("manage_scripts", {
  action: "create",
  className: "LocalScript",
  parentPath: "game.StarterGui.RoBridgeShop",
  name: "ShopAnims",
  source: animSource,
});
console.log("anims attached");

const preview = await call("manage_ui", { action: "preview", path: "game.StarterGui.RoBridgeShop" });
console.log("preview", preview.previewed);

const check = await call("manage_ui", { action: "check", path: "game.StarterGui.RoBridgeShop" });
console.log("check", check.issueCount, "issues");
