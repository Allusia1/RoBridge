#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { collapseSessionsByPlace, placeListKey } from "../dist/bridge.js";

const PLACE = "89042014036694";

function row(partial) {
  return {
    sessionId: "s",
    placeName: "Game",
    placeId: PLACE,
    lastSeen: 1,
    connected: false,
    playAgent: false,
    pluginVersion: "0.1.9",
    mode: "edit",
    ...partial,
  };
}

test("placeListKey stringifies placeId and keeps unpublished unique", () => {
  assert.equal(placeListKey({ placeId: 89042014036694, sessionId: "a" }), "89042014036694");
  assert.equal(placeListKey({ placeId: "89042014036694", sessionId: "a" }), "89042014036694");
  assert.equal(placeListKey({ placeId: 0, sessionId: "a" }), "session:a");
  assert.equal(placeListKey({ sessionId: "b" }), "session:b");
});

test("screenshot ghosts collapse to one Test RoBridge row plus Place3", () => {
  const listed = collapseSessionsByPlace([
    row({
      sessionId: "place3",
      placeName: "Place3",
      placeId: 12345,
      connected: true,
      lastSeen: 100,
      pluginVersion: "0.1.9",
      mode: "edit",
    }),
    row({
      sessionId: "edit-old",
      placeName: "Test RoBridge",
      placeId: PLACE,
      connected: false,
      lastSeen: 40,
      pluginVersion: "0.1.9",
      mode: "edit",
    }),
    row({
      sessionId: "play-a",
      placeName: "Game",
      placeId: PLACE,
      connected: false,
      lastSeen: 60,
      playAgent: true,
      pluginVersion: "play-0.1.3",
      mode: "play",
    }),
    row({
      sessionId: "play-b",
      placeName: "Game",
      placeId: PLACE,
      connected: false,
      lastSeen: 50,
      playAgent: true,
      pluginVersion: "play-0.1.3",
      mode: "play",
    }),
    row({
      sessionId: "play-c",
      placeName: "Game",
      placeId: PLACE,
      connected: false,
      lastSeen: 45,
      pluginVersion: "play-0.1.3",
      mode: "play",
    }),
  ]);
  assert.equal(listed.length, 2);
  assert.equal(listed[0].placeName, "Place3");
  assert.equal(listed[0].connected, true);
  assert.equal(String(listed[0].placeId), "12345");
  assert.equal(listed[1].placeName, "Test RoBridge");
  assert.equal(listed[1].connected, false);
  assert.equal(String(listed[1].placeId), PLACE);
  assert.equal(listed[1].pluginVersion, "0.1.9");
  assert.equal(listed[1].mode, "edit");
});

test("connected play piggybacks edit and keeps the real place name", () => {
  const listed = collapseSessionsByPlace([
    row({
      sessionId: "edit",
      placeName: "Test RoBridge",
      connected: true,
      lastSeen: 10,
      pluginVersion: "0.1.9",
      mode: "edit",
    }),
    row({
      sessionId: "play",
      placeName: "Game",
      connected: true,
      lastSeen: 20,
      playAgent: true,
      pluginVersion: "play-0.1.3",
      mode: "play",
    }),
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sessionId, "edit");
  assert.equal(listed[0].placeName, "Test RoBridge");
  assert.equal(listed[0].playAgent, false);
});

test("play is kept when it is the only connected session, but uses edit name", () => {
  const listed = collapseSessionsByPlace([
    row({
      sessionId: "edit",
      placeName: "Test RoBridge",
      connected: false,
      lastSeen: 10,
      pluginVersion: "0.1.9",
      mode: "edit",
    }),
    row({
      sessionId: "play",
      placeName: "Game",
      connected: true,
      lastSeen: 20,
      playAgent: true,
      pluginVersion: "play-0.1.3",
      mode: "play",
    }),
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sessionId, "play");
  assert.equal(listed[0].connected, true);
  assert.equal(listed[0].placeName, "Test RoBridge");
});

test("does not invent or rewrite placeIds", () => {
  const listed = collapseSessionsByPlace([
    row({ sessionId: "a", placeId: PLACE, placeName: "Game", connected: false, lastSeen: 1 }),
    row({ sessionId: "b", placeId: PLACE, placeName: "Test RoBridge", connected: false, lastSeen: 2 }),
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].placeId, PLACE);
});
