import { ToolDispatcher } from "@/lib/agent/dispatcher";
import { fsTools } from "./fs";
import { httpTools } from "./http";
import { shellTools } from "./shell";
import { searchTools } from "./search";

export function registerBuiltins(d: ToolDispatcher): void {
  for (const t of [...fsTools, ...httpTools, ...shellTools, ...searchTools]) {
    d.register(t.spec, t.handler);
  }
}
