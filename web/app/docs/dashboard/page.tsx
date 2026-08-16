import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <article className="page prose">
      <p className="kicker">Guides</p>
      <h1>Dashboard</h1>
      <p className="lede">
        The MCP server serves a local dashboard at <a href="http://127.0.0.1:3737">http://127.0.0.1:3737</a>. It
        binds <code>127.0.0.1</code> only — not reachable from other machines.
      </p>

      <h2>What you see</h2>
      <ul>
        <li>
          <strong>Overview</strong> — Studio connected or not, playtest idle/live, tool count, uptime, place name.
        </li>
        <li>
          <strong>Activity</strong> — tool execution history (time, tool, action, duration, OK / failed / no Studio)
          and per-tool stats.
        </li>
        <li>
          <strong>UI Studio</strong> — inspect and iterate on GUI trees the agent built.
        </li>
        <li>
          <strong>Console</strong> — run Luau against the connected place (plugin security).
        </li>
        <li>
          <strong>Logs</strong> — Studio Output captured by the plugin (and play-agent logs during Play).
        </li>
      </ul>

      <h2>Connection check</h2>
      <p>After install, confirm in this order:</p>
      <ol>
        <li>Cursor (or your client) actually spawned RoBridge — dashboard loads.</li>
        <li>Roblox Studio is open on the place you care about; plugin toolbar button exists.</li>
        <li>Dashboard Overview shows the place name, not “No Studio connected”.</li>
      </ol>
      <p>
        Plugin not listed? Restart Studio after <code>npm run install-plugin</code>. HTTP prompt denied? Allow
        requests to <code>127.0.0.1</code>.
      </p>

      <h2>Port already in use</h2>
      <p>
        One RoBridge process owns <code>3737</code>. If Cursor starts a second copy, that copy forwards MCP tools to
        the owner and does not bind HTTP again. Open the dashboard on the original process. To restart cleanly, quit
        the owner (stop the MCP server in Cursor, or kill the Node process) and start once.
      </p>

      <h2>Live tool catalog</h2>
      <p>
        <a href="http://127.0.0.1:3737/api/tools">GET /api/tools</a> returns the same registrations as MCP{" "}
        <code>tools/list</code> (names, actions, param keys, server version).
      </p>

      <Pager
        prev={{ href: "/docs/playtesting", label: "Playtesting" }}
        next={{ href: "/docs/tools", label: "Tools" }}
      />
    </article>
  );
}
