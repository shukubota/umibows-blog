import { spawn } from "node:child_process";
import { z } from "zod";
import { ToolError } from "@/lib/agent/errors";
import config from "@/agent.config";
import type { RegisteredTool, ToolHandler, ToolResult, ToolSpec } from "@/lib/agent/types";

const ExecInput = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});

const spec: ToolSpec = {
  name: "shell_exec",
  description:
    "Execute an allow-listed command with arguments (no shell, no interpolation). Returns exit code and captured stdout/stderr.",
  input_schema: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "executable name from allow list" },
      args: { type: "array" },
      cwd: { type: "string" },
      timeoutMs: { type: "number" },
    },
    required: ["cmd"],
    additionalProperties: false,
  },
  source: "builtin",
};

const handler: ToolHandler = {
  async invoke(input, ctx): Promise<ToolResult> {
    const parsed = ExecInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolError("ToolValidation", parsed.error.message);
    }
    if (!config.tools.shell.allowCmds.includes(parsed.data.cmd)) {
      throw new ToolError("ToolError", `command not allowed: ${parsed.data.cmd}`);
    }
    const timeout = parsed.data.timeoutMs ?? config.tools.shell.defaultTimeoutMs;

    return new Promise<ToolResult>((resolve) => {
      const child = spawn(parsed.data.cmd, parsed.data.args, {
        cwd: parsed.data.cwd,
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      const cap = 64 * 1024;

      child.stdout.on("data", (b: Buffer) => {
        if (stdout.length < cap) stdout += b.toString("utf-8");
      });
      child.stderr.on("data", (b: Buffer) => {
        if (stderr.length < cap) stderr += b.toString("utf-8");
      });

      const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
      const onAbort = () => child.kill("SIGTERM");
      ctx.signal.addEventListener("abort", onAbort);

      child.on("close", (code) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", onAbort);
        resolve({
          ok: code === 0,
          content: JSON.stringify({
            exitCode: code,
            stdout: stdout.slice(0, cap),
            stderr: stderr.slice(0, cap),
          }),
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", onAbort);
        resolve({
          ok: false,
          content: `ToolError: ${err.message}`,
          error: { code: "ToolError", message: err.message },
        });
      });
    });
  },
};

export const shellTools: RegisteredTool[] = [{ spec, handler }];
