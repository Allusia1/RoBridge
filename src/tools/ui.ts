import { z } from "zod";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

const jsonValue = z.any();
const uiNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    className: z.string(),
    name: z.string().optional(),
    properties: z.record(jsonValue).optional(),
    children: z.array(uiNode).optional(),
  })
);

const BUILD_UI = `
local function build(node, parent)
  local inst = Instance.new(node.className)
  if node.name then inst.Name = node.name end
  if node.properties then RB.setProps(inst, node.properties) end
  inst.Parent = parent
  if node.children then
    for _, c in ipairs(node.children) do build(c, inst) end
  end
  return inst
end
`;

export function registerUiTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "manage_ui",
    "Create, inspect, preview, and interact with Roblox UI. Actions: design_brief (plan a UI from a text brief; set create=true to build it), create_tree, update, list, inspect, list_interactive, preview (clone into CoreGui in Edit), hide_preview, click (VirtualInput / attribute click — PlayerGui during playtest, StarterGui in Edit), type_text, get_abs, check, delete.",
    {
      action: z.enum([
        "design_brief",
        "create_tree",
        "update",
        "list",
        "inspect",
        "list_interactive",
        "preview",
        "hide_preview",
        "click",
        "type_text",
        "get_abs",
        "check",
        "delete",
      ]),
      parentPath: z.string().optional(),
      screenGuiName: z.string().optional(),
      tree: uiNode.optional(),
      path: z.string().optional(),
      properties: z.record(jsonValue).optional(),
      depth: z.number().optional(),
      brief: z.string().optional().describe("Natural-language UI brief for design_brief"),
      kind: z.enum(["hud", "menu", "shop", "inventory", "dialog", "settings", "custom"]).optional(),
      text: z.string().optional().describe("Text for type_text"),
      create: z.boolean().optional().describe("If true, design_brief also creates the tree"),
    },
    async (args, ctx) => {
      if (args.action === "design_brief") {
        const plan = planUi(String(args.brief ?? ""), String(args.kind ?? "menu"));
        if (args.create) {
          const created = await runLuau(ctx, "manage_ui", createTreeLuau(), {
            action: "create_tree",
            screenGuiName: plan.screenGuiName,
            tree: plan.tree,
          });
          return { ...plan, created };
        }
        return plan;
      }

      if (args.action === "click" || args.action === "type_text" || args.action === "list_interactive" || args.action === "inspect") {
        if (ctx.bridge.isPlayConnected()) {
          const playAction =
            args.action === "click" ? "click" : args.action === "type_text" ? "type" : args.action === "inspect" ? "inspect" : "list";
          return runLuau(
            ctx,
            "manage_ui",
            `local RB, A = ...
if RB.invokeClient then
  return RB.invokeClient(A.playAction, A.payload)
end
error("Play agent missing invokeClient")`,
            { _play: "invokeClient", playAction, payload: { path: args.path, text: args.text } },
            20_000,
            "play"
          );
        }
      }

      return runLuau(ctx, "manage_ui", editUiLuau(), args);
    }
  );
}

function createTreeLuau() {
  return `
local RB, A = ...
${BUILD_UI}
local parent
if A.parentPath then
  parent = RB.resolve(A.parentPath)
else
  local sg = Instance.new("ScreenGui")
  sg.Name = A.screenGuiName or "RoBridgeGui"
  sg.ResetOnSpawn = false
  sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
  sg.Parent = game:GetService("StarterGui")
  parent = sg
end
local root = build(A.tree, parent)
RB.waypoint("create ui")
local n = 1
for _ in ipairs(root:GetDescendants()) do n += 1 end
return { root = RB.summary(root), instanceCount = n, parent = parent:GetFullName() }
`;
}

