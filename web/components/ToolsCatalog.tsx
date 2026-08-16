"use client";

import { useMemo, useState } from "react";
import { tools, toolCount, serverVersion, pluginVersion, type ToolEntry } from "@/lib/catalog";

function ToolCard({ tool }: { tool: ToolEntry }) {
  return (
    <article className="tool-card" id={tool.name}>
      <div className="tool-head">
        <h2>
          <code>{tool.name}</code>
        </h2>
        <span className="tool-file">src/tools/{tool.file}</span>
      </div>
      <p>{tool.description}</p>
      {tool.actions.length > 0 ? (
        <div className="pills">
          {tool.actions.map((action) => (
            <span className="pill" key={action}>
              {action}
            </span>
          ))}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Param</th>
              <th>Type</th>
              <th></th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {tool.params.map((param) => (
              <tr key={param.name}>
                <td>
                  <code>{param.name}</code>
                </td>
                <td>
                  <code>{param.type}</code>
                  {param.enum && param.name !== "action" ? ` (${param.enum.join(" | ")})` : ""}
                </td>
                <td>{param.optional ? "optional" : "required"}</td>
                <td>{param.description ?? (param.name === "action" ? "Action enum" : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ToolsCatalog() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        tool.description.toLowerCase().includes(needle) ||
        tool.actions.some((a) => a.includes(needle))
    );
  }, [q]);

  const groups = useMemo(() => {
    const map = new Map<string, ToolEntry[]>();
    for (const tool of filtered) {
      const list = map.get(tool.group) ?? [];
      list.push(tool);
      map.set(tool.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <p className="lede">
        {toolCount} tools from <code>defineTool</code> in <code>src/tools</code>. Server {serverVersion}, plugin{" "}
        {pluginVersion}. Same shapes as MCP <code>tools/list</code> and <code>/api/tools</code>. All free.
      </p>
      <input
        className="tool-search"
        placeholder="Filter by name, action, or description"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Filter tools"
      />
      <div className="toc">
        {filtered.map((tool) => (
          <a key={tool.name} href={`#${tool.name}`}>
            {tool.name}
          </a>
        ))}
      </div>
      {groups.map(([group, list]) => (
        <section key={group}>
          <h2 className="group-title">{group}</h2>
          {list.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </section>
      ))}
      {filtered.length === 0 ? <p>No tools match that filter.</p> : null}
    </>
  );
}
