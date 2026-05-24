import path from "node:path";

export interface AgentConfig {
  model: { primary: string; secondary: string };
  loop: { maxTurns: number; maxTokens: number; toolTimeoutMs: number };
  tools: {
    fs: { roots: string[] };
    http: { allowHosts: string[]; defaultTimeoutMs: number };
    shell: { allowCmds: string[]; defaultTimeoutMs: number };
    search: { provider: "stub" | "external" };
  };
  memory: { sqlitePath: string; summarizeAfterTokens: number };
  mcp: { configPath: string };
  skills: { rootDir: string };
}

const projectRoot = process.cwd();

const config: AgentConfig = {
  model: {
    primary: process.env.AGENT_MODEL_PRIMARY ?? "claude-sonnet-4-5",
    secondary: process.env.AGENT_MODEL_SECONDARY ?? "claude-haiku-4-5-20251001",
  },
  loop: { maxTurns: 20, maxTokens: 4096, toolTimeoutMs: 30_000 },
  tools: {
    fs: { roots: [path.resolve(projectRoot, "workspace")] },
    http: {
      allowHosts: [
        "api.github.com",
        "raw.githubusercontent.com",
        "query1.finance.yahoo.com",
        "query2.finance.yahoo.com",
      ],
      defaultTimeoutMs: 15_000,
    },
    shell: {
      allowCmds: ["git", "ls", "cat", "echo", "pwd", "node"],
      defaultTimeoutMs: 10_000,
    },
    search: { provider: "stub" },
  },
  memory: {
    sqlitePath: path.resolve(projectRoot, ".data/agent.db"),
    summarizeAfterTokens: 12_000,
  },
  mcp: { configPath: path.resolve(projectRoot, "mcp.config.json") },
  skills: { rootDir: path.resolve(projectRoot, "skills") },
};

export default config;
