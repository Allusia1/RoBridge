#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { compactFixes, FIX, hintForError, withErrorHint } from "../dist/errors.js";
import { normalizeManageProperties } from "../dist/properties.js";

test("set + properties map coerces to set_many", () => {
  const out = normalizeManageProperties({
    action: "set",
    path: "Workspace.Baseplate",
    properties: { Transparency: 0.5, Anchored: true },
  });
  assert.equal(out.action, "set_many");
  assert.equal(out.property, undefined);
});

test("set with property + value stays set", () => {
  const out = normalizeManageProperties({
    action: "set",
    path: "Workspace.Baseplate",
    property: "Transparency",
    value: 0.5,
  });
  assert.equal(out.action, "set");
  assert.equal(out.property, "Transparency");
  assert.equal(out.value, 0.5);
});

test("set with propertyName alias", () => {
  const out = normalizeManageProperties({
    action: "set",
    propertyName: "Color",
    amount: "#ff0000",
  });
  assert.equal(out.property, "Color");
  assert.equal(out.value, "#ff0000");
});

test("set with both property and map keeps set", () => {
  const out = normalizeManageProperties({
    action: "set",
    property: "Transparency",
    value: 0.2,
    properties: { Anchored: true },
  });
  assert.equal(out.action, "set");
});

test("hint: Baseplate.nil / string expected got nil", () => {
  assert.equal(hintForError("Failed to set Baseplate.nil"), FIX.SET_VS_MANY);
  assert.equal(
    hintForError("user_RoBridge.lua.Script:424: invalid argument #2 (string expected, got nil)"),
    FIX.SET_VS_MANY
  );
  assert.equal(
    hintForError("Failed to set Baseplate.nil: invalid argument #2 (string expected, got nil)"),
    FIX.SET_VS_MANY
  );
});

test("hint: HTTP / Mesh / loadstring / no session / play wedge", () => {
  assert.equal(hintForError("Http requests are not enabled. Enable via game settings"), FIX.HTTP);
  assert.equal(hintForError("CreateEditableImage failed"), FIX.MESH_IMAGE);
  assert.equal(hintForError("CaptureService did not return a screenshot"), FIX.MESH_IMAGE);
  assert.equal(hintForError("loadstring failed: nil"), FIX.LOADSTRING);
  assert.equal(hintForError("No Roblox Studio session connected."), FIX.NO_SESSION);
  assert.equal(hintForError("StudioTestService: previous test still in progress"), FIX.PLAY_RUNNING);
  assert.equal(hintForError("Studio did not respond within 30s (tool: query_instances)"), FIX.TIMEOUT);
  assert.equal(hintForError("Studio did not respond within 30s (tool: execute_luau)", "execute_luau"), FIX.LOADSTRING);
});

test("withErrorHint is idempotent and skips messages that already explain the fix", () => {
  const once = withErrorHint("Failed to set Baseplate.nil");
  assert.match(once, /Fix:/);
  assert.equal(withErrorHint(once), once);
  const already =
    "Failed to set Workspace.Baseplate: property name is missing. Use manage_properties action 'set' with property + value, or action 'set_many' with properties={Name=value,...}.";
  assert.equal(withErrorHint(already), already);
  const mesh = "CreateEditableImage failed. Enable File → Game Settings → Security → Allow Mesh / Image APIs. Detail: x";
  assert.equal(withErrorHint(mesh), mesh);
});

test("compactFixes surfaces blockers before the first tool call", () => {
  assert.deepEqual(compactFixes({ studioConnected: false }), [FIX.NO_SESSION]);
  assert.deepEqual(
    compactFixes({
      studioConnected: true,
      preflight: { httpEnabled: false, loadstring: true, meshImageApis: false, mode: "edit" },
    }),
    [FIX.HTTP, FIX.MESH_IMAGE]
  );
  assert.deepEqual(
    compactFixes({
      studioConnected: true,
      preflight: { httpEnabled: true, loadstring: true, meshImageApis: true, mode: "edit" },
    }),
    []
  );
});
