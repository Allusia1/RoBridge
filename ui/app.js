const $ = (sel) => document.querySelector(sel);

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tools") refreshTools();
    if (btn.dataset.tab === "ui-studio") refreshGallery().catch(() => {});
  });
});

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

function fmtUptime(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString();
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

function setMeta(text) {
  $("#shot-meta").textContent = text;
}

function fmtAgo(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function nodeHtml(kicker, title, status, state) {
  return `<div class="topo-node ${esc(state)}">
    <span class="topo-kicker">${esc(kicker)}</span>
    <strong>${esc(title)}</strong>
    <span class="topo-status">${esc(status)}</span>
  </div>`;
}

function linkHtml(on) {
  return `<div class="topo-link-col"><div class="topo-link ${on ? "on" : "off"}"></div></div>`;
}

function sessionState(s) {
  if (s.connected) return "on";
  return "off";
}

function renderTopology(s) {
  const mcp = s.mcp || {};
  const sessions = (s.bridge && s.bridge.sessions) || [];
  const live = sessions.filter((x) => x.connected);
  const mcpOn = !!mcp.clientConnected;
  const mcpIdle = !mcpOn && mcp.label === "dashboard-only";
  const mcpState = mcpOn ? "on" : mcpIdle ? "idle" : "off";
  const mcpStatus = mcpOn
    ? mcp.label === "http-proxy"
      ? "HTTP proxy · live"
      : "stdio · connected"
    : mcp.label === "dashboard-only"
      ? "not attached"
      : mcp.label || "offline";
  const serverOn = true;
  const pluginOn = live.length > 0;
  const placeLive = live[0];
  const placeName = placeLive?.placeName || (sessions[0]?.placeName ?? "No place");
  const placeState = pluginOn ? "on" : "off";

  const pluginNodes = (sessions.length ? sessions : [{ placeName: "No plugin", connected: false, mode: "—", pluginVersion: "—" }])
    .map((x) => {
      const title = x.playAgent ? `${x.placeName || "Play"} · play` : x.placeName || "Studio";
      const status = x.connected
        ? `${x.mode || "edit"} · v${x.pluginVersion || "?"}`
        : "disconnected";
      return nodeHtml("Plugin", title, status, sessionState(x));
    })
    .join("");

  const uniquePlaces = [];
  for (const x of live.length ? live : sessions) {
    const key = `${x.placeId || 0}:${x.placeName || ""}`;
    if (!uniquePlaces.some((p) => p.key === key)) uniquePlaces.push({ key, ...x });
  }
  const placeNodes = (uniquePlaces.length ? uniquePlaces : [{ placeName, connected: false, placeId: 0 }])
    .map((p) =>
      nodeHtml(
        "Place",
        p.placeName || "—",
        p.connected ? `id ${p.placeId || 0}` : "no session",
        p.connected ? "on" : "off"
      )
    )
    .join("");

  $("#topology").innerHTML = `<div class="topo-flow">
    <div class="topo-col narrow">${nodeHtml("MCP client", mcpOn ? "Agent" : "No agent", mcpStatus, mcpState)}</div>
    ${linkHtml(mcpOn)}
    <div class="topo-col">${nodeHtml("RoBridge", `:${s.port}`, `v${s.version} · HTTP`, serverOn ? "on" : "off")}</div>
    ${linkHtml(pluginOn)}
    <div class="topo-col">${pluginNodes}</div>
    ${linkHtml(pluginOn && !!placeLive)}
    <div class="topo-col">${placeNodes}</div>
  </div>`;
}

function renderPreflight(s) {
  const p = s.preflight || {};
  const connected = s.studioConnected;
  const items = [
    ["HTTP requests", connected ? p.httpEnabled : null],
    ["Mesh / Image APIs", connected ? p.meshImageApis : null],
    ["loadstring", connected ? p.loadstring : null],
    ["Play agent", s.playConnected ? true : connected ? false : null],
  ];
  $("#preflight-row").innerHTML = items
    .map(([label, val]) => {
      const cls = val === true ? "on" : val === false ? "off" : "na";
      const dot = val === true ? "on" : val === false ? "off" : "na";
      const text = val === true ? "on" : val === false ? "off" : "—";
      return `<div class="check-pill ${cls}"><span class="dot ${dot}"></span>${esc(label)} · ${text}</div>`;
    })
    .join("");
}

function renderSessions(sessions) {
  $("#session-cards").innerHTML = sessions
    .map((x) => {
      const modeClass = x.connected ? (x.mode === "play" || x.mode === "run" || x.playAgent ? "play" : "edit") : "disconnected";
      const status = x.connected ? "connected" : "disconnected";
      return `<article class="session-row ${x.connected ? "on" : "off"}">
        <div>
          <span class="mode-badge ${modeClass}">${esc(status)}</span>
        </div>
        <div>
          <h3>${esc(x.placeName || "Unknown place")}</h3>
          <div class="session-meta">${esc((x.sessionId || "").slice(0, 8) || "—")}${x.playAgent ? " · play agent" : ""}</div>
        </div>
        <div class="session-field"><dt>Place ID</dt><dd>${esc(x.placeId ?? "—")}</dd></div>
        <div class="session-field"><dt>Plugin</dt><dd>v${esc(x.pluginVersion || "?")}</dd></div>
        <div class="session-field"><dt>Mode</dt><dd>${esc(x.playAgent ? "play" : x.mode || "edit")}</dd></div>
        <div class="session-field"><dt>Last seen</dt><dd>${esc(fmtAgo(x.lastSeenMsAgo ?? Date.now() - x.lastSeen))}</dd></div>
      </article>`;
    })
    .join("");
  $("#sessions-empty").style.display = sessions.length ? "none" : "";
  const liveN = sessions.filter((x) => x.connected).length;
  $("#session-count-note").textContent = sessions.length
    ? `${liveN} connected · ${sessions.length} listed`
    : "";
}

const openGenres = new Set();

function registryQuery() {
  return ($("#registry-search")?.value || "").trim().toLowerCase();
}

function toolMatchesQuery(tool, genre, q) {
  if (!q) return true;
  const hay = [genre.label, tool.name, tool.description, ...(tool.actions || [])]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function renderRegistry(catalog) {
  if (!catalog) return;
  const q = registryQuery();
  const genres = catalog.genres || [];
  let shownTools = 0;
  let shownActions = 0;
  const html = genres
    .map((g) => {
      const tools = (g.tools || []).filter((t) => toolMatchesQuery(t, g, q));
      if (!tools.length) return "";
      const actionN = tools.reduce((n, t) => n + (t.actions.length || 1), 0);
      shownTools += tools.length;
      shownActions += actionN;
      const key = g.label;
      const open = q ? true : openGenres.has(key);
      const blocks = tools
        .map((t) => {
          const actions = t.actions.length
            ? t.actions
                .map((a) => {
                  const hit = q && String(a).toLowerCase().includes(q);
                  return `<span class="action-chip${hit ? " match" : ""}">${esc(a)}</span>`;
                })
                .join("")
            : `<span class="action-chip none">no action enum</span>`;
          const desc = (t.description || "").split(". ")[0];
          return `<div class="tool-block">
            <div class="tool-name">${esc(t.name)}</div>
            <div class="tool-desc">${esc(desc)}</div>
            <div class="action-list">${actions}</div>
          </div>`;
        })
        .join("");
      return `<details class="genre" data-genre="${esc(key)}"${open ? " open" : ""}>
        <summary class="genre-head">
          <h3>${esc(g.label)}</h3>
          <span class="genre-count">${tools.length} tools · ${actionN} actions</span>
        </summary>
        <div class="genre-body">${blocks}</div>
      </details>`;
    })
    .filter(Boolean)
    .join("");
  $("#tool-registry").innerHTML =
    html ||
    `<div class="empty-state"><strong>No matches</strong><span>Nothing in the registry for “${esc(
      $("#registry-search")?.value || ""
    )}”.</span></div>`;
  $("#tool-registry").querySelectorAll("details.genre").forEach((el) => {
    el.addEventListener("toggle", () => {
      const key = el.dataset.genre;
      if (el.open) openGenres.add(key);
      else openGenres.delete(key);
    });
  });
  const note = $("#tool-count-note");
  if (note && catalog.toolCount != null) {
    note.textContent = q
      ? `${shownTools} of ${catalog.toolCount} tools · ${shownActions} actions`
      : `${catalog.toolCount} tools · ${catalog.actionCount || shownActions} actions`;
  }
}

async function refreshStatus() {
  try {
    const s = await api("/api/status");
    $("#version").textContent = "v" + s.version;
    $("#ov-server-ver").textContent = "v" + s.version;
    $("#ov-tools").textContent = s.toolCount;
    const actionCount = s.actionCount || 0;
    $("#ov-tools-hint").textContent = actionCount
      ? `${actionCount} typed actions · all free`
      : "Typed actions, all free";
    $("#ov-uptime").textContent = fmtUptime(s.uptimeSeconds);
    $("#ov-port").textContent = s.port;
    $("#top-port").textContent = ":" + s.port;
    $("#tool-count-note").textContent = actionCount
      ? `${s.toolCount || 0} tools · ${actionCount} actions`
      : `${s.toolCount || 0} tools`;

    const hist = s.history || {};
    $("#ov-calls").textContent = hist.total ?? 0;
    const parts = [];
    if (hist.ok) parts.push(`${hist.ok} ok`);
    if (hist.failed) parts.push(`${hist.failed} failed`);
    if (hist.noStudio) parts.push(`${hist.noStudio} no studio`);
    $("#ov-calls-hint").textContent = parts.length ? parts.join(" · ") : "This server process";

    const sessions = (s.bridge && s.bridge.sessions) || [];
    const live = sessions.filter((x) => x.connected);
    const connected = live.length > 0 || s.studioConnected;
    const play = !!(s.playConnected || (s.bridge && s.bridge.playConnected));
    const mcp = s.mcp || {};

    $("#conn-dot").className = "dot " + (connected ? "on" : "off");
    $("#conn-text").textContent = connected
      ? live.length > 1
        ? `${live.length} Studios connected`
        : "Studio connected"
      : "Studio offline";
    $("#play-dot").className = "dot " + (play ? "play" : connected ? "on" : "off");
    $("#play-text").textContent = play ? "Play connected" : mcp.clientConnected ? "MCP attached" : connected ? "Edit mode" : "No session";

    const ovStudio = $("#ov-studio");
    ovStudio.textContent = live.length ? String(live.length) : "0";
    ovStudio.className = "card-value " + (connected ? "ok" : "err");
    $("#ov-studio-hint").textContent = connected
      ? `${live.filter((x) => !x.playAgent).length} edit · ${live.filter((x) => x.playAgent).length} play`
      : "Waiting for plugin";

    const pluginVer = live.find((x) => !x.playAgent)?.pluginVersion || sessions.find((x) => !x.playAgent)?.pluginVersion;
    $("#ov-plugin-ver").textContent = pluginVer ? "v" + pluginVer : "—";

    const place = live[0]?.placeName || sessions[0]?.placeName || (connected ? "Studio" : "—");
    $("#top-place").textContent = place;
    const modeEl = $("#top-mode");
    if (play) {
      modeEl.textContent = "play";
      modeEl.className = "mode-badge play";
    } else if (connected) {
      modeEl.textContent = live[0]?.mode || "edit";
      modeEl.className = "mode-badge edit";
    } else {
      modeEl.textContent = "offline";
      modeEl.className = "mode-badge offline";
    }

    renderTopology(s);
    renderPreflight(s);
    renderSessions(sessions);
  } catch {
    $("#conn-dot").className = "dot off";
    $("#conn-text").textContent = "Server offline";
    $("#play-dot").className = "dot off";
    $("#play-text").textContent = "No session";
    $("#top-mode").textContent = "offline";
    $("#top-mode").className = "mode-badge offline";
    $("#top-place").textContent = "—";
    $("#topology").innerHTML = `<div class="topo-flow">
      ${nodeHtml("MCP client", "Unknown", "server offline", "off")}
      ${linkHtml(false)}
      ${nodeHtml("RoBridge", "offline", "not listening", "off")}
      ${linkHtml(false)}
      ${nodeHtml("Plugin", "No plugin", "disconnected", "off")}
      ${linkHtml(false)}
      ${nodeHtml("Place", "—", "no session", "off")}
    </div>`;
  }
}

let toolCatalog = null;
async function loadCatalog() {
  try {
    toolCatalog = await api("/api/tools");
    renderRegistry(toolCatalog);
    if (toolCatalog.actionCount) {
      $("#tool-count-note").textContent = `${toolCatalog.toolCount} tools · ${toolCatalog.actionCount} actions`;
      $("#ov-tools").textContent = toolCatalog.toolCount;
      $("#ov-tools-hint").textContent = `${toolCatalog.actionCount} typed actions · all free`;
    }
  } catch {
    /* catalog loads with status polling */
  }
}

let showStats = false;

async function refreshTools() {
  if (!$("#tab-tools").classList.contains("active")) return;
  if (showStats) {
    const s = await api("/api/stats");
    const rows = s.tools || [];
    $("#stats-table tbody").innerHTML = rows
      .map(
        (t) => `<tr>
          <td><code>${esc(t.tool)}</code></td>
          <td>${t.calls}</td>
          <td>${t.ok}</td>
          <td>${t.failed}</td>
          <td>${t.noStudio}</td>
          <td>${t.avgMs}ms</td>
        </tr>`
      )
      .join("");
    $("#stats-table").style.display = rows.length ? "" : "none";
    $("#stats-empty").style.display = rows.length ? "none" : "";
  } else {
    const h = await api("/api/history?limit=100");
    const rows = h.items || [];
    $("#history-table tbody").innerHTML = rows
      .map(
        (e) => `<tr>
          <td>${fmtTime(e.time)}</td>
          <td><code>${esc(e.tool)}${e.action ? "." + esc(e.action) : ""}</code></td>
          <td>${e.durationMs}ms</td>
          <td><span class="badge ${e.status}">${e.status}</span></td>
          <td title="${esc(e.error || "")}">${esc((e.error || "").slice(0, 80))}</td>
        </tr>`
      )
      .join("");
    $("#history-table").style.display = rows.length ? "" : "none";
    $("#history-empty").style.display = rows.length ? "none" : "";
  }
}

$("#toggle-stats").addEventListener("click", () => {
  showStats = !showStats;
  $("#toggle-stats").textContent = showStats ? "History" : "Statistics";
  $("#history-view").hidden = showStats;
  $("#stats-view").hidden = !showStats;
  refreshTools();
});

$("#clear-history").addEventListener("click", async () => {
  await api("/api/history/clear", { method: "POST" });
  refreshTools();
});

async function runConsole() {
  const code = $("#console-input").value;
  const out = $("#console-output");
  out.className = "output";
  out.textContent = "Running…";
  const r = await api("/api/console", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (r.ok) {
    out.textContent = typeof r.result === "string" ? r.result : JSON.stringify(r.result, null, 2);
  } else {
    out.className = "output error";
    out.textContent = r.error;
  }
}

$("#console-run").addEventListener("click", runConsole);
$("#console-input").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runConsole();
});

let logLevel = "";
let logsLiveTimer = null;

async function fetchLogs() {
  if (!$("#tab-logs").classList.contains("active") && !logsLiveTimer) return;
  const args = { action: "get", limit: 200 };
  if (logLevel) args.levelFilter = logLevel;
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_logs", args }),
  });
  if (!r.ok) {
    $("#logs-empty").style.display = "";
    $("#logs-empty").innerHTML = `<strong>Could not fetch logs</strong><span>${esc(r.error)}</span>`;
    $("#logs-list").innerHTML = "";
    return;
  }
  const items = (r.result && r.result.items) || [];
  $("#logs-list").innerHTML = items
    .map(
      (l) => `<div class="log-line ${esc(l.level)}">
        <span class="log-time">${new Date(l.time * 1000).toLocaleTimeString()}</span>
        <span class="log-msg">${esc(l.message)}</span>
      </div>`
    )
    .join("");
  $("#logs-empty").style.display = items.length ? "none" : "";
}

