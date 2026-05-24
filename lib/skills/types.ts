import { z } from "zod";

export const SkillToolRefSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("builtin"), name: z.string() }),
  z.object({ source: z.literal("mcp"), server: z.string(), name: z.string() }),
  z.object({ source: z.literal("skill"), skill: z.string(), name: z.string() }),
]);

export const SkillManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case"),
  version: z.string().default("0.0.0"),
  description: z.string(),
  triggers: z
    .object({
      keywords: z.array(z.string()).default([]),
    })
    .default({ keywords: [] }),
  tools: z.array(SkillToolRefSchema).default([]),
  prompt: z.string().default("SKILL.md"),
  entrypoint: z.string().optional(),
});

export type SkillToolRef = z.infer<typeof SkillToolRefSchema>;
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export interface Skill {
  manifest: SkillManifest;
  dir: string;
  promptBody: string;
}
