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

function corner(r) {
  return { className: "UICorner", properties: { CornerRadius: [0, r] } };
}
function stroke(color, thickness) {
  return { className: "UIStroke", properties: { Color: color, Thickness: thickness, ApplyStrokeMode: "Border" } };
}

const setup = await call("execute_luau", {
  code: `
local preview = game:GetService("CoreGui"):FindFirstChild("RoBridgePreview")
if preview then preview:Destroy() end
local sg = game:GetService("StarterGui"):FindFirstChild("CrateShop")
if sg then sg:Destroy() end

local model = workspace:FindFirstChild("HoverBox")
if not model then error("HoverBox missing") end
local box = model:WaitForChild("Box")
local stripe = model:WaitForChild("Stripe")
local lid = model:WaitForChild("Lid")

for _, c in ipairs(box:GetChildren()) do
  if c:IsA("ClickDetector") or c:IsA("LayerCollector") or c:IsA("Attachment") then
    c:Destroy()
  end
end
for _, c in ipairs(model:GetDescendants()) do
  if c:IsA("WeldConstraint") or c:IsA("Weld") or c:IsA("ClickDetector") then
    c:Destroy()
  end
end

-- Restore a clean pose, then weld extras to the box so ScaleTo moves them as one.
if model:GetScale() ~= 1 then
  pcall(function() model:ScaleTo(1) end)
end
box.Anchored = true
box.Size = Vector3.new(5, 5, 5)
box.Color = Color3.fromRGB(255, 148, 48)
stripe.Size = Vector3.new(5.15, 1.1, 5.15)
stripe.CFrame = box.CFrame
lid.Size = Vector3.new(5.4, 0.7, 5.4)
lid.CFrame = box.CFrame * CFrame.new(0, 2.85, 0)
stripe.Anchored = false
lid.Anchored = false
stripe.CanCollide = false
lid.CanCollide = false
local w1 = Instance.new("WeldConstraint")
w1.Part0 = box
w1.Part1 = stripe
w1.Parent = box
local w2 = Instance.new("WeldConstraint")
w2.Part0 = box
w2.Part1 = lid
w2.Parent = box
model.PrimaryPart = box
model:SetAttribute("ShopOpen", false)
model:SetAttribute("ShopBought", false)

local att = Instance.new("Attachment")
att.Name = "BillboardAtt"
att.Position = Vector3.new(0, 4.6, 0)
att.Parent = box

local rs = game:GetService("ReplicatedStorage")
local ev = rs:FindFirstChild("CrateShopAction")
if not ev then
  ev = Instance.new("RemoteEvent")
  ev.Name = "CrateShopAction"
  ev.Parent = rs
end
local staleOpen = rs:FindFirstChild("CrateShopOpen")
if staleOpen then staleOpen:Destroy() end

return { ok = true, box = box:GetFullName(), att = att:GetFullName() }
`,
});
console.log("setup", setup);

