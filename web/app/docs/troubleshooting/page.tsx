import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";

export const metadata: Metadata = { title: "Troubleshooting" };

export default function TroubleshootingPage() {
  return (
    <article className="page prose">
      <p className="kicker">Help</p>
      <h1>Troubleshooting</h1>
      <p className="lede">
        Tool errors append a <code>Fix:</code> line when RoBridge recognizes the failure.{" "}
        <code>system_info</code> action <code>preflight</code> is the read-only checklist (mode, HttpService,
        loadstring, Mesh/Image APIs).
      </p>

      <h2>No Studio session</h2>
      <p>
        Symptom: <code>No Roblox Studio session connected</code> or <code>Studio plugin not connected</code>.
      </p>
      <ol>
        <li>
          Open the place in Roblox Studio with the RoBridge plugin installed (<code>npm run install-plugin</code>).
        </li>
        <li>Click <strong>Allow</strong> if Studio asks to talk to <code>127.0.0.1</code>.</li>
        <li>Confirm the dashboard at :3737 shows the place name.</li>
        <li>Fully quit Studio and relaunch if the toolbar button is missing.</li>
      </ol>

      <h2>loadstring / execute_luau in Play</h2>
      <p>
        <code>execute_luau</code> is Edit-only (plugin <code>loadstring</code>). In Play use{" "}
        <code>manage_studio.run_test</code> or play agents, or <code>play_stop</code> first. The plugin itself does
        not run inside the Play DataModel.
      </p>

      <h2>Stuck Play</h2>
      <p>
        Press <strong>Stop</strong> in Studio (or <code>manage_studio.play_stop</code>), then retry.{" "}
        <code>run_test</code> already stops leftover Play before starting. If Play started but the play agent never
        polls: Game Settings → Security → Allow HTTP Requests.
      </p>

      <h2>CaptureService / screenshots</h2>
      <p>
        <code>manage_camera.screenshot</code> and <code>record</code> need File → Game Settings → Security →{" "}
        <strong>Allow Mesh / Image APIs</strong>. CaptureService allows only one in-flight shot and typically lands
        around 1.5–2 fps; that cap is expected. <code>record_stop</code> aborts an in-flight recording. Screenshot
        works in Edit even if Studio is in the background.
      </p>

      <h2>HTTP / play agent</h2>
      <p>Game Settings → Security → Allow HTTP Requests. Needed for play-mode agents to poll localhost.</p>

      <h2>Port 3737 already in use</h2>
      <p>
        One process owns the dashboard. A second MCP spawn forwards tools to that owner. Stop the first Node/MCP
        process if the dashboard looks stale.
      </p>

      <h2>MCP client does not see new tools</h2>
      <p>
        Rebuild (<code>npm run build</code>) and restart the RoBridge MCP server in Cursor so <code>tools/list</code>{" "}
        refreshes.
      </p>

      <h2>Common messages</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Error</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>No Roblox Studio session</td>
              <td>Open Studio with the plugin; Allow HTTP to 127.0.0.1.</td>
            </tr>
            <tr>
              <td>Studio did not respond / timeout</td>
              <td>If Play is running, press Stop. execute_luau is Edit-only.</td>
            </tr>
            <tr>
              <td>CreateEditableImage failed / CaptureService</td>
              <td>Allow Mesh / Image APIs.</td>
            </tr>
            <tr>
              <td>HttpEnabled / HTTP requests are not enabled</td>
              <td>Allow HTTP Requests in Game Settings.</td>
            </tr>
            <tr>
              <td>loadstring blocked</td>
              <td>Stay in Edit, or use run_test during Play.</td>
            </tr>
            <tr>
              <td>InsertService / LoadAsset failed</td>
              <td>Asset must be free or owned by you. Search first; do not invent ids.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pager prev={{ href: "/docs/tools", label: "Tools" }} next={{ href: "/docs/limits", label: "Limits" }} />
    </article>
  );
}
