#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { mcpClientState } from "../dist/tools/helpers.js";

const base = {
  transport: "none",
  stdioConnected: false,
  lastClientAt: null,
  lastClientSource: null,
  proxyCalls: 0,
  lastHeartbeatAt: null,
};

test("dashboard-only owner is idle until a forwarded MCP heartbeats or proxies", () => {
  const s = mcpClientState(base, 1_000_000);
  assert.equal(s.clientConnected, false);
  assert.equal(s.label, "dashboard-only");
});

test("forwarded stdio heartbeat marks attached on the HTTP owner", () => {
  const now = 5_000_000;
  const s = mcpClientState({ ...base, lastHeartbeatAt: now - 5_000 }, now);
  assert.equal(s.clientConnected, true);
  assert.equal(s.heartbeatFresh, true);
  assert.equal(s.label, "http-proxy");
});

test("stale heartbeat does not stay attached", () => {
  const now = 5_000_000;
  const s = mcpClientState({ ...base, lastHeartbeatAt: now - 60_000 }, now);
  assert.equal(s.clientConnected, false);
  assert.equal(s.label, "dashboard-only");
});

test("proxied tool call marks attached for 3 minutes", () => {
  const now = 5_000_000;
  const s = mcpClientState(
    { ...base, lastClientSource: "proxy", lastClientAt: now - 10_000, proxyCalls: 3 },
    now,
  );
  assert.equal(s.clientConnected, true);
  assert.equal(s.proxyFresh, true);
  assert.equal(s.label, "http-proxy");
});

test("stdio on this process is attached even with no proxy", () => {
  const s = mcpClientState({ ...base, transport: "stdio", stdioConnected: true }, 1_000);
  assert.equal(s.clientConnected, true);
  assert.equal(s.label, "stdio");
});