function editUiLuau() {
  return `
local RB, A = ...
${BUILD_UI}
local function walkInteractive(root)
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("GuiButton") or c:IsA("TextBox") then
      local text = nil
      if c:IsA("TextLabel") or c:IsA("TextButton") or c:IsA("TextBox") then text = c.Text end
      table.insert(out, {
        name = c.Name, className = c.ClassName, path = c:GetFullName(), text = text, visible = c.Visible,
        abs = c:IsA("GuiObject") and { c.AbsolutePosition.X, c.AbsolutePosition.Y, c.AbsoluteSize.X, c.AbsoluteSize.Y } or nil,
      })
    end
  end
  return out
end
if A.action == "create_tree" then
  local parent
  if A.parentPath then
    parent = RB.resolve(A.parentPath)
  else
    local sg = Instance.new("ScreenGui")
    sg.Name = A.screenGuiName or "RoBridgeGui"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = game:GetService("StarterGui")
    parent = sg
  end
  local root = build(A.tree, parent)
  RB.waypoint("create ui")
  local n = 1
  for _ in ipairs(root:GetDescendants()) do n += 1 end
  return { root = RB.summary(root), instanceCount = n, parent = parent:GetFullName() }
elseif A.action == "update" then
  local inst = RB.resolve(A.path)
  RB.setProps(inst, A.properties or {})
  RB.waypoint("update ui")
  return RB.summary(inst, true)
elseif A.action == "list" then
  local out = {}
  for _, sg in ipairs(game:GetService("StarterGui"):GetChildren()) do
    if sg:IsA("ScreenGui") then
      local kids = {}
      for _, c in ipairs(sg:GetChildren()) do table.insert(kids, { name = c.Name, className = c.ClassName }) end
      table.insert(out, { name = sg.Name, enabled = sg.Enabled, path = sg:GetFullName(), children = kids })
    end
  end
  return { screenGuis = out }
elseif A.action == "inspect" then
  local inst = RB.resolve(A.path)
  local function walk(i, d)
    local node = RB.summary(i)
    if i:IsA("GuiObject") then
      node.position = RB.encode(i.Position)
      node.size = RB.encode(i.Size)
      node.visible = i.Visible
      node.zIndex = i.ZIndex
      node.abs = { i.AbsolutePosition.X, i.AbsolutePosition.Y, i.AbsoluteSize.X, i.AbsoluteSize.Y }
      if i:IsA("TextLabel") or i:IsA("TextButton") or i:IsA("TextBox") then node.text = i.Text end
    end
    if d > 0 then
      node.children = {}
      for _, c in ipairs(i:GetChildren()) do table.insert(node.children, walk(c, d - 1)) end
    end
    return node
  end
  return walk(inst, A.depth or 4)
elseif A.action == "list_interactive" then
  local root = A.path and RB.resolve(A.path) or game:GetService("StarterGui")
  return { items = walkInteractive(root) }
elseif A.action == "preview" then
  local src = RB.resolve(A.path)
  local core = game:GetService("CoreGui")
  local existing = core:FindFirstChild("RoBridgePreview")
  if existing then existing:Destroy() end
  local folder = Instance.new("Folder")
  folder.Name = "RoBridgePreview"
  folder.Parent = core
  local clone = src:Clone()
  if clone:IsA("LayerCollector") then clone.Enabled = true end
  clone.Parent = folder
  return { previewed = clone:GetFullName(), interactive = walkInteractive(clone) }
elseif A.action == "hide_preview" then
  local p = game:GetService("CoreGui"):FindFirstChild("RoBridgePreview")
  if p then p:Destroy() end
  return { hidden = true }
elseif A.action == "click" then
  if RB.clickGui then return RB.clickGui(RB.resolve(A.path)) end
  local inst = RB.resolve(A.path)
  if not inst:IsA("GuiButton") then error("Not a GuiButton: " .. inst.ClassName) end
  pcall(function() inst:SetAttribute("RoBridgeClicked", os.clock()) end)
  local sg = inst
  while sg and not sg:IsA("LayerCollector") do sg = sg.Parent end
  if sg then pcall(function() sg:SetAttribute("LastClick", inst.Name) end) end
  local pos, size = inst.AbsolutePosition, inst.AbsoluteSize
  local x = pos.X + math.max(size.X, 1) / 2
  local y = pos.Y + math.max(size.Y, 1) / 2
  local method = "Attribute"
  local viOk, vi = pcall(function() return game:GetService("UserInputService"):CreateVirtualInput() end)
  if viOk and vi then
    local sent = pcall(function()
      vi:SendMousePosition(Vector2.new(x, y))
      vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, true)
      task.wait(0.05)
      vi:SendMouseButton(Vector2.new(x, y), Enum.UserInputType.MouseButton1, false)
    end)
    if sent then method = "VirtualInput" end
  end
  return { clicked = inst:GetFullName(), className = inst.ClassName, method = method, at = { x, y }, mode = "edit" }
elseif A.action == "type_text" then
  local inst = RB.resolve(A.path)
  if not inst:IsA("TextBox") then error("Not a TextBox") end
  inst.Text = A.text or ""
  return { path = inst:GetFullName(), text = inst.Text, mode = "edit" }
elseif A.action == "get_abs" then
  local inst = RB.resolve(A.path)
  if not inst:IsA("GuiObject") then error("Not a GuiObject") end
  return { path = inst:GetFullName(), abs = { inst.AbsolutePosition.X, inst.AbsolutePosition.Y, inst.AbsoluteSize.X, inst.AbsoluteSize.Y } }
elseif A.action == "check" then
  local root = RB.resolve(A.path)
  local issues = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("GuiButton") then
      local s = c.AbsoluteSize
      if s.X > 0 and s.Y > 0 and (s.X < 36 or s.Y < 36) then
        table.insert(issues, { path = c:GetFullName(), level = "warn", message = "Tap target smaller than 36px (" .. math.floor(s.X) .. "x" .. math.floor(s.Y) .. ")" })
      end
      if (c:IsA("TextButton") or c:IsA("ImageButton")) and c:IsA("TextButton") and (c.Text == nil or c.Text == "") then
        table.insert(issues, { path = c:GetFullName(), level = "warn", message = "TextButton has empty text" })
      end
    end
    if (c:IsA("TextLabel") or c:IsA("TextButton")) and c.TextTransparency >= 0.7 then
      table.insert(issues, { path = c:GetFullName(), level = "warn", message = "Text is very transparent" })
    end
  end
  return { path = root:GetFullName(), issueCount = #issues, issues = issues }
elseif A.action == "delete" then
  local inst = RB.resolve(A.path)
  local name = inst:GetFullName()
  inst:Destroy()
  RB.waypoint("delete ui")
  return { deleted = name }
end
error("Unknown action: " .. tostring(A.action))
`;
}