$("#fetch-logs").addEventListener("click", fetchLogs);

document.querySelectorAll("#log-filters .chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#log-filters .chip-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    logLevel = btn.dataset.level || "";
    fetchLogs();
  });
});

$("#logs-live").addEventListener("change", () => {
  if (logsLiveTimer) {
    clearInterval(logsLiveTimer);
    logsLiveTimer = null;
  }
  if ($("#logs-live").checked) {
    fetchLogs();
    logsLiveTimer = setInterval(fetchLogs, 3000);
  }
});

let seqTimer = null;

function stopSeq() {
  if (seqTimer) {
    clearInterval(seqTimer);
    seqTimer = null;
  }
  const video = $("#shot-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

function hideViewport() {
  stopSeq();
  const img = $("#shot-image");
  const video = $("#shot-video");
  if (img) img.hidden = true;
  if (video) {
    video.hidden = true;
    video.removeAttribute("src");
    video.load();
  }
}

function showShot(item) {
  const id = item.id;
  const width = item.width;
  const height = item.height;
  const time = item.time;
  const kind = item.kind || "image";
  const mime = item.mimeType || "image/png";
  const img = $("#shot-image");
  const video = $("#shot-video");
  $("#shot-empty").style.display = "none";
  const when = time ? new Date(time).toLocaleTimeString() : "just now";
  const extra = kind === "video" ? ` · ${item.frameCount || "?"}f · ${(item.fps || 0).toFixed ? Number(item.fps).toFixed(1) : item.fps}fps` : "";
  setMeta(`${width || "?"}×${height || "?"} · ${when} · ${item.source || "CaptureService"}${extra}`);
  document.querySelectorAll(".shot-thumbs button").forEach((b) => b.classList.toggle("active", b.dataset.id === id));

  if (kind !== "video") {
    stopSeq();
    video.hidden = true;
    video.removeAttribute("src");
    img.src = `/api/screenshots/${id}?t=${Date.now()}`;
    img.hidden = false;
    return;
  }

  playClip(item, mime);
}

async function playClip(item, mime) {
  const img = $("#shot-image");
  const video = $("#shot-video");
  stopSeq();
  img.hidden = true;
  if (mime && mime.startsWith("video/")) {
    video.srcObject = null;
    video.src = `/api/screenshots/${item.id}?t=${Date.now()}`;
    video.hidden = false;
    video.play().catch(() => playSequence(item));
    return;
  }
  const played = await playSequence(item);
  if (!played) {
    img.src = `/api/screenshots/${item.id}?t=${Date.now()}`;
    img.hidden = false;
    video.hidden = true;
  }
}

async function playSequence(item) {
  const video = $("#shot-video");
  const frames = Number(item.frameCount || 0);
  if (!frames) return false;
  const images = [];
  try {
    for (let i = 0; i < frames; i++) {
      const im = new Image();
      im.src = `/api/screenshots/${item.id}/frame/${i}`;
      await im.decode();
      images.push(im);
    }
  } catch {
    return false;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Number(item.width) || images[0].naturalWidth;
  canvas.height = Number(item.height) || images[0].naturalHeight;
  const ctx = canvas.getContext("2d");
  let i = 0;
  const fps = Math.max(1, Number(item.fps) || 8);
  const draw = () => {
    ctx.drawImage(images[i], 0, 0, canvas.width, canvas.height);
    i = (i + 1) % images.length;
  };
  draw();
  if (typeof canvas.captureStream === "function") {
    video.srcObject = canvas.captureStream(fps);
    video.removeAttribute("src");
    video.hidden = false;
    seqTimer = setInterval(draw, 1000 / fps);
    video.play().catch(() => {});
    return true;
  }
  return false;
}

async function refreshGallery() {
  const g = await api("/api/screenshots");
  const items = g.items || [];
  $("#shot-thumbs").innerHTML = items
    .map((s) => {
      const thumb = s.kind === "video" ? `/api/screenshots/${esc(s.id)}/poster` : `/api/screenshots/${esc(s.id)}`;
      const badge = s.kind === "video" ? `<span class="shot-play">▶</span>` : "";
      return `<button type="button" data-id="${esc(s.id)}" data-kind="${esc(s.kind || "image")}">
        <img src="${thumb}" alt="" />${badge}
      </button>`;
    })
    .join("");
  $("#shot-thumbs-empty").style.display = items.length ? "none" : "";
  $("#shot-thumbs").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const found = items.find((s) => s.id === btn.dataset.id);
      if (found) showShot(found);
    });
  });
  const videoHidden = $("#shot-video").hidden;
  const imgHidden = $("#shot-image").hidden;
  if (items[0] && imgHidden && videoHidden) showShot(items[0]);
}

