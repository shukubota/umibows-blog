"use strict";
import express from "express";
import path from "path";
import { Grid, Point, StoneColor, getAllLegalMoves, applyMove, pointKey, opponent } from "./engine";
import { boardToFeatures, N_PLANES } from "./board-features";

const app = express();
app.use(express.json({ limit: "1mb" }));

const BOARD_SIZE = 9;
const MODEL_PATH = path.join(__dirname, "..", "models", "go-policy.onnx");
const C_PUCT = 1.5;
const MCTS_SIMS = 50;

let session: import("onnxruntime-node").InferenceSession | null = null;
let ort: typeof import("onnxruntime-node") | null = null;

async function getSession() {
  if (session) return session;
  console.log("[igo-api] loading model:", MODEL_PATH);
  ort = await import("onnxruntime-node");
  session = await ort.InferenceSession.create(MODEL_PATH);
  console.log("[igo-api] model loaded. inputs:", session.inputNames, "outputs:", session.outputNames);
  return session;
}

getSession().catch((e) => console.error("[igo-api] warmup failed:", e));

// ── NN inference: returns { policy: Float32Array[81], value: number } ─────────

async function runNN(grid: Grid, color: StoneColor): Promise<{ policy: Float32Array; value: number }> {
  const sess = await getSession();
  const featureData = boardToFeatures(grid, color);
  const tensor = new ort!.Tensor("float32", featureData, [1, N_PLANES, BOARD_SIZE, BOARD_SIZE]);
  const output = await sess.run({ input: tensor });
  const logits = output["policy"].data as Float32Array;
  const value = (output["value"].data as Float32Array)[0];

  // Softmax
  let maxL = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > maxL) maxL = logits[i];
  let sumExp = 0;
  const policy = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) { policy[i] = Math.exp(logits[i] - maxL); sumExp += policy[i]; }
  for (let i = 0; i < logits.length; i++) policy[i] /= sumExp;

  return { policy, value };
}

// ── MCTS node ─────────────────────────────────────────────────────────────────

interface MctsNode {
  prior: number;
  visits: number;
  valueSum: number;
  children: Map<string, { move: Point; node: MctsNode }>;
  expanded: boolean;
}

function makeNode(prior = 1.0): MctsNode {
  return { prior, visits: 0, valueSum: 0, children: new Map(), expanded: false };
}

function q(node: MctsNode): number {
  return node.visits === 0 ? 0 : node.valueSum / node.visits;
}

function puctScore(node: MctsNode, parentVisits: number): number {
  return q(node) + C_PUCT * node.prior * Math.sqrt(parentVisits) / (1 + node.visits);
}

// ── Single MCTS simulation (async: calls NN at leaf) ─────────────────────────

async function simulate(
  root: MctsNode,
  grid: Grid,
  color: StoneColor,
  prevGrid: Grid | null
): Promise<void> {
  const path: MctsNode[] = [root];
  let curGrid = grid;
  let curColor = color;
  let curPrev = prevGrid;

  // Selection
  let node = root;
  while (node.expanded && node.children.size > 0) {
    let bestScore = -Infinity;
    let bestKey = "";
    let bestChild!: MctsNode;
    let bestMove!: Point;
    for (const [key, { move, node: child }] of node.children) {
      const s = puctScore(child, node.visits);
      if (s > bestScore) { bestScore = s; bestKey = key; bestChild = child; bestMove = move; }
    }
    const { nextGrid } = applyMove(curGrid, bestMove, curColor);
    curPrev = curGrid;
    curGrid = nextGrid;
    curColor = opponent(curColor);
    node = bestChild;
    path.push(node);
  }

  // Expansion + NN eval
  const { policy, value } = await runNN(curGrid, curColor);
  const legal = getAllLegalMoves(curGrid, curColor, curPrev);
  let v = value; // value from current player's perspective

  if (legal.length > 0 && !node.expanded) {
    for (const move of legal) {
      const key = pointKey(move);
      const prior = policy[move.row * BOARD_SIZE + move.col];
      node.children.set(key, { move, node: makeNode(prior) });
    }
    node.expanded = true;
  }

  // Backprop (flip sign each level)
  let sign = 1;
  for (let i = path.length - 1; i >= 0; i--) {
    path[i].visits++;
    path[i].valueSum += sign * v;
    sign = -sign;
  }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: session ? "loaded" : "loading" });
});

app.post("/predict", async (req, res) => {
  try {
    const { grid, color, previousGrid } = req.body as {
      grid: Grid;
      color: StoneColor;
      previousGrid: Grid | null;
    };

    const legalMoves = getAllLegalMoves(grid, color, previousGrid);
    if (legalMoves.length === 0) return res.json({ move: null });

    const t0 = Date.now();
    const root = makeNode();

    // Run MCTS_SIMS simulations sequentially (each needs NN call)
    for (let i = 0; i < MCTS_SIMS; i++) {
      await simulate(root, grid, color, previousGrid);
    }

    // Pick most-visited child
    let bestMove: Point | null = null;
    let bestVisits = -1;
    for (const { move, node } of root.children.values()) {
      if (node.visits > bestVisits) { bestVisits = node.visits; bestMove = move; }
    }

    console.log(
      `[igo-api] move: ${bestMove ? `(${bestMove.row},${bestMove.col})` : "null"} ` +
      `sims=${MCTS_SIMS} in ${Date.now() - t0}ms`
    );

    res.json({ move: bestMove });
  } catch (e) {
    console.error("[igo-api] predict error:", e);
    res.status(500).json({ error: "inference failed" });
  }
});

const port = parseInt(process.env.PORT ?? "8080", 10);
app.listen(port, () => console.log(`[igo-api] listening on :${port}`));
