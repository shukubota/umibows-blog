"use server";

import { Grid, Point, StoneColor } from "@/hooks/go/engine";

const IGO_API_URL = process.env.IGO_API_URL ?? "http://localhost:8080";

export async function warmupModel(): Promise<boolean> {
  try {
    const res = await fetch(`${IGO_API_URL}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function computeCpuMoveNN(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Promise<Point | null> {
  const res = await fetch(`${IGO_API_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grid, color, previousGrid }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`igo-api predict failed: ${res.status}`);

  const { move } = (await res.json()) as { move: Point | null };
  return move;
}