$("#shot-capture").addEventListener("click", async () => {
  const btn = $("#shot-capture");
  btn.disabled = true;
  btn.textContent = "Capturing…";
  setMeta("Capturing Studio viewport…");
  const path = $("#shot-path").value.trim();
  const r = await api("/api/screenshots/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(path ? { path } : {}),
  });
  btn.disabled = false;
  btn.textContent = "Capture";
  if (!r.ok) {
    setMeta("Capture failed");
    $("#shot-empty").style.display = "";
    $("#shot-empty").innerHTML = `<strong>Capture failed</strong><span>${esc(r.error)}</span>`;
    hideViewport();
    return;
  }
  await refreshGallery();
  showShot({
    id: r.id || "latest",
    width: r.width,
    height: r.height,
    time: Date.now(),
    kind: r.kind || "image",
    mimeType: r.mimeType,
    source: r.source,
    frameCount: r.frames,
    fps: r.fps,
  });
});

$("#shot-record").addEventListener("click", async () => {
  const btn = $("#shot-record");
  btn.disabled = true;
  btn.textContent = "Recording…";
  setMeta("Recording Studio viewport…");
  const path = $("#shot-path").value.trim();
  const r = await api("/api/screenshots/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(path ? { path, seconds: 4, fps: 15 } : { seconds: 4, fps: 15 }),
  });
  btn.disabled = false;
  btn.textContent = "Record";
  if (!r.ok) {
    setMeta("Record failed");
    $("#shot-empty").style.display = "";
    $("#shot-empty").innerHTML = `<strong>Record failed</strong><span>${esc(r.error)}</span>`;
    hideViewport();
    return;
  }
  await refreshGallery();
  showShot({
    id: r.id || "latest",
    width: r.width,
    height: r.height,
    time: Date.now(),
    kind: "video",
    mimeType: r.mimeType,
    source: r.source,
    frameCount: r.frames,
    fps: r.fps,
  });
});

