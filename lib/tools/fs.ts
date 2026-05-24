import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { ToolError } from "@/lib/agent/errors";
import config from "@/agent.config";
import type { RegisteredTool, ToolHandler, ToolResult, ToolSpec } from "@/lib/agent/types";

const ReadInput = z.object({
  path: z.string().min(1),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024)
    .optional(),
});

const WriteInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});

function assertWithinRoots(targetAbs: string): void {
  const roots = config.tools.fs.roots.map((r) => path.resolve(r));
  if (!roots.some((root) => targetAbs === root || targetAbs.startsWith(root + path.sep))) {
    throw new ToolError("ToolError", `path outside allowed roots: ${targetAbs}`);
  }
}

function resolveSafe(p: string): string {
  return path.resolve(p);
}

const readSpec: ToolSpec = {
  name: "fs_read",
  description:
    "Read a UTF-8 file from the local filesystem. Only paths under the configured roots are allowed.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative file path" },
      maxBytes: { type: "number", description: "Optional byte cap (default 256KB)" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  source: "builtin",
};

const readHandler: ToolHandler = {
  async invoke(input): Promise<ToolResult> {
    const parsed = ReadInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolError("ToolValidation", parsed.error.message);
    }
    const abs = resolveSafe(parsed.data.path);
    assertWithinRoots(abs);
    const cap = parsed.data.maxBytes ?? 256 * 1024;
    const buf = await fs.readFile(abs);
    const truncated = buf.length > cap;
    const content = (truncated ? buf.subarray(0, cap) : buf).toString("utf-8");
    return {
      ok: true,
      content,
      raw: { bytes: buf.length, truncated, path: abs },
    };
  },
};

const writeSpec: ToolSpec = {
  name: "fs_write",
  description:
    "Write text content to a file under the configured roots. Creates parent directories.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  source: "builtin",
};

const writeHandler: ToolHandler = {
  async invoke(input): Promise<ToolResult> {
    const parsed = WriteInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolError("ToolValidation", parsed.error.message);
    }
    const abs = resolveSafe(parsed.data.path);
    assertWithinRoots(abs);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, parsed.data.content, "utf-8");
    return {
      ok: true,
      content: JSON.stringify({ bytes: Buffer.byteLength(parsed.data.content), path: abs }),
    };
  },
};

export const fsTools: RegisteredTool[] = [
  { spec: readSpec, handler: readHandler },
  { spec: writeSpec, handler: writeHandler },
];
