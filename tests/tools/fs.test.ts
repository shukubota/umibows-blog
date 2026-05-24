import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

const tmpRoot = path.join(os.tmpdir(), `agent-fs-test-${process.pid}`);

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  process.env.AGENT_FS_TEST_ROOT = tmpRoot;
});
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("fs tools", () => {
  it("write then read within configured root", async () => {
    const mod = await import("@/agent.config");
    mod.default.tools.fs.roots = [tmpRoot];
    const { fsTools } = await import("@/lib/tools/fs");
    const { logger } = await import("@/lib/agent/logger");

    const target = path.join(tmpRoot, "hello.txt");
    const ctx = { sessionId: "t", signal: new AbortController().signal, logger };

    const writeRes = await fsTools[1].handler.invoke({ path: target, content: "hi" }, ctx);
    expect(writeRes.ok).toBe(true);

    const readRes = await fsTools[0].handler.invoke({ path: target }, ctx);
    expect(readRes.ok).toBe(true);
    expect(readRes.content).toBe("hi");
  });

  it("rejects path outside roots", async () => {
    const mod = await import("@/agent.config");
    mod.default.tools.fs.roots = [tmpRoot];
    const { fsTools } = await import("@/lib/tools/fs");
    const { logger } = await import("@/lib/agent/logger");
    const ctx = { sessionId: "t", signal: new AbortController().signal, logger };
    await expect(fsTools[0].handler.invoke({ path: "/etc/passwd" }, ctx)).rejects.toMatchObject({
      code: "ToolError",
    });
  });
});
