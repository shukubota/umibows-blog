import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { loadSkills } from "@/lib/skills/loader";
import { selectSkill, ruleCandidates } from "@/lib/skills/selector";

const tmp = path.join(os.tmpdir(), `agent-skill-test-${process.pid}`);

beforeAll(async () => {
  await fs.mkdir(path.join(tmp, "demo"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "demo", "skill.yaml"),
    `name: demo\nversion: 0.0.1\ndescription: demo skill\ntriggers:\n  keywords: [hello, テスト]\ntools: []\nprompt: SKILL.md\n`
  );
  await fs.writeFile(path.join(tmp, "demo", "SKILL.md"), "# demo\nhello");
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("skill loader/selector", () => {
  it("loads a valid manifest with prompt body", async () => {
    const skills = await loadSkills(tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.name).toBe("demo");
    expect(skills[0].promptBody).toContain("hello");
  });

  it("rule candidates by keyword match", async () => {
    const skills = await loadSkills(tmp);
    expect(ruleCandidates("hello world", skills).map((s) => s.manifest.name)).toEqual(["demo"]);
    expect(ruleCandidates("テスト", skills).map((s) => s.manifest.name)).toEqual(["demo"]);
    expect(ruleCandidates("nothing matches", skills)).toEqual([]);
  });

  it("selectSkill returns single rule match without LLM", async () => {
    const skills = await loadSkills(tmp);
    const sel = await selectSkill("hello", skills);
    expect(sel.skill?.manifest.name).toBe("demo");
    expect(sel.reason).toContain("single rule");
  });
});