function planUi(brief: string, kind: string) {
  const name = kind === "custom" ? "RoBridgeGui" : `RoBridge${kind[0].toUpperCase()}${kind.slice(1)}`;
  const title = brief.trim() || kind;
  const tree = {
    className: "Frame",
    name: "Root",
    properties: {
      Size: [0.4, 0, 0.5, 0],
      Position: [0.3, 0, 0.25, 0],
      BackgroundColor3: "#151d2e",
      BorderSizePixel: 0,
    },
    children: [
      { className: "UICorner", properties: { CornerRadius: [0, 12] } },
      { className: "UIPadding", properties: { PaddingTop: [0, 16], PaddingBottom: [0, 16], PaddingLeft: [0, 16], PaddingRight: [0, 16] } },
      { className: "UIListLayout", properties: { Padding: [0, 10], SortOrder: "LayoutOrder", HorizontalAlignment: "Center" } },
      {
        className: "TextLabel",
        name: "Title",
        properties: { Size: [1, 0, 0, 36], BackgroundTransparency: 1, Text: title.slice(0, 48), TextColor3: "#ffffff", TextSize: 22, Font: "GothamBold" },
      },
      {
        className: "TextButton",
        name: "PrimaryButton",
        properties: { Size: [1, 0, 0, 44], BackgroundColor3: "#4f8cff", Text: "Play", TextColor3: "#ffffff", TextSize: 18, Font: "GothamMedium", AutoButtonColor: true },
        children: [{ className: "UICorner", properties: { CornerRadius: [0, 8] } }],
      },
      {
        className: "TextButton",
        name: "SecondaryButton",
        properties: { Size: [1, 0, 0, 40], BackgroundColor3: "#232f47", Text: "Close", TextColor3: "#e5eaf3", TextSize: 16, AutoButtonColor: true },
        children: [{ className: "UICorner", properties: { CornerRadius: [0, 8] } }],
      },
      {
        className: "TextBox",
        name: "Input",
        properties: { Size: [1, 0, 0, 36], BackgroundColor3: "#0b0f1a", Text: "", PlaceholderText: "Type here", TextColor3: "#ffffff", ClearTextOnFocus: false },
        children: [{ className: "UICorner", properties: { CornerRadius: [0, 8] } }],
      },
    ],
  };
  return {
    brief_id: `brief-${Date.now()}`,
    kind,
    screenGuiName: name,
    summary: `A ${kind} panel titled "${title.slice(0, 48)}" with primary/secondary buttons and an input.`,
    tree,
  };
}
