import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/DocsChrome";
import { pluginVersion, serverVersion, toolCount } from "@/lib/catalog";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <article className="page prose">
      <p className="kicker">Start</p>
      <h1>RoBridge docs</h1>
      <p className="lede">
        RoBridge is a local MCP server that lets AI coding agents (Cursor, Claude, or any MCP client) read and
        change Roblox Studio — DataModel, scripts, terrain, lighting, UI, and playtests — with a dashboard at{" "}
        <a href="http://127.0.0.1:3737">http://127.0.0.1:3737</a>.
      </p>

      <div className="cards">
        <div className="card">
          <div className="card-label">MCP server</div>
          <div className="card-value">{serverVersion}</div>
          <div className="card-hint">{toolCount} tools, all free</div>
        </div>
        <div className="card">
          <div className="card-label">Studio plugin</div>
          <div className="card-value">{pluginVersion}</div>
          <div className="card-hint">Long-polls localhost</div>
        </div>
        <div className="card">
          <div className="card-label">Dashboard</div>
          <div className="card-value">3737</div>
          <div className="card-hint">Bound to 127.0.0.1</div>
        </div>
      </div>

      <h2>How it fits together</h2>
      <pre>{`AI Agent (MCP over stdio) ──► RoBridge server ──► HTTP long-poll ──► Studio plugin ──► your place
                                    │
                                    └──► Web dashboard at http://127.0.0.1:3737`}</pre>
      <p>
        The agent talks MCP on stdio. The Node server owns the dashboard port, queues Luau jobs, and the Studio
        plugin executes them at plugin security. One process binds <code>3737</code>; extra MCP clients on the same
        port forward tool calls to that instance.
      </p>

      <h2>Recommended first path</h2>
      <ol className="steps">
        <li>
          <strong>Install</strong> — <code>npm install</code>, <code>npm run build</code>,{" "}
          <code>npm run install-plugin</code>, restart Studio, Allow HTTP to <code>127.0.0.1</code>.
        </li>
        <li>
          <strong>MCP setup</strong> — register <code>dist/index.js</code> in <code>~/.cursor/mcp.json</code> and
          reload the MCP server in Cursor.
        </li>
        <li>
          <strong>Check the dashboard</strong> — open{" "}
          <a href="http://127.0.0.1:3737">http://127.0.0.1:3737</a> and confirm Studio is connected.
        </li>
        <li>
          <strong>First workflow</strong> — ask the agent to create a Part, then playtest with{" "}
          <code>manage_studio.run_test</code>.
        </li>
      </ol>

      <h2>What agents can do</h2>
      <ul>
        <li>Query and mutate instances, properties, attributes, and tags</li>
        <li>Edit Script / LocalScript / ModuleScript sources</li>
        <li>Lighting, terrain, physics, effects, audio, animation, camera (including screenshot / record)</li>
        <li>Build UI trees and click them in Play</li>
        <li>Start / stop Play or Run, and auto-run tests that print <code>[ROBRIDGE_TEST]</code></li>
        <li>Search Creator Store assets, then insert by id from those results</li>
      </ul>
      <p>
        There is no paid tier. <code>system_info</code> reports <code>tier: &quot;free&quot;</code>.
      </p>

      <h2>Requirements</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Minimum</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Node.js</td>
              <td>18+</td>
            </tr>
            <tr>
              <td>Roblox Studio</td>
              <td>Current Studio on macOS or Windows</td>
            </tr>
            <tr>
              <td>MCP client</td>
              <td>Cursor (documented), or any client that can spawn a stdio MCP server</td>
            </tr>
            <tr>
              <td>Network</td>
              <td>
                <code>127.0.0.1:3737</code> on this machine only
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Full schemas live on <Link href="/docs/tools">Tools</Link>. Live copy from a running server:{" "}
        <a href="http://127.0.0.1:3737/api/tools">/api/tools</a>.
      </p>

      <Pager next={{ href: "/docs/install", label: "Install" }} />
    </article>
  );
}
