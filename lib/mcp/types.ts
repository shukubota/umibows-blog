import { z } from "zod";

export const McpServerConfigSchema = z.object({
  transport: z.enum(["stdio"]).default("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});

export const McpConfigSchema = z.object({
  servers: z.record(z.string(), McpServerConfigSchema).default({}),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

export interface McpToolListEntry {
  name: string;
  description?: string;
  inputSchema: unknown;
}
