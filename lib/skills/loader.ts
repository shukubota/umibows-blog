import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { AgentError } from "@/lib/agent/errors";
import config from "@/agent.config";
import { logger } from "@/lib/agent/logger";
import { SkillManifestSchema, type Skill } from "./types";

export async function loadSkills(rootDir?: string): Promise<Skill[]> {
  const root = rootDir ?? config.skills.rootDir;
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const skills: Skill[] = [];
  for (const name of entries) {
    const dir = path.join(root, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const manifestPath = path.join(dir, "skill.yaml");
    const raw = await fs.readFile(manifestPath, "utf-8").catch(() => null);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = YAML.parse(raw);
    } catch (e) {
      logger.warn({ skill: name, err: String(e) }, "skill.yaml_parse_failed");
      continue;
    }
    const validated = SkillManifestSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn({ skill: name, err: validated.error.message }, "skill.manifest_invalid");
      continue;
    }
    const promptPath = path.join(dir, validated.data.prompt);
    const promptBody = await fs.readFile(promptPath, "utf-8").catch(() => "");
    skills.push({ manifest: validated.data, dir, promptBody });
  }
  logger.info({ count: skills.length }, "skill.loaded");
  return skills;
}

export async function loadSkill(name: string, rootDir?: string): Promise<Skill> {
  const skills = await loadSkills(rootDir);
  const s = skills.find((sk) => sk.manifest.name === name);
  if (!s) throw new AgentError("SkillError", `skill not found: ${name}`);
  return s;
}
