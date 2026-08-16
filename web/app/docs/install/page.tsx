import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";
import { pluginVersion, serverVersion } from "@/lib/catalog";

export const metadata: Metadata = { title: "Install" };

export default function InstallPage() {
  return (
    <article className="page prose">
      <p className="kicker">Start</p>
      <h1>Install / first run</h1>
      <p className="lede">
        RoBridge is a local checkout: build the Node server, copy the plugin into Studio&apos;s plugins folder, then
        point your MCP client at <code>dist/index.js</code>. Server <strong>{serverVersion}</strong>, plugin{" "}
        <strong>{pluginVersion}</strong>.
      </p>

      <ol className="steps">
        <li>
          <strong>Install dependencies and build</strong>
          <pre>{`npm install
npm run build`}</pre>
        </li>
        <li>
          <strong>Install the Studio plugin</strong>
          <pre>{`npm run install-plugin`}</pre>
          Copies <code>plugin/RoBridge.lua</code> into the local Roblox plugins folder (macOS:{" "}
          <code>~/Documents/Roblox/Plugins</code>; Windows: <code>%LOCALAPPDATA%\\Roblox\\Plugins</code>).
        </li>
        <li>
          <strong>Restart Roblox Studio</strong> (or refresh the Plugins folder). A <strong>RoBridge</strong> toolbar
          button appears under Plugins and auto-connects.
        </li>
        <li>
          <strong>Allow HTTP to 127.0.0.1</strong> when Studio prompts. The plugin long-polls{" "}
          <code>http://127.0.0.1:3737</code>.
        </li>
        <li>
          <strong>Allow Mesh / Image APIs</strong> if you want viewport screenshots or recordings: File → Game
          Settings → Security → Allow Mesh / Image APIs. Needed for <code>manage_camera.screenshot</code> /{" "}
          <code>record</code> (CaptureService + EditableImage).
        </li>
        <li>
          <strong>Allow HTTP Requests</strong> in Game Settings → Security if you will playtest. Play-mode agents
          poll the same local server; <code>play_start</code> also tries to set <code>HttpService.HttpEnabled</code>.
        </li>
        <li>
          <strong>Register MCP</strong> in <code>~/.cursor/mcp.json</code> — see{" "}
          <a href="/docs/mcp">MCP setup</a>. Reload the RoBridge MCP server in Cursor after each rebuild.
        </li>
        <li>
          <strong>Open the dashboard</strong> at{" "}
          <a href="http://127.0.0.1:3737">http://127.0.0.1:3737</a>. Studio connected + place name means you are
          done.
        </li>
      </ol>

      <h2>Dashboard-only (no agent)</h2>
      <pre>{`node dist/index.js --no-mcp`}</pre>
      <p>
        HTTP dashboard and plugin bridge without stdio MCP. Useful to confirm the plugin before wiring Cursor.
      </p>

      <h2>One process owns the port</h2>
      <p>
        The first RoBridge process binds <code>127.0.0.1:3737</code>. A second <code>node dist/index.js</code> on the
        same port does not start another dashboard — it <strong>forwards</strong> MCP tool calls to the instance that
        already holds the port. Quit the owner if you need a clean restart.
      </p>

      <h2>Verify</h2>
      <ul>
        <li>
          Plugin toolbar button is visible; dashboard shows the place name.
        </li>
        <li>
          From an agent: create a blue Part in Workspace. If it appears in Studio, the loop works.
        </li>
        <li>
          Optional: <code>system_info</code> action <code>preflight</code> (HttpService, loadstring, Mesh/Image APIs).
        </li>
      </ul>

      <div className="callout warn">
        This is not a crate game and not a hosted cloud service. Keep the place you actually want to edit open in
        Studio. CoreGui / CorePackages are not a playground.
      </div>

      <Pager prev={{ href: "/docs", label: "Overview" }} next={{ href: "/docs/mcp", label: "MCP setup" }} />
    </article>
  );
}