const tree = {
  className: "BillboardGui",
  name: "CrateBillboard",
  properties: {
    Active: true,
    AlwaysOnTop: true,
    Enabled: false,
    LightInfluence: 0,
    MaxDistance: 45,
    // Offset pixels stay constant on screen; scale (studs) grows/shrinks with camera.
    Size: [0, 200, 0, 136],
    StudsOffset: [0, 0, 0],
    ZIndexBehavior: "Sibling",
    ClipsDescendants: false,
  },
  children: [
    {
      className: "Frame",
      name: "Border",
      properties: {
        // Brown backing is the only outer edge. A cream fill + UIStroke
        // on a full-bleed BillboardGui anti-aliases into a white halo.
        AnchorPoint: [0.5, 0.5],
        Position: [0.5, 0, 0.5, 0],
        Size: [1, -12, 1, -12],
        BackgroundColor3: "#2b1a0d",
        BorderSizePixel: 0,
        ZIndex: 0,
      },
      children: [
        corner(16),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
      ],
    },
    {
      className: "Frame",
      name: "Panel",
      properties: {
        AnchorPoint: [0.5, 0.5],
        Position: [0.5, 0, 0.5, 0],
        Size: [1, -18, 1, -18],
        BackgroundColor3: "#fff7e4",
        BorderSizePixel: 0,
        ClipsDescendants: false,
        ZIndex: 1,
      },
      children: [
        corner(13),
        { className: "UIScale", name: "PopScale", properties: { Scale: 1 } },
        {
          className: "UIListLayout",
          properties: {
            FillDirection: "Vertical",
            HorizontalAlignment: "Center",
            VerticalAlignment: "Center",
            Padding: [0, 8],
            SortOrder: "LayoutOrder",
          },
        },
        {
          className: "UIPadding",
          properties: {
            PaddingTop: [0, 14],
            PaddingBottom: [0, 14],
            PaddingLeft: [0, 16],
            PaddingRight: [0, 16],
          },
        },
        {
          className: "TextLabel",
          name: "Title",
          properties: {
            Size: [1, 0, 0, 26],
            BackgroundTransparency: 1,
            Text: "Mystery Crate",
            TextColor3: "#2b1a0d",
            TextSize: 22,
            Font: "FredokaOne",
            LayoutOrder: 1,
          },
        },
        {
          className: "TextLabel",
          name: "Price",
          properties: {
            Size: [1, 0, 0, 22],
            BackgroundTransparency: 1,
            Text: "250 Stars",
            TextColor3: "#c67a00",
            TextSize: 16,
            Font: "GothamBold",
            LayoutOrder: 2,
          },
        },
        {
          className: "TextButton",
          name: "Buy",
          properties: {
            Size: [1, 0, 0, 38],
            BackgroundColor3: "#2fbf5a",
            Text: "Buy",
            TextColor3: "#ffffff",
            TextSize: 20,
            Font: "FredokaOne",
            AutoButtonColor: true,
            BorderSizePixel: 0,
            LayoutOrder: 3,
          },
          children: [corner(10), stroke("#2b1a0d", 2)],
        },
      ],
    },
  ],
};

await call("manage_ui", {
  action: "create_tree",
  parentPath: "game.Workspace.HoverBox.Box.BillboardAtt",
  tree,
});

const serverSource = `local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local model = script.Parent
local box = model:WaitForChild("Box")
local glow = model:WaitForChild("HoverGlow")
local att = box:WaitForChild("BillboardAtt")
local billboard = att:WaitForChild("CrateBillboard")
local panel = billboard:WaitForChild("Panel")
local pop = panel:WaitForChild("PopScale")
local priceLabel = panel:WaitForChild("Price")
local buyBtn = panel:WaitForChild("Buy")
local action = ReplicatedStorage:WaitForChild("CrateShopAction", 10)

local basePivot = model:GetPivot()
local hovering = 0
local busy = false
local open = false
local bought = false

billboard.Enabled = false
model:SetAttribute("ShopOpen", false)
pcall(function()
  if model.GetScale then model:ScaleTo(1) end
end)

local function setGlow(on)
  glow.Enabled = on
end

local function setScale(scale, lift)
  if model.ScaleTo then
    model:ScaleTo(scale)
  end
  model:PivotTo(basePivot * CFrame.new(0, lift, 0))
end

local function hoverPose()
  setGlow(true)
  setScale(1.1, 0.35)
end

local function restPose()
  setGlow(false)
  setScale(1, 0)
end

local function setPops(scale)
  for _, inst in ipairs(billboard:GetDescendants()) do
    if inst:IsA("UIScale") then
      inst.Scale = scale
    end
  end
end

local function tweenPops(fromScale, toScale, info)
  for _, inst in ipairs(billboard:GetDescendants()) do
    if inst:IsA("UIScale") then
      if fromScale ~= nil then
        inst.Scale = fromScale
      end
      TweenService:Create(inst, info, { Scale = toScale }):Play()
    end
  end
end

local function showShop()
  open = true
  model:SetAttribute("ShopOpen", true)
  -- Template stays hidden; PlayerGui clone is the visible shop UI.
  billboard.Enabled = false
  tweenPops(0.4, 1, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out))
end

local function hideShop()
  open = false
  model:SetAttribute("ShopOpen", false)
  tweenPops(nil, 0.35, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In))
  task.delay(0.12, function()
    if not open then
      billboard.Enabled = false
      setPops(1)
    end
  end)
end

local function tap()
  setScale(open and 1.02 or 0.9, open and 0.1 or -0.15)
  task.wait(0.07)
  if hovering > 0 then
    hoverPose()
  else
    restPose()
  end
end

action.OnServerEvent:Connect(function(player, kind)
  if kind == "toggle" then
    if busy then return end
    busy = true
    if open then hideShop() else showShop() end
    tap()
    busy = false
  elseif kind == "buy" then
    if not open or bought then return end
    bought = true
    model:SetAttribute("ShopBought", true)
    print("[CrateShop] " .. player.Name .. " bought Mystery Crate")
    priceLabel.Text = "Owned"
    priceLabel.TextColor3 = Color3.fromRGB(46, 140, 74)
    buyBtn.Text = "Yours"
    buyBtn.BackgroundColor3 = Color3.fromRGB(168, 168, 168)
    buyBtn.Active = false
    task.delay(0.6, hideShop)
  end
end)
`;

