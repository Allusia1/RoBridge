import Link from "next/link";
import { pluginVersion, serverVersion, toolCount } from "@/lib/catalog";

export default function HomePage() {
  return (
    <main className="home">
      <p className="kicker">Local MCP · Roblox Studio</p>
      <h1>RoBridge</h1>
      <p className="lede">
        A free, open, local MCP server plus Studio plugin and dashboard. AI agents drive Roblox Studio on your
        machine — instances, scripts, lighting, playtests, and more. All tools included. No Pro tier.
      </p>
      <div className="home-actions">
        <Link className="btn btn-primary" href="/docs">
          Open docs
        </Link>
        <Link className="btn btn-ghost" href="/docs/install">
          Install / first run
        </Link>
        <Link className="btn btn-ghost" href="/docs/tools">
          {toolCount} tools
        </Link>
      </div>
      <pre className="arch">{`AI Agent (MCP over stdio) ──► RoBridge server ──► HTTP long-poll ──► Studio plugin ──► your place
                                    │
                                    └──► Web dashboard at http://127.0.0.1:3737`}</pre>
      <div className="cards">
        <div className="card">
          <div className="card-label">MCP server</div>
          <div className="card-value">{serverVersion}</div>
          <div className="card-hint">npm package + dist/index.js</div>
        </div>
        <div className="card">
          <div className="card-label">Studio plugin</div>
          <div className="card-value">{pluginVersion}</div>
          <div className="card-hint">plugin/RoBridge.lua</div>
        </div>
        <div className="card">
          <div className="card-label">Dashboard</div>
          <div className="card-value">:3737</div>
          <div className="card-hint">127.0.0.1 only</div>
        </div>
      </div>
    </main>
  );
}
