import path from "node:path";
import { pathToFileURL } from "node:url";
import { AgentError } from "@/lib/agent/errors";
import { defaultDispatcher, ToolDispatcher } from "@/lib/agent/dispatcher";
import { connectServer, toRegisteredTools, getServerHandle } from "@/lib/mcp/client";
import { loadMcpConfig } from "@/lib/mcp/config";
import { logger } from "@/lib/agent/logger";
import { runAgent } from "@/lib/agent/loop";
import type { Skill, SkillToolRef } from "./types";
import type { Message, RunResult, ToolSpec } from "@/lib/agent/types";

export interface SkillRunInput {
  input: string | Message[];
  skill: Skill;
  dispatcher?: ToolDispatcher;
  systemPrompt?: string;
}

/** Resolve referenced tools, registering MCP servers as needed; returns the filtered ToolSpec list. */
async function resolveSkillTools(skill: Skill, dispatcher: ToolDispatcher): Promise<ToolSpec[]> {
  const mcpServersNeeded = new Set<string>();
  for (const ref of skill.manifest.tools) {
    if (ref.source === "mcp") mcpServersNeeded.add(ref.server);
  }

  if (mcpServersNeeded.size > 0) {
    const cfg = await loadMcpConfig();
    for (const server of Array.from(mcpServersNeeded)) {
      if (getServerHandle(server)) continue;
      const sc = cfg.servers[server];
      if (!sc) {
        logger.warn({ server }, "skill.mcp_server_missing");
        continue;
      }
      try {
        const handle = await connectServer(server, sc);
        for (const t of toRegisteredTools(handle)) {
          if (!dispatcher.has(t.spec.name)) dispatcher.register(t.spec, t.handler);
        }
      } catch (e) {
        logger.warn({ server, err: String(e) }, "skill.mcp_connect_failed");
      }
    }
  }

  const resolvedNames = new Set<string>();
  for (const ref of skill.manifest.tools) {
    const fullName = toFullToolName(ref);
    if (dispatcher.has(fullName)) resolvedNames.add(fullName);
  }
  return dispatcher.specs().filter((s) => resolvedNames.has(s.name));
}

function toFullToolName(ref: SkillToolRef): string {
  switch (ref.source) {
    case "builtin":
      return ref.name;
    case "mcp":
      return `mcp__${ref.server}__${ref.name}`;
    case "skill":
      return `skill__${ref.skill}__${ref.name}`;
  }
}

export interface SkillRunnerContext {
  input: string | Message[];
  tools: ToolSpec[];
  dispatcher: ToolDispatcher;
  logger: typeof logger;
  llm: typeof import("@/lib/llm/claude");
}

export type SkillEntrypoint = (ctx: SkillRunnerContext) => Promise<RunResult>;

export async function runSkill({
  skill,
  input,
  dispatcher,
  systemPrompt,
}: SkillRunInput): Promise<RunResult> {
  const d = dispatcher ?? defaultDispatcher;
  const tools = await resolveSkillTools(skill, d);
  logger.info({ skill: skill.manifest.name, tools: tools.map((t) => t.name) }, "skill.run");

  if (skill.manifest.entrypoint) {
    const epPath = path.resolve(skill.dir, skill.manifest.entrypoint);
    let mod: { default?: SkillEntrypoint; run?: SkillEntrypoint };
    try {
      mod = (await import(pathToFileURL(epPath).href)) as {
        default?: SkillEntrypoint;
        run?: SkillEntrypoint;
      };
    } catch (e) {
      throw new AgentError("SkillError", `failed to load entrypoint: ${epPath}`, e);
    }
    const fn = mod.default ?? mod.run;
    if (!fn) throw new AgentError("SkillError", `entrypoint has no default/run export: ${epPath}`);
    const llm = await import("@/lib/llm/claude");
    return fn({ input, tools, dispatcher: d, logger, llm });
  }

  const sys = [
    systemPrompt ?? "You are a self-built AI agent.",
    "",
    `--- SKILL: ${skill.manifest.name} ---`,
    skill.promptBody,
    "--- END SKILL ---",
  ].join("\n");

  return runAgent(input, { systemPrompt: sys }, { dispatcher: d, tools });
}
