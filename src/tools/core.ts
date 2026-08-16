import { z } from "zod";
import { normalizeManageProperties } from "../properties.js";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

const jsonValue = z.any();

const instanceNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    className: z.string(),
    name: z.string().optional(),
    properties: z.record(jsonValue).optional(),
    children: z.array(instanceNode).optional(),
  })
);

export function registerCoreTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "query_instances",
    "Query instances in the Roblox place. Prefer a typed action over execute_luau. Actions: get, children, descendants, ancestors, find_child, find_descendant, wait_for_child, search_class, search_name, search_property, search_tag, class_info, file_tree (nested outline), project_structure (service/script counts). Paths: 'game.Workspace.Model.Part' or 'Workspace/Model/Part'. Prefer rbId (from a prior summary) over path when both are set — names like Part are not unique. Aliases: childName/descendantName/query→name, root→path, propertyName→property, id→rbId.",
    {
      action: z.enum([
        "get",
        "children",
        "descendants",
        "ancestors",
        "find_child",
        "find_descendant",
        "wait_for_child",
        "search_class",
        "search_name",
        "search_property",
        "search_tag",
        "class_info",
        "file_tree",
        "project_structure",
      ]),
      path: z.string().optional().describe("Instance path. Defaults to game. Alias: root. An RBId GUID is also accepted."),
      root: z.string().optional().describe("Alias for path"),
      rbId: z.string().optional().describe("RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id"),
      id: z.string().optional().describe("Alias for rbId"),
      name: z.string().optional().describe("Child/descendant name or name substring for searches"),
      childName: z.string().optional().describe("Alias for name (find_child / wait_for_child)"),
      descendantName: z.string().optional().describe("Alias for name (find_descendant)"),
      query: z.string().optional().describe("Alias for name (search_name)"),
      className: z.string().optional().describe("ClassName for search_class / class_info"),
      property: z.string().optional().describe("Property name for search_property"),
      propertyName: z.string().optional().describe("Alias for property"),
      value: jsonValue.optional().describe("Optional property value to match (search_property)"),
      propertyValue: jsonValue.optional().describe("Alias for value"),
      tag: z.string().optional().describe("Tag for search_tag"),
      timeout: z.number().optional().describe("Seconds to wait (wait_for_child, default 5, max 30)"),
      maxDepth: z.number().optional().describe("Max depth for file_tree (default 5) / project_structure (default 3)"),
      depth: z.number().optional().describe("Alias for maxDepth"),
      maxResults: z.number().optional().describe("Max results for searches/descendants (default 100)"),
      includeProps: z.boolean().optional().describe("Include common properties in results"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "query_instances",
        `
local RB, A = ...
local max = A.maxResults or 100
local function resolve(path) return RB.resolve(path, A.rbId or A.id) end
local function sum(i) return RB.summary(i, A.includeProps) end
if A.action == "get" then
  local inst = resolve(A.path)
  local s = RB.summary(inst, true)
  s.attributes = RB.encode(inst:GetAttributes())
  s.tags = inst:GetTags()
  return s
elseif A.action == "children" then
  local inst = resolve(A.path)
  local out = {}
  for _, c in ipairs(inst:GetChildren()) do
    if #out >= max then break end
    table.insert(out, sum(c))
  end
  return { count = #inst:GetChildren(), items = out }
elseif A.action == "descendants" then
  local inst = resolve(A.path)
  local out = {}
  for _, c in ipairs(inst:GetDescendants()) do
    if #out >= max then break end
    table.insert(out, sum(c))
  end
  return { items = out }
elseif A.action == "ancestors" then
  local inst = resolve(A.path)
  local out = {}
  local p = inst.Parent
  while p do
    table.insert(out, sum(p))
    p = p.Parent
  end
  return { items = out }
elseif A.action == "find_child" then
  local inst = resolve(A.path)
  local c = inst:FindFirstChild(A.name or "")
  return c and sum(c) or nil
elseif A.action == "find_descendant" then
  local inst = resolve(A.path)
  local c = inst:FindFirstChild(A.name or "", true)
  return c and sum(c) or nil
elseif A.action == "wait_for_child" then
  local inst = resolve(A.path)
  local timeout = math.clamp(A.timeout or 5, 0.1, 30)
  local c = inst:WaitForChild(A.name or "", timeout)
  if not c then error("wait_for_child timed out after " .. timeout .. "s waiting for '" .. tostring(A.name) .. "' under " .. inst:GetFullName()) end
  return sum(c)
elseif A.action == "search_class" then
  local root = resolve(A.path)
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA(A.className or "Instance") then
      table.insert(out, sum(c))
      if #out >= max then break end
    end
  end
  return { items = out }
elseif A.action == "search_name" then
  local root = resolve(A.path)
  local needle = string.lower(A.name or "")
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if string.find(string.lower(c.Name), needle, 1, true) then
      table.insert(out, sum(c))
      if #out >= max then break end
    end
  end
  return { items = out }
elseif A.action == "search_property" then
  if not A.property or A.property == "" then error("search_property requires property / propertyName") end
  local root = resolve(A.path)
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    local ok, v = pcall(function() return c[A.property] end)
    if ok then
      local encoded = RB.encode(v)
      local match = A.value == nil
      if not match then
        if type(A.value) == "boolean" or type(A.value) == "number" or type(A.value) == "string" then
          match = v == A.value or encoded == A.value or tostring(v) == tostring(A.value)
        else
          match = encoded == A.value
        end
      end
      if match then
        table.insert(out, { path = c:GetFullName(), className = c.ClassName, name = c.Name, value = encoded, rbId = RB.ensureId(c) })
        if #out >= max then break end
      end
    end
  end
  return { items = out, property = A.property }
elseif A.action == "search_tag" then
  if not A.tag or A.tag == "" then error("search_tag requires tag") end
  local root = resolve(A.path)
  local out = {}
  for _, c in ipairs(game:GetService("CollectionService"):GetTagged(A.tag)) do
    if c:IsDescendantOf(root) or c == root then
      table.insert(out, sum(c))
      if #out >= max then break end
    end
  end
  return { items = out, tag = A.tag }
elseif A.action == "class_info" then
  local ok, inst = pcall(function() return Instance.new(A.className) end)
  if not ok then
    return { className = A.className, creatable = false, error = tostring(inst) }
  end
  local kinds = {}
  for _, base in ipairs({"BasePart","Model","GuiObject","LuaSourceContainer","Light","PVInstance","Constraint","JointInstance"}) do
    if inst:IsA(base) then table.insert(kinds, base) end
  end
  local info = { className = A.className, creatable = true, defaultName = inst.Name, isA = kinds, defaultProps = RB.commonProps(inst) }
  inst:Destroy()
  return info
elseif A.action == "file_tree" then
  local root = resolve(A.path)
  local maxDepth = A.maxDepth or 5
  local function tree(inst, depth)
    local node = { name = inst.Name, className = inst.ClassName, path = inst:GetFullName(), rbId = inst:GetAttribute("RBId") }
    if depth < maxDepth then
      local kids = {}
      for _, c in ipairs(inst:GetChildren()) do
        table.insert(kids, tree(c, depth + 1))
        if #kids >= max then break end
      end
      if #kids > 0 then node.children = kids end
    else
      node.childCount = #inst:GetChildren()
    end
    return node
  end
  return tree(root, 0)
elseif A.action == "project_structure" then
  local names = {"Workspace","ReplicatedStorage","ServerScriptService","StarterGui","StarterPlayer","ServerStorage","Lighting","SoundService","Teams"}
  local services = {}
  for _, name in ipairs(names) do
    local ok, svc = pcall(function() return game:GetService(name) end)
    if ok and svc then
      local scripts = 0
      for _, c in ipairs(svc:GetDescendants()) do
        if c:IsA("LuaSourceContainer") then scripts += 1 end
      end
      table.insert(services, {
        name = name,
        className = svc.ClassName,
        children = #svc:GetChildren(),
        descendants = #svc:GetDescendants(),
        scripts = scripts,
      })
    end
  end
  return { placeName = game.Name, placeId = game.PlaceId, services = services }
end
error("Unknown action: " .. tostring(A.action) .. ". Valid: get, children, descendants, ancestors, find_child, find_descendant, wait_for_child, search_class, search_name, search_property, search_tag, class_info, file_tree, project_structure")
`,
        normalizeQuery(args)
      )
  );

  defineTool(
    ctx,
    "mutate_instances",
    "Create, delete, clone, move, rename, or pivot instances. Also: create_with_props (create+properties), create_tree (nested hierarchy in one waypoint), mass_create, mass_delete, mass_duplicate, smart_duplicate (N copies with offset), scatter (ray-snap clones onto ground in a region). Property values: numbers/strings/booleans, Vector3 [x,y,z], CFrame [x,y,z] or 12 numbers, Color3 hex '#ff0000' or [r,g,b] 0-1, UDim2 [xs,xo,ys,yo], enum strings like 'Enum.Material.Neon'.",
    {
      action: z.enum([
        "create",
        "create_with_props",
        "delete",
        "clone",
        "move",
        "rename",
        "pivot",
        "create_tree",
        "mass_create",
        "mass_delete",
        "mass_duplicate",
        "smart_duplicate",
        "scatter",
      ]),
      path: z.string().optional().describe("Target instance path (delete/clone/move/rename/pivot/smart_duplicate). An RBId GUID is also accepted."),
      rbId: z.string().optional().describe("RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id"),
      id: z.string().optional().describe("Alias for rbId"),
      className: z.string().optional().describe("ClassName to create"),
      parentPath: z.string().optional().describe("Parent path for create/clone/move. Alias: parent"),
      parent: z.string().optional().describe("Alias for parentPath"),
      name: z.string().optional().describe("Name for created/cloned instance"),
      newName: z.string().optional().describe("New name for rename"),
      properties: z.record(jsonValue).optional().describe("Properties to set"),
      position: z.array(z.number()).optional().describe("[x,y,z] position for move/pivot"),
      cframe: z.array(z.number()).optional().describe("CFrame as [x,y,z] or 12 numbers for pivot"),
      offset: z.array(z.number()).optional().describe("[x,y,z] relative offset for pivot/smart_duplicate"),
      tree: instanceNode.optional().describe("Nested instance tree for create_tree"),
      instances: z
        .array(
          z.object({
            className: z.string(),
            name: z.string().optional(),
            parentPath: z.string().optional(),
            parent: z.string().optional(),
            properties: z.record(jsonValue).optional(),
          })
        )
        .optional()
        .describe("Specs for mass_create"),
      paths: z.array(z.string()).optional().describe("Paths for mass_delete / mass_duplicate"),
      count: z.number().optional().describe("Copy count for smart_duplicate / scatter"),
      templatePaths: z.array(z.string()).optional().describe("Templates to clone for scatter"),
      region: z
        .object({ min: z.array(z.number()), max: z.array(z.number()) })
        .optional()
        .describe("World AABB {min,max} for scatter"),
      seed: z.number().optional(),
      maxSlope: z.number().optional().describe("Max ground slope degrees for scatter (default 30)"),
      avoidWater: z.boolean().optional(),
      parentName: z.string().optional().describe("Folder name that groups scatter results"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "mutate_instances",
        `
local RB, A = ...
local function target() return RB.resolve(A.path, A.rbId or A.id) end
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
local function pivotTo(inst, pos, cf, off)
  if not inst:IsA("PVInstance") then error(inst:GetFullName() .. " is not a PVInstance; cannot pivot") end
  if off then
    inst:PivotTo(inst:GetPivot() * CFrame.new(off[1], off[2], off[3]))
  elseif cf then
    if #cf >= 12 then
      inst:PivotTo(CFrame.new(cf[1], cf[2], cf[3], cf[4], cf[5], cf[6], cf[7], cf[8], cf[9], cf[10], cf[11], cf[12]))
    else
      inst:PivotTo(CFrame.new(cf[1], cf[2], cf[3]))
    end
  elseif pos then
    inst:PivotTo(CFrame.new(pos[1], pos[2], pos[3]))
  else
    error("pivot requires position, cframe, or offset")
  end
end
if A.action == "create" or A.action == "create_with_props" then
  if not A.className then error("create requires className") end
  local inst = Instance.new(A.className)
  if A.name then inst.Name = A.name end
  if A.properties then RB.setProps(inst, A.properties) end
  inst.Parent = RB.resolve(A.parentPath or "game.Workspace")
  RB.waypoint("create " .. inst.Name)
  return RB.summary(inst, true)
elseif A.action == "delete" then
  local inst = target()
  local name = inst:GetFullName()
  inst:Destroy()
  RB.waypoint("delete")
  return { deleted = name }
elseif A.action == "clone" then
  local inst = target()
  local c = inst:Clone()
  if A.name then c.Name = A.name end
  if A.properties then RB.setProps(c, A.properties) end
  c.Parent = A.parentPath and RB.resolve(A.parentPath) or inst.Parent
  RB.waypoint("clone")
  return RB.summary(c, true)
elseif A.action == "move" then
  local inst = target()
  if A.parentPath then inst.Parent = RB.resolve(A.parentPath) end
  if A.position then
    if inst:IsA("PVInstance") then
      inst:PivotTo(CFrame.new(A.position[1], A.position[2], A.position[3]))
    else
      inst.Position = Vector3.new(A.position[1], A.position[2], A.position[3])
    end
  end
  RB.waypoint("move")
  return RB.summary(inst, true)
elseif A.action == "rename" then
  local inst = target()
  inst.Name = A.newName or inst.Name
  RB.waypoint("rename")
  return RB.summary(inst)
elseif A.action == "pivot" then
  local inst = target()
  pivotTo(inst, A.position, A.cframe, A.offset)
  RB.waypoint("pivot")
  return RB.summary(inst, true)
elseif A.action == "create_tree" then
  if not A.tree then error("create_tree requires tree {className, name?, properties?, children?}") end
  local parent = RB.resolve(A.parentPath or "game.Workspace")
  local root = build(A.tree, parent)
  RB.waypoint("create_tree " .. root.Name)
  local n = 1
  for _ in ipairs(root:GetDescendants()) do n += 1 end
  return { root = RB.summary(root, true), instanceCount = n, parent = parent:GetFullName() }
elseif A.action == "mass_create" then
  if not A.instances or #A.instances == 0 then error("mass_create requires instances[]") end
  local created = {}
  for _, spec in ipairs(A.instances) do
    local inst = Instance.new(spec.className)
    if spec.name then inst.Name = spec.name end
    if spec.properties then RB.setProps(inst, spec.properties) end
    inst.Parent = RB.resolve(spec.parentPath or spec.parent or A.parentPath or "game.Workspace")
    table.insert(created, RB.summary(inst, true))
  end
  RB.waypoint("mass_create " .. #created)
  return { created = created }
elseif A.action == "mass_delete" then
  if not A.paths or #A.paths == 0 then error("mass_delete requires paths[]") end
  local deleted = {}
  for _, p in ipairs(A.paths) do
    local inst = RB.resolve(p)
    table.insert(deleted, inst:GetFullName())
    inst:Destroy()
  end
  RB.waypoint("mass_delete " .. #deleted)
  return { deleted = deleted }
elseif A.action == "mass_duplicate" then
  if not A.paths or #A.paths == 0 then error("mass_duplicate requires paths[]") end
  local created = {}
  for _, p in ipairs(A.paths) do
    local inst = RB.resolve(p)
    local c = inst:Clone()
    c.Parent = A.parentPath and RB.resolve(A.parentPath) or inst.Parent
    table.insert(created, RB.summary(c))
  end
  RB.waypoint("mass_duplicate " .. #created)
  return { created = created }
elseif A.action == "smart_duplicate" then
  local inst = target()
  local n = math.clamp(A.count or 1, 1, 200)
  local off = A.offset or { 4, 0, 0 }
  local created = {}
  for i = 1, n do
    local c = inst:Clone()
    c.Name = inst.Name .. "_" .. i
    c.Parent = A.parentPath and RB.resolve(A.parentPath) or inst.Parent
    if c:IsA("PVInstance") then
      c:PivotTo(inst:GetPivot() * CFrame.new(off[1] * i, off[2] * i, off[3] * i))
    end
    table.insert(created, RB.summary(c))
  end
  RB.waypoint("smart_duplicate " .. n)
  return { created = created }
elseif A.action == "scatter" then
  if not A.templatePaths or #A.templatePaths == 0 then error("scatter requires templatePaths[]") end
  if not A.region or not A.region.min or not A.region.max then error("scatter requires region {min=[x,y,z], max=[x,y,z]}") end
  local templates = {}
  for _, p in ipairs(A.templatePaths) do table.insert(templates, RB.resolve(p)) end
  local min, maxv = A.region.min, A.region.max
  local rng = Random.new(A.seed or math.floor(os.clock() * 1000))
  local want = math.clamp(A.count or 1, 1, 200)
  local maxSlope = A.maxSlope or 30
  local avoidWater = A.avoidWater ~= false
  local folder = Instance.new("Folder")
  folder.Name = A.parentName or ("RoBridgeScatter_" .. tostring(A.seed or 0))
  folder.Parent = workspace
  local placed = {}
  local attempts = 0
  while #placed < want and attempts < want * 25 do
    attempts += 1
    local x = rng:NextNumber(min[1], maxv[1])
    local z = rng:NextNumber(min[3], maxv[3])
    local origin = Vector3.new(x, math.max(min[2], maxv[2]), z)
    local dir = Vector3.new(0, math.min(min[2], maxv[2]) - math.max(min[2], maxv[2]) - 20, 0)
    if dir.Magnitude < 1 then dir = Vector3.new(0, -500, 0) end
    local hit = workspace:Raycast(origin, dir)
    if hit then
      local slope = math.deg(math.acos(math.clamp(hit.Normal:Dot(Vector3.yAxis), -1, 1)))
      local water = tostring(hit.Material) == "Enum.Material.Water"
      if slope <= maxSlope and not (avoidWater and water) then
        local tmpl = templates[rng:NextInteger(1, #templates)]
        local c = tmpl:Clone()
        local yaw = rng:NextNumber(0, math.pi * 2)
        if c:IsA("PVInstance") then
          c:PivotTo(CFrame.new(hit.Position) * CFrame.Angles(0, yaw, 0))
        end
        c.Parent = folder
        table.insert(placed, RB.summary(c))
      end
    end
  end
  RB.waypoint("scatter " .. #placed)
  return { folder = folder:GetFullName(), placed = placed, attempts = attempts }
end
error("Unknown action: " .. tostring(A.action))
`,
        normalizeMutate(args)
      )
  );

  defineTool(
    ctx,
    "manage_properties",
    "Get/set properties, attributes and tags. Actions: get, get_all, set (property + value), set_many/set_multiple (properties map — also used if you pass action 'set' with a properties map and no property), get_attributes/get_attr/get_all_attrs, set_attribute/set_attr, delete_attr, get_tags, add_tag, remove_tag, check_tag, get_tagged, set_relative (add/subtract/multiply/divide via operation, or plain delta), set_calculated (evaluate a math expression with variables that may be values or instance property paths), mass_set, mass_get, modify_children (set props on matching children).",
    {
      action: z.enum([
        "get",
        "get_all",
        "set",
        "set_many",
        "set_multiple",
        "get_attributes",
        "get_attr",
        "get_all_attrs",
        "set_attribute",
        "set_attr",
        "delete_attr",
        "get_tags",
        "add_tag",
        "remove_tag",
        "check_tag",
        "get_tagged",
        "set_relative",
        "set_calculated",
        "mass_set",
        "mass_get",
        "modify_children",
      ]),
      path: z.string().optional().describe("Instance path. An RBId GUID is also accepted."),
      rbId: z.string().optional().describe("RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id"),
      id: z.string().optional().describe("Alias for rbId"),
      paths: z.array(z.string()).optional().describe("Paths for mass_set / mass_get"),
      property: z.string().optional().describe("Property name for get/set/set_relative/set_calculated. Alias: propertyName"),
      propertyName: z.string().optional().describe("Alias for property"),
      properties: z.union([z.array(z.string()), z.record(jsonValue)]).optional().describe("Property name list (get) or map (set_many)"),
      value: jsonValue.optional().describe("Value for set / set_attribute / set_relative. Alias: amount"),
      amount: jsonValue.optional().describe("Alias for value (set_relative)"),
      operation: z.enum(["add", "subtract", "multiply", "divide"]).optional().describe("Math operation for set_relative (default add)"),
      expression: z.string().optional().describe("Math expression for set_calculated, e.g. 'base * multiplier + 2'"),
      variables: z.record(jsonValue).optional().describe("set_calculated variables: name -> number or 'path.to.Instance.Property' string"),
      attribute: z.string().optional().describe("Attribute name"),
      tag: z.string().optional().describe("Tag name"),
      className: z.string().optional().describe("Optional ClassName filter for modify_children"),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_properties",
        `
local RB, A = ...
if A.action == "get_tagged" then
  if not A.tag then error("get_tagged requires tag") end
  local out = {}
  for _, i in ipairs(game:GetService("CollectionService"):GetTagged(A.tag)) do
    table.insert(out, RB.summary(i))
  end
  return { items = out, tag = A.tag }
elseif A.action == "mass_get" then
  local paths = A.paths or (A.path and { A.path } or {})
  if #paths == 0 then error("mass_get requires paths[] or path") end
  local names = type(A.properties) == "table" and A.properties[1] and A.properties or (A.property and { A.property } or nil)
  local items = {}
  for _, p in ipairs(paths) do
    local inst = RB.resolve(p)
    if names then
      local props = {}
      for _, n in ipairs(names) do
        local ok, v = pcall(function() return inst[n] end)
        props[n] = ok and RB.encode(v) or nil
      end
      table.insert(items, { path = inst:GetFullName(), properties = props })
    else
      table.insert(items, { path = inst:GetFullName(), properties = RB.commonProps(inst) })
    end
  end
  return { items = items }
elseif A.action == "mass_set" then
  local paths = A.paths or (A.path and { A.path } or {})
  if #paths == 0 then error("mass_set requires paths[] or path") end
  if not A.properties then error("mass_set requires properties map") end
  local updated = {}
  for _, p in ipairs(paths) do
    local inst = RB.resolve(p)
    RB.setProps(inst, A.properties)
    table.insert(updated, inst:GetFullName())
  end
  RB.waypoint("mass_set " .. #updated)
  return { updated = updated }
end
local inst = RB.resolve(A.path, A.rbId or A.id)
if A.action == "get" then
  local names = A.properties or { A.property }
  local out = {}
  for _, n in ipairs(names) do
    local ok, v = pcall(function() return inst[n] end)
    out[n] = ok and RB.encode(v) or ("<error: " .. tostring(v) .. ">")
  end
  return out
elseif A.action == "get_all" then
  return RB.commonProps(inst)
elseif A.action == "set" then
  local hasMap = type(A.properties) == "table"
  if (type(A.property) ~= "string" or A.property == "") and hasMap then
    RB.setProps(inst, A.properties)
    RB.waypoint("set properties")
    return RB.summary(inst, true)
  end
  if type(A.property) ~= "string" or A.property == "" then
    error("manage_properties action 'set' needs property and value. For several fields use action 'set_many' with properties={Name=value,...}.")
  end
  RB.setProp(inst, A.property, A.value)
  RB.waypoint("set " .. A.property)
  local ok, v = pcall(function() return inst[A.property] end)
  return { [A.property] = ok and RB.encode(v) or nil }
elseif A.action == "set_many" or A.action == "set_multiple" then
  if type(A.properties) ~= "table" then
    error("set_many requires a properties map, e.g. properties={Transparency=0.5}. For one field use action 'set' with property + value.")
  end
  RB.setProps(inst, A.properties)
  RB.waypoint("set properties")
  return RB.summary(inst, true)
elseif A.action == "get_attributes" or A.action == "get_attr" or A.action == "get_all_attrs" then
  local attrs = RB.encode(inst:GetAttributes())
  if A.action == "get_attr" and A.attribute then
    return { [A.attribute] = attrs[A.attribute] }
  end
  return attrs
elseif A.action == "set_attribute" or A.action == "set_attr" then
  inst:SetAttribute(A.attribute, RB.toValue(A.value, nil, nil))
  RB.waypoint("set attribute")
  return RB.encode(inst:GetAttributes())
elseif A.action == "delete_attr" then
  inst:SetAttribute(A.attribute, nil)
  RB.waypoint("delete attribute")
  return RB.encode(inst:GetAttributes())
elseif A.action == "get_tags" then
  return inst:GetTags()
elseif A.action == "add_tag" then
  inst:AddTag(A.tag)
  return inst:GetTags()
elseif A.action == "remove_tag" then
  inst:RemoveTag(A.tag)
  return inst:GetTags()
elseif A.action == "check_tag" then
  return { tag = A.tag, has = inst:HasTag(A.tag) }
elseif A.action == "set_relative" then
  if not A.property then error("set_relative requires property (or propertyName)") end
  local ok, cur = pcall(function() return inst[A.property] end)
  if not ok then error("Cannot read " .. A.property .. ": " .. tostring(cur)) end
  local delta = A.value
  local op = A.operation or "add"
  local function apply(a, b)
    if op == "add" then return a + b
    elseif op == "subtract" then return a - b
    elseif op == "multiply" then return a * b
    elseif op == "divide" then
      if type(b) == "number" and b == 0 then error("set_relative divide by zero") end
      return a / b
    end
    error("Unknown operation '" .. tostring(op) .. "'. Use add, subtract, multiply, or divide")
  end
  if typeof(cur) == "Vector3" then
    if type(delta) == "number" and (op == "multiply" or op == "divide") then
      inst[A.property] = apply(cur, delta)
    else
      local d = type(delta) == "table" and delta or { delta, delta, delta }
      inst[A.property] = apply(cur, Vector3.new(tonumber(d[1]) or 0, tonumber(d[2]) or 0, tonumber(d[3]) or 0))
    end
  elseif typeof(cur) == "number" then
    inst[A.property] = apply(cur, tonumber(delta) or 0)
  else
    error("set_relative supports number and Vector3 properties, got " .. typeof(cur))
  end
  RB.waypoint("set_relative " .. A.property)
  return { [A.property] = RB.encode(inst[A.property]), operation = op }
elseif A.action == "set_calculated" then
  if not A.property then error("set_calculated requires property (or propertyName)") end
  if not A.expression or A.expression == "" then error("set_calculated requires expression, e.g. 'base * 2 + offset'") end
  if string.find(A.expression, "[^%w%s%.%+%-%*%/%%%^%(%),_]") then
    error("set_calculated expression may only contain numbers, variable names, and + - * / % ^ ( ) operators")
  end
  local env = { math = math }
  for name, v in pairs(A.variables or {}) do
    if type(v) == "number" then
      env[name] = v
    elseif type(v) == "string" then
      local dot = string.match(v, "^(.+)%.([%w_]+)$")
      local propName = string.match(v, "%.([%w_]+)$")
      if not dot or not propName then error("Variable '" .. name .. "' path must end in .Property: " .. v) end
      local holder = RB.resolve(dot)
      local okV, val = pcall(function() return holder[propName] end)
      if not okV then error("Cannot read variable '" .. name .. "' from " .. v .. ": " .. tostring(val)) end
      if type(val) ~= "number" then error("Variable '" .. name .. "' (" .. v .. ") is " .. typeof(val) .. ", not a number") end
      env[name] = val
    else
      error("Variable '" .. name .. "' must be a number or an instance property path string")
    end
  end
  local fn, ferr = loadstring("return (" .. A.expression .. ")")
  if not fn then error("set_calculated expression error: " .. tostring(ferr)) end
  setfenv(fn, env)
  local okE, result = pcall(fn)
  if not okE then error("set_calculated evaluation failed: " .. tostring(result)) end
  if type(result) ~= "number" then error("set_calculated expression must produce a number, got " .. typeof(result)) end
  RB.setProp(inst, A.property, result)
  RB.waypoint("set_calculated " .. A.property)
  return { [A.property] = RB.encode(inst[A.property]), computed = result, expression = A.expression }
elseif A.action == "modify_children" then
  if not A.properties then error("modify_children requires properties map") end
  local n = 0
  for _, c in ipairs(inst:GetChildren()) do
    if not A.className or c:IsA(A.className) then
      RB.setProps(c, A.properties)
      n += 1
    end
  end
  RB.waypoint("modify_children " .. n)
  return { updated = n }
end
error("Unknown action: " .. tostring(A.action))
`,
        normalizeManageProperties(args)
      )
  );

  defineTool(
    ctx,
    "manage_scripts",
    "Work with Script/LocalScript/ModuleScript sources. Actions: get_source, set_source, create, delete, list, search, replace (substring across scripts), edit_lines, edit_replace (find/replace in one script), edit_insert (insert at line), edit_delete (delete line range), validate (loadstring syntax check of a script path or raw source), get_dependencies (require() targets and services a script references). Prefer these over execute_luau for script edits.",
    {
      action: z.enum([
        "get_source",
        "set_source",
        "create",
        "delete",
        "list",
        "search",
        "replace",
        "edit_lines",
        "edit_replace",
        "edit_insert",
        "edit_delete",
        "validate",
        "get_dependencies",
      ]),
      path: z.string().optional().describe("Script path (or root path for list/search, defaults to game). An RBId GUID is also accepted."),
      rbId: z.string().optional().describe("RoBridge instance id from a prior summary. Preferred over path when both are set. Alias: id"),
      id: z.string().optional().describe("Alias for rbId"),
      source: z.string().optional().describe("New source for set_source/create, or replacement text for edit_lines/edit_insert"),
      className: z.enum(["Script", "LocalScript", "ModuleScript"]).optional().describe("Class for create (default Script)"),
      parentPath: z.string().optional().describe("Parent for create"),
      name: z.string().optional().describe("Name for create"),
      query: z.string().optional().describe("Substring to search for / find text for replace"),
      replacement: z.string().optional().describe("Replacement text for replace / edit_replace"),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
      maxResults: z.number().optional(),
    },
    async (args, ctx) =>
      runLuau(
        ctx,
        "manage_scripts",
        `
local RB, A = ...
local function resolve(path) return RB.resolve(path, A.rbId or A.id) end
if A.action == "get_source" then
  local inst = resolve(A.path)
  local src = RB.getSource(inst)
  return { path = inst:GetFullName(), className = inst.ClassName, source = src, lines = select(2, string.gsub(src, "\\n", "")) + 1 }
elseif A.action == "set_source" then
  local inst = resolve(A.path)
  RB.setSource(inst, A.source or "")
  RB.waypoint("edit script")
  return { path = inst:GetFullName(), lines = select(2, string.gsub(A.source or "", "\\n", "")) + 1 }
elseif A.action == "create" then
  local inst = Instance.new(A.className or "Script")
  inst.Name = A.name or "Script"
  RB.setSource(inst, A.source or "")
  inst.Parent = RB.resolve(A.parentPath or "game.ServerScriptService")
  RB.waypoint("create script")
  return RB.summary(inst)
elseif A.action == "list" then
  local root = resolve(A.path)
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("LuaSourceContainer") then
      local src = RB.getSource(c)
      table.insert(out, { path = c:GetFullName(), className = c.ClassName, lines = select(2, string.gsub(src, "\\n", "")) + 1, bytes = #src })
      if #out >= (A.maxResults or 200) then break end
    end
  end
  return { items = out }
elseif A.action == "search" then
  local root = resolve(A.path)
  local needle = string.lower(A.query or "")
  local out = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("LuaSourceContainer") then
      local src = RB.getSource(c)
      local lineNo = 0
      for line in string.gmatch(src .. "\\n", "([^\\n]*)\\n") do
        lineNo += 1
        if string.find(string.lower(line), needle, 1, true) then
          table.insert(out, { path = c:GetFullName(), line = lineNo, text = string.sub(line, 1, 200) })
          if #out >= (A.maxResults or 50) then return { items = out, truncated = true } end
        end
      end
    end
  end
  return { items = out }
elseif A.action == "delete" then
  local inst = resolve(A.path)
  if not inst:IsA("LuaSourceContainer") then error(inst:GetFullName() .. " is not a script") end
  local name = inst:GetFullName()
  inst:Destroy()
  RB.waypoint("delete script")
  return { deleted = name }
elseif A.action == "replace" then
  local root = resolve(A.path)
  local find = A.query or ""
  local repl = A.replacement or A.source or ""
  if find == "" then error("replace requires query") end
  local changed = {}
  for _, c in ipairs(root:GetDescendants()) do
    if c:IsA("LuaSourceContainer") then
      local src = RB.getSource(c)
      if string.find(src, find, 1, true) then
        local parts, i = {}, 1
        while true do
          local s, e = string.find(src, find, i, true)
          if not s then
            table.insert(parts, string.sub(src, i))
            break
          end
          table.insert(parts, string.sub(src, i, s - 1))
          table.insert(parts, repl)
          i = e + 1
        end
        local joined = table.concat(parts)
        RB.setSource(c, joined)
        table.insert(changed, c:GetFullName())
      end
    end
  end
  RB.waypoint("replace in scripts")
  return { changed = changed }
elseif A.action == "edit_replace" then
  local inst = resolve(A.path)
  local src = RB.getSource(inst)
  local find = A.query or ""
  local repl = A.replacement or A.source or ""
  if find == "" then error("edit_replace requires query") end
  if not string.find(src, find, 1, true) then error("query not found in " .. inst:GetFullName()) end
  local parts, i = {}, 1
  while true do
    local s, e = string.find(src, find, i, true)
    if not s then table.insert(parts, string.sub(src, i)) break end
    table.insert(parts, string.sub(src, i, s - 1))
    table.insert(parts, repl)
    i = e + 1
  end
  local joined = table.concat(parts)
  RB.setSource(inst, joined)
  RB.waypoint("edit_replace")
  return { path = inst:GetFullName(), lines = select(2, string.gsub(joined, "\\n", "")) + 1 }
elseif A.action == "edit_insert" then
  local inst = resolve(A.path)
  local src = RB.getSource(inst)
  local lines = {}
  for line in string.gmatch(src .. "\\n", "([^\\n]*)\\n") do table.insert(lines, line) end
  local at = math.clamp(A.startLine or (#lines + 1), 1, #lines + 1)
  table.insert(lines, at, A.source or "")
  local new = table.concat(lines, "\\n")
  RB.setSource(inst, new)
  RB.waypoint("edit_insert")
  return { path = inst:GetFullName(), lines = #lines, insertedAt = at }
elseif A.action == "edit_delete" then
  local inst = resolve(A.path)
  local src = RB.getSource(inst)
  local lines = {}
  for line in string.gmatch(src .. "\\n", "([^\\n]*)\\n") do table.insert(lines, line) end
  local s, e = A.startLine or 1, A.endLine or (A.startLine or 1)
  for i = e, s, -1 do table.remove(lines, i) end
  local new = table.concat(lines, "\\n")
  RB.setSource(inst, new)
  RB.waypoint("edit_delete")
  return { path = inst:GetFullName(), lines = #lines }
elseif A.action == "edit_lines" then
  local inst = resolve(A.path)
  local src = RB.getSource(inst)
  local lines = {}
  for line in string.gmatch(src .. "\\n", "([^\\n]*)\\n") do table.insert(lines, line) end
  local s, e = A.startLine or 1, A.endLine or (A.startLine or 1)
  local before = table.concat(lines, "\\n", 1, math.max(s - 1, 0))
  local after = e < #lines and table.concat(lines, "\\n", e + 1, #lines) or ""
  local mid = A.source or ""
  local new = (s > 1 and (before .. "\\n") or "") .. mid .. (#after > 0 and ("\\n" .. after) or "")
  RB.setSource(inst, new)
  RB.waypoint("edit script lines")
  return { path = inst:GetFullName(), lines = select(2, string.gsub(new, "\\n", "")) + 1 }
elseif A.action == "validate" then
  local src, from
  if A.source and (not A.path or A.path == "") then
    src, from = A.source, "source"
  else
    local inst = resolve(A.path)
    src, from = RB.getSource(inst), inst:GetFullName()
  end
  local fn, err = loadstring(src)
  return { path = from, valid = fn ~= nil, error = fn and nil or tostring(err), lines = select(2, string.gsub(src, "\\n", "")) + 1 }
elseif A.action == "get_dependencies" then
  local inst = resolve(A.path)
  if not inst:IsA("LuaSourceContainer") then error(inst:GetFullName() .. " is not a script") end
  local src = RB.getSource(inst)
  local requires, services, seen = {}, {}, {}
  for expr in string.gmatch(src, "require%s*%(([^%)]*)%)") do
    local trimmed = string.gsub(expr, "^%s*(.-)%s*$", "%1")
    if not seen[trimmed] then
      seen[trimmed] = true
      local entry = { expression = trimmed }
      local id = string.match(trimmed, "^(%d+)$")
      if id then
        entry.kind = "assetId"
      elseif string.find(trimmed, "^script") or string.find(trimmed, "^game") or string.find(trimmed, "^workspace") then
        entry.kind = "instance"
        local okR, target = pcall(function()
          local p = trimmed
          p = string.gsub(p, "^script%.Parent", inst.Parent and inst.Parent:GetFullName() or "")
          p = string.gsub(p, "^script", inst:GetFullName())
          p = string.gsub(p, ':GetService%("([%w_]+)"%)', ".%1")
          p = string.gsub(p, ':WaitForChild%("([%w_]+)"%)', ".%1")
          p = string.gsub(p, ':FindFirstChild%("([%w_]+)"%)', ".%1")
          return RB.resolve(p)
        end)
        if okR and target then
          entry.resolvedPath = target:GetFullName()
          entry.className = target.ClassName
        end
      else
        entry.kind = "dynamic"
      end
      table.insert(requires, entry)
    end
  end
  for svc in string.gmatch(src, 'GetService%s*%(%s*"([%w_]+)"%s*%)') do
    if not seen["svc:" .. svc] then
      seen["svc:" .. svc] = true
      table.insert(services, svc)
    end
  end
  return { path = inst:GetFullName(), requires = requires, services = services }
end
error("Unknown action: " .. tostring(A.action))
`,
        args,
        45_000
      )
  );
}

function normalizeQuery(args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...args,
    name: args.name ?? args.childName ?? args.descendantName ?? args.query,
    path: args.path ?? args.root ?? "game",
    rbId: args.rbId ?? args.id,
    property: args.property ?? args.propertyName,
    value: args.value ?? args.propertyValue,
    maxDepth: args.maxDepth ?? args.depth,
  };
}

function normalizeMutate(args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...args,
    parentPath: args.parentPath ?? args.parent,
    rbId: args.rbId ?? args.id,
  };
}
