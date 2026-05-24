import { describe, it, expect } from "vitest";
import { ToolDispatcher } from "@/lib/agent/dispatcher";
import type { ToolHandler, ToolSpec } from "@/lib/agent/types";
import { logger } from "@/lib/agent/logger";

function makeSpec(name: string): ToolSpec {
  return {
    name,
    description: "test",
    input_schema: { type: "object", properties: {}, additionalProperties: true },
    source: "builtin",
  };
}

function makeCtx() {
  return {
    sessionId: "test",
    signal: new AbortController().signal,
    logger,
  };
}

describe("ToolDispatcher", () => {
  it("registers and invokes a tool", async () => {
    const d = new ToolDispatcher();
    const handler: ToolHandler = {
      async invoke(input) {
        return { ok: true, content: JSON.stringify(input) };
      },
    };
    d.register(makeSpec("hello"), handler);
    const r = await d.invoke("hello", { foo: 1 }, makeCtx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain('"foo":1');
  });

  it("returns ToolNotFound for missing tool", async () => {
    const d = new ToolDispatcher();
    await expect(d.invoke("missing", {}, makeCtx())).rejects.toMatchObject({
      code: "ToolNotFound",
    });
  });

  it("wraps thrown errors into ok=false ToolResult", async () => {
    const d = new ToolDispatcher();
    d.register(makeSpec("bad"), {
      async invoke() {
        throw new Error("boom");
      },
    });
    const r = await d.invoke("bad", {}, makeCtx());
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("ToolError");
  });

  it("specs() lists registered tools", () => {
    const d = new ToolDispatcher();
    d.register(makeSpec("a"), {
      async invoke() {
        return { ok: true, content: "" };
      },
    });
    d.register(makeSpec("b"), {
      async invoke() {
        return { ok: true, content: "" };
      },
    });
    expect(
      d
        .specs()
        .map((s) => s.name)
        .sort()
    ).toEqual(["a", "b"]);
  });
});
