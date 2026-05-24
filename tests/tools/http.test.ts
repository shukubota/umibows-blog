import { describe, it, expect } from "vitest";
import { httpTools } from "@/lib/tools/http";
import { logger } from "@/lib/agent/logger";

function ctx() {
  return { sessionId: "t", signal: new AbortController().signal, logger };
}

describe("http.fetch", () => {
  it("rejects disallowed host without making a network call", async () => {
    await expect(
      httpTools[0].handler.invoke({ url: "https://example.com/" }, ctx())
    ).rejects.toMatchObject({ code: "ToolError" });
  });

  it("validates input shape", async () => {
    await expect(httpTools[0].handler.invoke({ url: "not-a-url" }, ctx())).rejects.toMatchObject({
      code: "ToolValidation",
    });
  });
});
