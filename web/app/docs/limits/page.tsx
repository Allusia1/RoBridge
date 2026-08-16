import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";

export const metadata: Metadata = { title: "Limits" };

export default function LimitsPage() {
  return (
    <article className="page prose">
      <p className="kicker">Help</p>
      <h1>Limits</h1>
      <p className="lede">Honest constraints. RoBridge does not pretend to be a hosted cloud or a Pro SKU.</p>

      <h2>One port</h2>
      <p>
        Dashboard + plugin bridge bind <code>127.0.0.1:3737</code> (override with <code>ROBRIDGE_PORT</code>). The
        first process owns the port. Later MCP clients on the same port forward tool calls to that owner — they do
        not start a second dashboard. Not a multi-Studio router: keep the place you want to edit open.
      </p>

      <h2>Open Cloud upload is not included</h2>
      <p>
        There is no Open Cloud API-key pipeline, no <code>manage_open_cloud_assets</code>, and no hosted asset CDN.
        <code>manage_assets.upload_asset</code> is Studio <code>AssetService:CreateAssetAsync</code> (requires{" "}
        <code>confirm=true</code> and a logged-in Studio session). Creator Store insert still uses{" "}
        <code>InsertService:LoadAsset</code>.
      </p>

      <h2>InsertService ownership</h2>
      <p>
        <code>manage_assets</code> insert / insert_free / insert_package only works for assets that are free or owned
        by the logged-in Studio user. Always <code>search</code> first, then insert an <code>assetId</code> from
        those results — never invent ids.
      </p>

      <h2>Local only</h2>
      <p>
        HTTP is localhost. The filesystem next to the server (<code>sync/</code>, <code>asset-library/</code>,{" "}
        <code>test-reports/</code>, <code>gallery/</code>) is on the machine running Node, not Roblox&apos;s cloud.
      </p>

      <h2>CaptureService</h2>
      <p>
        One in-flight screenshot/record. Effective capture rate is often ~1.5–2 fps even if you request a higher{" "}
        <code>fps</code>. Mesh / Image APIs must be enabled.
      </p>

      <h2>Player Emulator / experience language</h2>
      <p>
        <code>test_profile_*</code> and <code>experience_language_set</code> return <code>manual_required</code> —
        Roblox does not expose a public Player Emulator API to plugins. Set those in Studio&apos;s Test menu.
      </p>

      <h2>What this project is not</h2>
      <ul>
        <li>Not a published crate / RNG experience. The MCP product is the bridge.</li>
        <li>Not a VS Code Roblox explorer extension.</li>
        <li>Not a paid Pro tier with gated tools.</li>
      </ul>

      <Pager prev={{ href: "/docs/troubleshooting", label: "Troubleshooting" }} />
    </article>
  );
}
