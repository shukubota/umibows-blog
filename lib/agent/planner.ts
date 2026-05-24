import { z } from "zod";
import { complete } from "@/lib/llm/claude";
import { AgentError } from "./errors";
import config from "@/agent.config";
import { logger } from "./logger";
import type { ToolSpec } from "./types";

export const PlanSchema = z.object({
  goal: z.string(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string().optional(),
        tool: z.string().optional(),
      })
    )
    .min(1),
  expected_output: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

const planToolSpec: ToolSpec = {
  name: "plan",
  description: "Emit a structured plan with goal and steps before solving the task.",
  input_schema: {
    type: "object",
    properties: {
      goal: { type: "string" },
      steps: {
        type: "array",
      },
      expected_output: { type: "string" },
    },
    required: ["goal", "steps"],
  },
  source: "builtin",
};

export async function makePlan(input: string): Promise<Plan> {
  const res = await complete({
    model: config.model.secondary,
    system:
      "You are a planner. Given a user task, produce a short structured plan. Use the `plan` tool to return the plan; do not produce free text. Keep steps minimal (3-5).",
    messages: [{ role: "user", content: [{ type: "text", text: input }] }],
    tools: [planToolSpec],
    toolChoice: { type: "tool", name: "plan" },
    maxTokens: 1024,
  });
  const toolUse = res.content.find(
    (b): b is { type: "tool_use"; id: string; name: string; input: unknown } =>
      b.type === "tool_use" && b.name === "plan"
  );
  if (!toolUse) {
    throw new AgentError("LlmError", "planner did not emit a tool_use");
  }
  const parsed = PlanSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    logger.warn({ err: parsed.error.message }, "plan.invalid");
    throw new AgentError("LlmError", `plan schema invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}
