import { z } from "zod";
import { ToolError } from "@/lib/agent/errors";
import config from "@/agent.config";
import type { RegisteredTool, ToolHandler, ToolResult, ToolSpec } from "@/lib/agent/types";

const Input = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(20).optional(),
});

const spec: ToolSpec = {
  name: "search_web",
  description: "Search the web. The provider is configurable; the stub returns no results.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      topK: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  source: "builtin",
};

const handler: ToolHandler = {
  async invoke(input): Promise<ToolResult> {
    const parsed = Input.safeParse(input);
    if (!parsed.success) {
      throw new ToolError("ToolValidation", parsed.error.message);
    }
    if (config.tools.search.provider === "stub") {
      return {
        ok: true,
        content: JSON.stringify({
          results: [],
          note: "search_web provider=stub. Configure agent.config.ts to enable.",
        }),
      };
    }
    throw new ToolError("ToolError", "external search provider not implemented");
  },
};

export const searchTools: RegisteredTool[] = [{ spec, handler }];
