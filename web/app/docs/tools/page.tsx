import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";
import { ToolsCatalog } from "@/components/ToolsCatalog";

export const metadata: Metadata = { title: "Tools" };

export default function ToolsPage() {
  return (
    <article className="page prose">
      <p className="kicker">Reference</p>
      <h1>Tools</h1>
      <ToolsCatalog />

      <h2>Value conventions</h2>
      <p>Property values are plain JSON:</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Roblox type</th>
              <th>JSON</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vector3 / CFrame position</td>
              <td>
                <code>[x, y, z]</code>
              </td>
            </tr>
            <tr>
              <td>CFrame (full)</td>
              <td>12 numbers</td>
            </tr>
            <tr>
              <td>Color3</td>
              <td>
                <code>&quot;#ff0000&quot;</code> or <code>[r, g, b]</code> in 0–1
              </td>
            </tr>
            <tr>
              <td>UDim2</td>
              <td>
                <code>[xs, xo, ys, yo]</code>
              </td>
            </tr>
            <tr>
              <td>Enum</td>
              <td>
                <code>&quot;Enum.Material.Neon&quot;</code> or <code>&quot;Neon&quot;</code>
              </td>
            </tr>
            <tr>
              <td>Instance</td>
              <td>path string</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Paths: <code>game.Workspace.Model.Part</code> or <code>Workspace/Model/Part</code>. Prefer{" "}
        <code>rbId</code> from a prior summary when names collide. Never invent <code>rbxassetid</code> values —
        search with <code>manage_assets</code> first.
      </p>

      <Pager
        prev={{ href: "/docs/dashboard", label: "Dashboard" }}
        next={{ href: "/docs/troubleshooting", label: "Troubleshooting" }}
      />
    </article>
  );
}
