import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          id: "msg_1",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hi" }],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      };
    },
  };
});

describe("llm.complete (mocked)", () => {
  it("returns normalized result", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const { complete } = await import("@/lib/llm/claude");
    const res = await complete({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(res.stopReason).toBe("end_turn");
    expect(res.content[0]).toEqual({ type: "text", text: "hi" });
    expect(res.usage).toEqual({ input_tokens: 1, output_tokens: 2 });
  });
});
