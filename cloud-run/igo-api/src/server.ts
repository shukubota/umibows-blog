import express from "express";
import path from "path";
import { Grid, Point, StoneColor, getAllLegalMoves, pointKey } from "./engine";
import { boardToFeatures, N_PLANES } from "./board-features";

const app = express();
app.use(express.json({ limit: "1mb" }));

const BOARD_SIZE = 9;
const MODEL_PATH = path.join(__dirname, "..", "models", "go-policy.onnx");

let session: import("onnxruntime-node").InferenceSession | null = null;

async function getSession() {
  if (session) return session;
  console.log("[igo-api] loading model:", MODEL_PATH);
  const ort = await import("onnxruntime-node");
  session = await ort.InferenceSession.create(MODEL_PATH);
  console.log(
    "[igo-api] model loaded. inputs:",
    session.inputNames,
    "outputs:",
    session.outputNames
  );
  return session;
}

// Warm up on startup
getSession().catch((e) => console.error("[igo-api] warmup failed:", e));

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
    if (legalMoves.length === 0) {
      return res.json({ move: null });
    }

    const sess = await getSession();
    const ort = await import("onnxruntime-node");

    const featureData = boardToFeatures(grid, color);
    const inputTensor = new ort.Tensor("float32", featureData, [
      1,
      N_PLANES,
      BOARD_SIZE,
      BOARD_SIZE,
    ]);

    const output = await sess.run({ input: inputTensor });
    const logits = output["policy"].data as Float32Array;

    // Softmax over legal moves only
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

    // Pick the legal move with the highest NN prior (no rollout MCTS needed)
    const t0 = Date.now();
    let bestMove: Point = legalMoves[0];
    let bestPrior = -Infinity;
    for (const m of legalMoves) {
      const p = priors.get(pointKey(m)) ?? 0;
      if (p > bestPrior) { bestPrior = p; bestMove = m; }
    }
    console.log(
      `[igo-api] move: (${bestMove.row},${bestMove.col}) prior=${(bestPrior * 100).toFixed(1)}% in ${Date.now() - t0}ms`
    );

    res.json({ move: bestMove });
  } catch (e) {
    console.error("[igo-api] predict error:", e);
    res.status(500).json({ error: "inference failed" });
  }
});

const port = parseInt(process.env.PORT ?? "8080", 10);
app.listen(port, () => console.log(`[igo-api] listening on :${port}`));
