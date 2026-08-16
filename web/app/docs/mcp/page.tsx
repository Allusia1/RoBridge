import type { Metadata } from "next";
import { toolCount } from "@/lib/catalog";
import { Pager } from "@/components/DocsChrome";

export const metadata: Metadata = { title: "MCP setup" };

export default function McpPage() {
  return (
    <article className="page prose">
      <p className="kicker">Start</p>
      <h1>MCP setup (Cursor)</h1>
      <p className="lede">
        RoBridge speaks MCP over stdio. Cursor (or any MCP client) spawns <code>node dist/index.js</code>. That
        process serves the dashboard and talks to the Studio plugin.
      </p>

      <h2>Cursor config</h2>
      <p>
        Edit <code>~/.cursor/mcp.json</code> (macOS / Linux) or the equivalent MCP config in Cursor Settings. Use an{" "}
        <strong>absolute path</strong> to this repo&apos;s built server:
      </p>
      <pre>{`{
  "mcpServers": {
    "RoBridge": {
      "command": "node",
      "args": ["/absolute/path/to/RoBridge/dist/index.js"]
    }
  }
}`}</pre>
      <p>
        After <code>npm run build</code>, reload the RoBridge MCP server in Cursor (Settings → MCP → RoBridge →
        restart) so <code>tools/list</code> picks up new schemas.
      </p>

      <h2>What Cursor should see</h2>
      <ul>
        <li>Server name <code>RoBridge</code></li>
        <li>
          The full tool list ({toolCount} tools — see <a href="/docs/tools">Tools</a>)
        </li>
        <li>No Pro / tier fields; everything is available</li>
      </ul>

      <h2>Other MCP clients</h2>
      <p>
        Any client that can run a stdio MCP server works. Point <code>command</code> at <code>node</code> and{" "}
        <code>args</code> at <code>dist/index.js</code>. Claude Desktop, Claude Code, Codex, and similar apps use
        the same pattern with their own config files.
      </p>

      <h2>Catalog without Studio</h2>
      <pre>{`node dist/index.js --dump-catalog`}</pre>
      <p>
        Prints JSON of every registered tool (names, actions, param keys). Live HTTP copy while the dashboard is up:{" "}
        <a href="http://127.0.0.1:3737/api/tools">http://127.0.0.1:3737/api/tools</a>. Schema drift check in this
        repo: <code>npm run test:schema</code>.
      </p>

      <h2>Environment</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Default</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>ROBRIDGE_PORT</code>
              </td>
              <td>
                <code>3737</code>
              </td>
              <td>Dashboard + plugin bridge port</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The plugin reads <code>RoBridgeHost</code> / <code>RoBridgePort</code> plugin settings if you need a
        non-default port. Keep host at <code>127.0.0.1</code>.
      </p>

      <Pager prev={{ href: "/docs/install", label: "Install" }} next={{ href: "/docs/playtesting", label: "Playtesting" }} />
    </article>
  );
}
