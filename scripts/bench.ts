/**
 * Minimal evaluation bench for the self-built agent.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/bench.ts
 *
 * Reads scripts/bench-cases.json (created lazily with defaults if missing),
 * runs each case via runAgent (with builtins registered), and prints a
 * summary of: success rate, average turns, total tokens, per-case latency.
 *
 * "Success" is determined by an `expect` substring match (case-insensitive)
 * on the agent's final text. Cases without `expect` are reported as "n/a".
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { bootstrapBuiltins } from "@/lib/agent/bootstrap";
import { runAgent } from "@/lib/agent/loop";

interface BenchCase {
  name: string;
  input: string;
  expect?: string;
}

const defaultCases: BenchCase[] = [
  { name: "greeting", input: "こんにちは", expect: "" },
  { name: "math", input: "2+2を計算して", expect: "4" },
  {
    name: "tool-use-fs",
    input:
      "Create a file called bench-test.txt with the text 'ok' in the workspace and confirm it.",
  },
];

async function loadCases(): Promise<BenchCase[]> {
  const file = path.resolve(process.cwd(), "scripts/bench-cases.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as BenchCase[];
  } catch {
    await fs.writeFile(file, JSON.stringify(defaultCases, null, 2));
    return defaultCases;
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  bootstrapBuiltins();
  const cases = await loadCases();

  const rows: Array<{
    name: string;
    ok: string;
    turns: number;
    tokens: number;
    ms: number;
    text: string;
  }> = [];
  let succeeded = 0;
  let evaluable = 0;

  for (const c of cases) {
    const t0 = Date.now();
    try {
      const res = await runAgent(c.input);
      const ms = Date.now() - t0;
      const tokens = res.usage.input_tokens + res.usage.output_tokens;
      const text = res.text.replace(/\s+/g, " ").slice(0, 200);
      let ok = "n/a";
      if (c.expect) {
        evaluable++;
        const pass = res.text.toLowerCase().includes(c.expect.toLowerCase());
        if (pass) succeeded++;
        ok = pass ? "PASS" : "FAIL";
      }
      rows.push({ name: c.name, ok, turns: res.turns, tokens, ms, text });
    } catch (e) {
      rows.push({
        name: c.name,
        ok: "ERROR",
        turns: 0,
        tokens: 0,
        ms: Date.now() - t0,
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log("\n=== bench results ===");
  for (const r of rows) {
    console.log(
      `[${r.ok.padEnd(5)}] ${r.name.padEnd(20)} turns=${r.turns} tokens=${r.tokens} ms=${r.ms}  ${r.text}`
    );
  }
  console.log("\n=== summary ===");
  console.log(`evaluated: ${evaluable}`);
  console.log(`succeeded: ${succeeded}`);
  console.log(
    `success rate: ${evaluable === 0 ? "n/a" : ((succeeded / evaluable) * 100).toFixed(1) + "%"}`
  );
  const totalTurns = rows.reduce((s, r) => s + r.turns, 0);
  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  console.log(`avg turns: ${(totalTurns / rows.length).toFixed(2)}`);
  console.log(`total tokens: ${totalTokens}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
