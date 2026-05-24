import type { Skill } from "./types";
import { complete } from "@/lib/llm/claude";
import config from "@/agent.config";
import { logger } from "@/lib/agent/logger";

export interface SelectResult {
  skill: Skill | null;
  candidates: Skill[];
  reason: string;
}

/** Rule-based candidate extraction by keyword match. */
export function ruleCandidates(input: string, skills: Skill[]): Skill[] {
  const norm = input.toLowerCase();
  return skills.filter((s) =>
    s.manifest.triggers.keywords.some((kw) => norm.includes(kw.toLowerCase()))
  );
}

/** Cosine similarity over simple bag-of-chars (Phase 5: replace with embeddings). */
function charBag(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of s.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  a.forEach((v) => {
    na += v * v;
  });
  b.forEach((v) => {
    nb += v * v;
  });
  a.forEach((v, k) => {
    const bv = b.get(k);
    if (bv) dot += v * bv;
  });
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function similarityRank(input: string, skills: Skill[]): { skill: Skill; score: number }[] {
  const a = charBag(input);
  return skills
    .map((s) => ({
      skill: s,
      score: cosine(a, charBag(`${s.manifest.name} ${s.manifest.description}`)),
    }))
    .sort((x, y) => y.score - x.score);
}

/** Select a single Skill using rule candidates first, then ask the LLM to disambiguate. */
export async function selectSkill(input: string, skills: Skill[]): Promise<SelectResult> {
  if (skills.length === 0) {
    return { skill: null, candidates: [], reason: "no skills" };
  }
  const candidates = ruleCandidates(input, skills);
  if (candidates.length === 0) {
    const ranked = similarityRank(input, skills).filter((r) => r.score > 0.2);
    if (ranked.length === 0) return { skill: null, candidates: [], reason: "no candidates" };
    return { skill: ranked[0].skill, candidates: ranked.map((r) => r.skill), reason: "similarity" };
  }
  if (candidates.length === 1) {
    return { skill: candidates[0], candidates, reason: "single rule match" };
  }
  // Multiple candidates: ask Claude to choose
  try {
    const list = candidates
      .map((c) => `- ${c.manifest.name}: ${c.manifest.description}`)
      .join("\n");
    const res = await complete({
      model: config.model.secondary,
      system:
        "Select the single most appropriate skill name to handle the user input. Output ONLY the skill name, nothing else.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User input: ${input}\n\nCandidates:\n${list}`,
            },
          ],
        },
      ],
      maxTokens: 32,
    });
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text.trim())
      .join("");
    const chosen = candidates.find((c) => text.includes(c.manifest.name));
    if (chosen) return { skill: chosen, candidates, reason: "llm chose" };
  } catch (e) {
    logger.warn({ err: String(e) }, "skill.selector.llm_failed");
  }
  return { skill: candidates[0], candidates, reason: "fallback first" };
}
