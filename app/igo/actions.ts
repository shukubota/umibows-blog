"use server";

import path from "path";
import { Grid, Point, StoneColor, getAllLegalMoves, pointKey } from "@/hooks/go/engine";
import { boardToFeatures, N_PLANES } from "@/hooks/go/board-features";
import { puctMcts } from "@/hooks/go/puct-mcts";

const BOARD_SIZE = 9;
const MODEL_PATH = path.join(process.cwd(), "public", "models", "go-policy.onnx");

// Module-level session cache — reused while the Vercel instance stays warm
let session: import("onnxruntime-node").InferenceSession | null = null;

async function getSession() {
  if (session) {
    console.log("[igo/NN] session cache hit");
    return session;
  }
  console.log("[igo/NN] loading model from:", MODEL_PATH);
  const ort = await import("onnxruntime-node");
  console.log("[igo/NN] onnxruntime-node imported, creating session...");
  session = await ort.InferenceSession.create(MODEL_PATH);
  console.log(
    "[igo/NN] session created. input names:",
    session.inputNames,
    "output names:",
    session.outputNames
  );
  return session;
}

export async function warmupModel(): Promise<void> {
  try {
    await getSession();
    console.log("[igo/NN] warmup OK");
  } catch (e) {
    console.error("[igo/NN] warmup FAILED:", e);
    throw e;
  }
}

export async function computeCpuMoveNN(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Promise<Point | null> {
  const legalMoves = getAllLegalMoves(grid, color, previousGrid);
  if (legalMoves.length === 0) return null;

  let sess: import("onnxruntime-node").InferenceSession;
  try {
    sess = await getSession();
  } catch (e) {
    console.error("[igo/NN] getSession failed, falling back to MCTS:", e);
    throw new Error("NN model unavailable");
  }

  const ort = await import("onnxruntime-node");
  const featureData = boardToFeatures(grid, color);
  const inputTensor = new ort.Tensor("float32", featureData, [1, N_PLANES, BOARD_SIZE, BOARD_SIZE]);

  console.log("[igo/NN] running inference, legal moves:", legalMoves.length);
  const output = await sess.run({ input: inputTensor });
  const logits = output["policy"].data as Float32Array; // [81]

  // Softmax over legal moves only (mask out illegal positions)
  let maxLogit = -Infinity;
  for (const m of legalMoves) {
    const l = logits[m.row * BOARD_SIZE + m.col];
    if (l > maxLogit) maxLogit = l;
  }
  let sumExp = 0;
  const exps: Array<{ key: string; exp: number }> = [];
  for (const m of legalMoves) {
    const e = Math.exp(logits[m.row * BOARD_SIZE + m.col] - maxLogit);
    exps.push({ key: pointKey(m), exp: e });
    sumExp += e;
  }
  const priors = new Map<string, number>(exps.map(({ key, exp }) => [key, exp / sumExp]));

  // Log top-3 NN priors
  const top3 = legalMoves
    .map((m) => ({ move: m, prior: priors.get(pointKey(m)) ?? 0 }))
    .sort((a, b) => b.prior - a.prior)
    .slice(0, 3);
  console.log(
    "[igo/NN+MCTS] top priors:",
    top3.map((s) => `(${s.move.row},${s.move.col})=${(s.prior * 100).toFixed(1)}%`).join(" | ")
  );

  // PUCT-MCTS guided by NN priors
  const t0 = Date.now();
  const bestMove = puctMcts(grid, color, previousGrid, priors, 800);
  console.log(
    `[igo/NN+MCTS] chosen: ${bestMove ? `(${bestMove.row},${bestMove.col})` : "null"} in ${Date.now() - t0}ms`
  );

  return bestMove;
}
