import type { Metadata } from "next";
import { Pager } from "@/components/DocsChrome";

export const metadata: Metadata = { title: "Playtesting" };

export default function PlaytestingPage() {
  return (
    <article className="page prose">
      <p className="kicker">Guides</p>
      <h1>Playtesting</h1>
      <p className="lede">
        After a player-facing change (UI, clicks, shop, movement, leaderstats), run a playtest before calling the
        work done. Prefer <code>manage_studio.run_test</code> over hand-rolling <code>play_start</code> + logs +{" "}
        <code>play_stop</code>.
      </p>

      <h2>run_test</h2>
      <p>
        <code>manage_studio</code> action <code>run_test</code> will:
      </p>
      <ol>
        <li>
          Call <code>play_stop</code> first (clears a leftover Play session).
        </li>
        <li>Inject your Luau body into a short runner that prints <code>[ROBRIDGE_TEST]</code> markers.</li>
        <li>
          Start Play (F5) or Run (F8) via <code>play_start</code>.
        </li>
        <li>
          Collect Output lines containing <code>[ROBRIDGE_TEST]</code> until PASS/FAIL + END, or timeout.
        </li>
        <li>Stop Play, write a JSON report under <code>test-reports/</code>.</li>
        <li>
          Unless <code>record=false</code>, attach a short viewport clip via <code>manage_camera.record</code>.
        </li>
      </ol>

      <h3>Arguments</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Arg</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>script</code>
              </td>
              <td>Luau test body (required). Runs inside ServerScriptService during play.</td>
            </tr>
            <tr>
              <td>
                <code>test_name</code>
              </td>
              <td>Display name for the report (default RoBridgeTest).</td>
            </tr>
            <tr>
              <td>
                <code>timeout</code>
              </td>
              <td>Seconds to wait (default 60, max 300).</td>
            </tr>
            <tr>
              <td>
                <code>mode</code>
              </td>
              <td>
                <code>play</code> (F5) or <code>run</code> (F8).
              </td>
            </tr>
            <tr>
              <td>
                <code>record</code>
              </td>
              <td>Attach a viewport clip (default true).</td>
            </tr>
            <tr>
              <td>
                <code>recordSeconds</code> / <code>recordPath</code>
              </td>
              <td>Clip duration (default 4s) and optional instance to focus.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>What the test body should print</h3>
      <p>
        The wrapper already prints <code>[ROBRIDGE_TEST] START</code>, <code>PASS</code> or <code>FAIL</code>, and{" "}
        <code>END</code>. Inside the body, print your own checks with the same prefix so they show up in the
        report:
      </p>
      <pre>{`print("[ROBRIDGE_TEST] PASS")
-- or
print("[ROBRIDGE_TEST] FAIL expected SpawnLocation above ground")`}</pre>
      <p>
        A typical body asserts something, then prints PASS or FAIL. Uncaught errors in the body become FAIL.
      </p>

      <h2>Manual Play</h2>
      <ul>
        <li>
          <code>play_start</code> — F5 Play or F8 Run. Optional <code>testSource</code> injects a script with the
          play agents.
        </li>
        <li>
          <code>play_stop</code> — EndTest + strip play agents. If Studio looks stuck in Play, press <strong>Stop</strong>{" "}
          in Studio, then retry.
        </li>
        <li>
          <code>play_status</code> / <code>get_mode</code> — edit vs play, whether the play agent is polling.
        </li>
        <li>
          <code>play_pause</code> / <code>play_resume</code>
        </li>
      </ul>
      <p>
        Play agents need HTTP: Game Settings → Security → Allow HTTP Requests. If Play starts but the agent never
        polls, that setting is the usual cause.
      </p>

      <h2>Input during Play</h2>
      <p>
        <code>manage_input</code>: <code>walk_to</code>, <code>click_world</code>, <code>walk_and_click</code> (3D
        objects), <code>click_path</code> (PlayerGui buttons), <code>key</code>, <code>type_text</code>. Screen
        buttons can also use <code>manage_ui.click</code>. Clicks use <code>UserInputService:CreateVirtualInput</code>.
      </p>

      <h2>execute_luau vs Play</h2>
      <p>
        <code>execute_luau</code> is Edit-only (plugin <code>loadstring</code>). In Play, use{" "}
        <code>run_test</code> / play agents, or <code>play_stop</code> first. Errors include a Fix: line pointing at
        that.
      </p>

      <Pager prev={{ href: "/docs/mcp", label: "MCP setup" }} next={{ href: "/docs/dashboard", label: "Dashboard" }} />
    </article>
  );
}