await call("manage_scripts", {
  action: "set_source",
  path: "game.Workspace.HoverBox.HoverTap",
  source: serverSource,
});

const clientSource = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local mouse = player:GetMouse()
local action = ReplicatedStorage:WaitForChild("CrateShopAction")
local model = workspace:WaitForChild("HoverBox")
local box = model:WaitForChild("Box")
local att = box:WaitForChild("BillboardAtt")
local worldBoard = att:WaitForChild("CrateBillboard")

-- Clone into PlayerGui so button clicks are real GUI input, not 3D clicks.
local gui = player:WaitForChild("PlayerGui")
local old = gui:FindFirstChild("CrateBillboard")
if old then old:Destroy() end
local billboard = worldBoard:Clone()
billboard.Enabled = false
billboard.Adornee = att
billboard.Parent = gui
worldBoard.Enabled = false

local panel = billboard:WaitForChild("Panel")
local buy = panel:WaitForChild("Buy")
local pop = panel:WaitForChild("PopScale")
local priceLabel = panel:WaitForChild("Price")

local function setPops(scale)
  for _, inst in ipairs(billboard:GetDescendants()) do
    if inst:IsA("UIScale") then
      inst.Scale = scale
    end
  end
end

local function tweenPops(fromScale, toScale, info)
  for _, inst in ipairs(billboard:GetDescendants()) do
    if inst:IsA("UIScale") then
      if fromScale ~= nil then
        inst.Scale = fromScale
      end
      TweenService:Create(inst, info, { Scale = toScale }):Play()
    end
  end
end

local lastOpen = model:GetAttribute("ShopOpen") == true

local function syncFromServer()
  local open = model:GetAttribute("ShopOpen") == true
  local bought = model:GetAttribute("ShopBought") == true
  worldBoard.Enabled = false
  if open and not lastOpen then
    billboard.Enabled = true
    tweenPops(0.4, 1, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out))
  elseif (not open) and lastOpen then
    tweenPops(nil, 0.35, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In))
    task.delay(0.12, function()
      if model:GetAttribute("ShopOpen") ~= true then
        billboard.Enabled = false
        setPops(1)
      end
    end)
  else
    billboard.Enabled = open
  end
  lastOpen = open
  if bought then
    priceLabel.Text = "Owned"
    priceLabel.TextColor3 = Color3.fromRGB(46, 140, 74)
    buy.Text = "Yours"
    buy.BackgroundColor3 = Color3.fromRGB(168, 168, 168)
  end
end

model:GetAttributeChangedSignal("ShopOpen"):Connect(syncFromServer)
model:GetAttributeChangedSignal("ShopBought"):Connect(syncFromServer)
syncFromServer()

buy.Activated:Connect(function()
  action:FireServer("buy")
end)

local function isCratePart(inst)
  return inst and inst:IsA("BasePart") and inst:IsDescendantOf(model)
end

UserInputService.InputBegan:Connect(function(input, processed)
  if processed then return end
  if input.UserInputType ~= Enum.UserInputType.MouseButton1 then return end
  if isCratePart(mouse.Target) then
    action:FireServer("toggle")
  end
end)
`;

await call("manage_scripts", {
  action: "set_source",
  path: "game.StarterPlayer.StarterPlayerScripts.CrateBillboardClient",
  source: clientSource,
});

const check = await call("execute_luau", {
  code: `
local m=workspace.HoverBox
local att=m.Box.BillboardAtt
local bb=att.CrateBillboard
bb.Enabled=false
local cd=m.Box:FindFirstChildOfClass("ClickDetector")
return {
  enabled=bb.Enabled,
  clickDetector=cd~=nil,
  welds=#m.Box:GetChildren(),
  shopOpen=m:GetAttribute("ShopOpen"),
  parent=bb.Parent.Name,
}
`,
});
console.log("ready", check);