$("#shot-clear").addEventListener("click", async () => {
  await api("/api/screenshots/clear", { method: "POST" });
  $("#shot-thumbs").innerHTML = "";
  $("#shot-thumbs-empty").style.display = "";
  hideViewport();
  $("#shot-empty").style.display = "";
  $("#shot-empty").innerHTML = `<strong>Viewport idle</strong><span>Capture a still or record a short viewport clip with CaptureService, even if Studio is in the background.</span>`;
  setMeta("No capture yet");
});

$("#ui-play").addEventListener("click", async () => {
  $("#ui-play").disabled = true;
  $("#ui-play").textContent = "Starting…";
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_studio", args: { action: "play_start", mode: "play" } }),
  });
  $("#ui-play").disabled = false;
  $("#ui-play").textContent = "Play";
  setMeta(r.ok ? JSON.stringify(r.result) : r.error);
  refreshStatus();
});

$("#ui-stop").addEventListener("click", async () => {
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_studio", args: { action: "play_stop" } }),
  });
  setMeta(r.ok ? "Play stopped" : r.error);
  refreshStatus();
});

$("#ui-create").addEventListener("click", async () => {
  const brief = $("#ui-brief").value.trim() || "RoBridge menu";
  const kind = $("#ui-kind").value || "menu";
  setMeta("Creating UI…");
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_ui", args: { action: "design_brief", kind, brief, create: true } }),
  });
  setMeta(r.ok ? JSON.stringify(r.result) : r.error);
  if (r.ok) $("#shot-refresh-ui").click();
});

