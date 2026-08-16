import { z } from "zod";
import { defineTool, runLuau, type ToolContext } from "./helpers.js";

export function registerExecuteTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "execute_luau",
    "Run arbitrary Luau code in Roblox Studio (plugin security level, Edit-only). During Play use manage_studio.run_test / play agents instead — plugin loadstring is unavailable in Play. The code may `return` a value, which is JSON-encoded (Instances become path strings, Roblox types become typed tables). A helper table `RB` is available with RB.resolve(path or rbId), RB.encode(value), RB.summary(instance) (includes rbId), RB.setProp(instance, name, value), RB.stripIds().",
    {
      code: z.string().describe("Luau source to run"),
      timeoutSeconds: z.number().optional().describe("Max wait (default 30)"),
    },
    async (args, ctx) => {
      const timeout = typeof args.timeoutSeconds === "number" ? args.timeoutSeconds * 1000 : 30_000;
      return runLuau(
        ctx,
        "execute_luau",
        `
local RB, A = ...
local fn, err = loadstring(A.code)
if not fn then
  error("Syntax error: " .. tostring(err) .. ". execute_luau is Edit-only (plugin loadstring). In Play use manage_studio.run_test / play agents.")
end
local env = getfenv(fn)
env.RB = RB
local result = fn()
return RB.encode(result)
`,
        args,
        timeout
      );
    }
  );

  defineTool(
    ctx,
    "batch_execute",
    "Run several RoBridge tool calls in one request as a single undo waypoint. Each command is {tool, args}. Stops on first error unless continueOnError is true (stopOnError is the inverse alias). Nested batch_execute is rejected. Prefer this over many round-trips for related mutations.",
    {
      commands: z
        .array(z.object({ tool: z.string(), args: z.record(z.any()).optional() }))
        .describe("Ordered list of tool calls"),
      continueOnError: z.boolean().optional(),
      stopOnError: z.boolean().optional().describe("Alias (default true). Inverse of continueOnError."),
      waypoint: z.string().optional().describe("ChangeHistoryService waypoint name for the batch"),
    },
    async (args, ctx) => {
      const commands = args.commands as { tool: string; args?: Record<string, unknown> }[];
      const stopOnError = args.continueOnError ? false : args.stopOnError !== false;
      const waypoint = String(args.waypoint ?? `RoBridge batch (${commands.length})`);
      try {
        await runLuau(ctx, "batch_execute", `local RB, A = ...\nRB.waypoint(A.name)\nreturn { ok = true }`, { name: waypoint + " start" });
      } catch {
        /* no Studio yet — still run commands so the error is per-tool */
      }
      const results: unknown[] = [];
      for (const [i, cmd] of commands.entries()) {
        if (cmd.tool === "batch_execute") {
          results.push({ index: i, tool: cmd.tool, ok: false, error: "Nested batch_execute is not allowed" });
          if (stopOnError) break;
          continue;
        }
        const handler = ctx.registry.get(cmd.tool);
        if (!handler) {
          results.push({
            index: i,
            tool: cmd.tool,
            ok: false,
            error: `Unknown tool: ${cmd.tool}. Call system_info to list connected Studio, then use a registered tool name.`,
          });
          if (stopOnError) break;
          continue;
        }
        try {
          const result = await handler(cmd.args ?? {});
          results.push({ index: i, tool: cmd.tool, ok: true, result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ index: i, tool: cmd.tool, ok: false, error: msg });
          if (stopOnError) break;
        }
      }
      const failed = results.filter((r) => r && typeof r === "object" && (r as { ok?: boolean }).ok === false).length;
      try {
        await runLuau(ctx, "batch_execute", `local RB, A = ...\nRB.waypoint(A.name)\nreturn { ok = true }`, {
          name: `${waypoint} end (${results.length - failed} ok, ${failed} failed)`,
        });
      } catch {
        /* ignore */
      }
      return { completed: results.length, total: commands.length, failed, waypoint, results };
    }
  );
}
