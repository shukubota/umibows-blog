import { describe, it, expect } from "vitest";
import { shellTools } from "@/lib/tools/shell";
import { logger } from "@/lib/agent/logger";

function ctx() {
  return { sessionId: "t", signal: new AbortController().signal, logger };
}

describe("shell.exec", () => {
  it("executes an allow-listed command", async () => {
    const r = await shellTools[0].handler.invoke({ cmd: "echo", args: ["hi"] }, ctx());
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain("hi");
  });

  it("rejects non-allow-listed command", async () => {
    await expect(
      shellTools[0].handler.invoke({ cmd: "rm", args: ["-rf", "/"] }, ctx())
    ).rejects.toMatchObject({ code: "ToolError" });
  });
});