$("#ui-click").addEventListener("click", async () => {
  const path = $("#ui-click-path").value.trim();
  if (!path) return;
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_ui", args: { action: "click", path } }),
  });
  setMeta(r.ok ? JSON.stringify(r.result) : r.error);
});

$("#shot-refresh-ui").addEventListener("click", async () => {
  $("#ui-tree-empty").textContent = "Loading…";
  const r = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_ui", args: { action: "list" } }),
  });
  if (!r.ok) {
    $("#ui-tree-empty").style.display = "";
    $("#ui-tree-empty").textContent = "Error: " + r.error;
    $("#ui-tree").innerHTML = "";
    return;
  }
  const guis = (r.result && r.result.screenGuis) || [];
  $("#ui-tree").innerHTML = guis
    .map((g) => {
      const kids = (g.children || []).map((c) => `${c.className} ${c.name}`).join(", ");
      return `<button type="button" class="ui-tree-item" data-path="${esc(g.path || "StarterGui." + g.name)}"><strong>${esc(g.name)}</strong><span>${g.enabled === false ? "disabled · " : ""}${esc(kids || "empty")}</span></button>`;
    })
    .join("");
  $("#ui-tree-empty").style.display = guis.length ? "none" : "";
  $("#ui-tree-empty").textContent = guis.length ? "" : "No ScreenGuis in StarterGui.";
  $("#ui-tree").querySelectorAll(".ui-tree-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#shot-path").value = btn.dataset.path || "";
    });
  });

  const inter = await api("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "manage_ui", args: { action: "list_interactive" } }),
  });
  const raw = (inter.ok && inter.result && (inter.result.items || inter.result.playerGui)) || [];
  const flat = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (entry.interactive) {
      for (const i of entry.interactive) flat.push(i);
    } else {
      flat.push(entry);
    }
  }
  $("#ui-interactive").innerHTML = flat
    .slice(0, 24)
    .map((i) => `<button type="button" class="ui-tree-item" data-path="${esc(i.path || "")}"><strong>${esc(i.name)}</strong><span>${esc(i.path || "")}</span></button>`)
    .join("");
  $("#ui-interactive").querySelectorAll(".ui-tree-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#ui-click-path").value = btn.dataset.path || "";
    });
  });
});

$("#registry-search")?.addEventListener("input", () => {
  renderRegistry(toolCatalog);
});

refreshStatus();
setInterval(refreshStatus, 2000);
setInterval(refreshTools, 2500);
loadCatalog();
setInterval(loadCatalog, 30000);
refreshGallery().catch(() => {});
