"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ラングトンのありの状態
interface AntState {
  x: number;
  y: number;
  direction: 0 | 1 | 2 | 3; // 0: up, 1: right, 2: down, 3: left
}

// 初期パターンの定義
interface InitialPattern {
  id: string;
  name: string;
  description: string;
  getInitialState: (gridSize: number) => {
    grid: boolean[][];
    ant: AntState;
  };
}

// 初期パターンの定義
const INITIAL_PATTERNS: InitialPattern[] = [
  {
    id: "center",
    name: "中央開始",
    description: "グリッドの中央から開始（標準）",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      return {
        grid,
        ant: { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2), direction: 0 },
      };
    },
  },
  {
    id: "corner",
    name: "角から開始",
    description: "左上角から開始",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      return {
        grid,
        ant: { x: 5, y: 5, direction: 1 },
      };
    },
  },
  {
    id: "cross",
    name: "十字パターン",
    description: "十字の黒いパターンから開始",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      const center = Math.floor(gridSize / 2);

      // 十字パターンを作成
      for (let i = -10; i <= 10; i++) {
        if (center + i >= 0 && center + i < gridSize) {
          grid[center][center + i] = true; // 水平線
          grid[center + i][center] = true; // 垂直線
        }
      }

      return {
        grid,
        ant: { x: center, y: center, direction: 0 },
      };
    },
  },
  {
    id: "diagonal",
    name: "対角線パターン",
    description: "対角線の黒いパターンから開始",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      const center = Math.floor(gridSize / 2);

      // 対角線パターンを作成
      for (let i = -15; i <= 15; i++) {
        if (center + i >= 0 && center + i < gridSize) {
          grid[center + i][center + i] = true; // 主対角線
          if (center - i >= 0 && center - i < gridSize) {
            grid[center + i][center - i] = true; // 反対角線
          }
        }
      }

      return {
        grid,
        ant: { x: center - 5, y: center - 5, direction: 1 },
      };
    },
  },
  {
    id: "square",
    name: "正方形パターン",
    description: "正方形の黒いパターンから開始",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      const center = Math.floor(gridSize / 2);
      const size = 20;

      // 正方形の枠を作成
      for (let i = -size / 2; i <= size / 2; i++) {
        for (let j = -size / 2; j <= size / 2; j++) {
          if (
            center + i >= 0 &&
            center + i < gridSize &&
            center + j >= 0 &&
            center + j < gridSize
          ) {
            if (Math.abs(i) === size / 2 || Math.abs(j) === size / 2) {
              grid[center + i][center + j] = true;
            }
          }
        }
      }

      return {
        grid,
        ant: { x: center, y: center, direction: 0 },
      };
    },
  },
  {
    id: "random",
    name: "ランダムパターン",
    description: "中央付近にランダムな黒いセルを配置",
    getInitialState: (gridSize: number) => {
      const grid = Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(false));
      const center = Math.floor(gridSize / 2);

      // 中央50x50エリアにランダムに黒いセルを配置
      for (let i = 0; i < 100; i++) {
        const x = center + Math.floor(Math.random() * 50) - 25;
        const y = center + Math.floor(Math.random() * 50) - 25;
        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
          grid[y][x] = true;
        }
      }

      return {
        grid,
        ant: { x: center, y: center, direction: 0 },
      };
    },
  },
];

export default function LangtonsAntPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(50); // ms between steps
  const [stepCount, setStepCount] = useState(0);
  const [gridSize, setGridSize] = useState(100);
  const [selectedPattern, setSelectedPattern] = useState("center");

  // グリッドとありの状態
  const gridRef = useRef<boolean[][]>([]);
  const antRef = useRef<AntState>({ x: 50, y: 50, direction: 0 });

  // グリッドの初期化
  const initializeGrid = useCallback(() => {
    const pattern = INITIAL_PATTERNS.find((p) => p.id === selectedPattern) || INITIAL_PATTERNS[0];
    const initialState = pattern.getInitialState(gridSize);

    gridRef.current = initialState.grid;
    antRef.current = initialState.ant;
    setStepCount(0);
  }, [gridSize, selectedPattern]);

  // キャンバスの描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = Math.floor(Math.min(canvas.width, canvas.height) / gridSize);
    const offsetX = (canvas.width - cellSize * gridSize) / 2;
    const offsetY = (canvas.height - cellSize * gridSize) / 2;

    // 背景をクリア
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // グリッドを描画
    const grid = gridRef.current;
    if (grid && grid.length > 0) {
      for (let y = 0; y < gridSize && y < grid.length; y++) {
        for (let x = 0; x < gridSize && x < grid[y].length; x++) {
          if (grid[y][x]) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // ありを描画
    const ant = antRef.current;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(
      offsetX + ant.x * cellSize + 1,
      offsetY + ant.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );

    // ありの向きを示す矢印
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.max(8, cellSize * 0.6)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const arrows = ["↑", "→", "↓", "←"];
    ctx.fillText(
      arrows[ant.direction],
      offsetX + ant.x * cellSize + cellSize / 2,
      offsetY + ant.y * cellSize + cellSize / 2
    );

    // グリッド線を描画
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + i * cellSize, offsetY);
      ctx.lineTo(offsetX + i * cellSize, offsetY + gridSize * cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + i * cellSize);
      ctx.lineTo(offsetX + gridSize * cellSize, offsetY + i * cellSize);
      ctx.stroke();
    }
  }, [gridSize]);

  // ラングトンのありのステップ実行
  const step = useCallback(() => {
    const ant = antRef.current;
    const grid = gridRef.current;

    // グリッドが初期化されているかチェック
    if (!grid || grid.length === 0) {
      return;
    }

    // 境界チェック
    if (
      ant.x < 0 ||
      ant.x >= gridSize ||
      ant.y < 0 ||
      ant.y >= gridSize ||
      ant.y >= grid.length ||
      ant.x >= grid[ant.y].length
    ) {
      setIsRunning(false);
      return;
    }

    // 現在のセルの色を確認
    const currentCell = grid[ant.y][ant.x];

    if (currentCell) {
      // 黒いセルの場合：左に90度回転
      ant.direction = ((ant.direction + 3) % 4) as 0 | 1 | 2 | 3;
    } else {
      // 白いセルの場合：右に90度回転
      ant.direction = ((ant.direction + 1) % 4) as 0 | 1 | 2 | 3;
    }

    // セルの色を反転
    grid[ant.y][ant.x] = !currentCell;

    // 前進
    switch (ant.direction) {
      case 0: // up
        ant.y--;
        break;
      case 1: // right
        ant.x++;
        break;
      case 2: // down
        ant.y++;
        break;
      case 3: // left
        ant.x--;
        break;
    }

    setStepCount((prev) => prev + 1);
  }, [gridSize]);

  // アニメーションループ
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isRunning) {
      intervalId = setInterval(() => {
        step();
        draw();
      }, 101 - speed);
    } else {
      draw();
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRunning, speed, step, draw]);

  // 初期化
  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  // 描画
  useEffect(() => {
    const timeoutId = setTimeout(draw, 100);
    return () => clearTimeout(timeoutId);
  }, [draw]);

  const handleReset = () => {
    setIsRunning(false);
    initializeGrid();
    setTimeout(draw, 100);
  };

  const handleStep = () => {
    if (!isRunning) {
      step();
      setTimeout(draw, 50);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-100">
          ラングトンのあり (Langton&apos;s Ant)
        </h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400 text-center max-w-2xl">
          ラングトンのありは、単純なルールに従って動く2次元セルオートマトンです。
          白いセルでは右に90度回転し、黒いセルでは左に90度回転し、セルの色を反転させて前進します。
        </p>

        <div className="relative border rounded-lg overflow-hidden bg-white shadow-inner mb-6">
          <canvas ref={canvasRef} width={800} height={600} className="block" />
        </div>

        <div className="flex flex-wrap gap-4 mb-6 items-center justify-center">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            {isRunning ? "停止" : "開始"}
          </button>

          <button
            onClick={handleStep}
            disabled={isRunning}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
          >
            1ステップ実行
          </button>

          <button
            onClick={handleReset}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            リセット
          </button>
        </div>

        {/* パターン選択セクション */}
        <div className="mb-6 w-full max-w-4xl">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
            初期パターン選択
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {INITIAL_PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                onClick={() => {
                  setSelectedPattern(pattern.id);
                  setIsRunning(false);
                }}
                disabled={isRunning}
                className={`p-3 rounded-lg border transition-all text-left ${
                  selectedPattern === pattern.id
                    ? "bg-blue-100 dark:bg-blue-900 border-blue-500 dark:border-blue-400"
                    : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                  {pattern.name}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {pattern.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl mb-6">
          <div className="flex flex-col items-center gap-2">
            <label className="text-gray-700 dark:text-gray-300 font-medium">速度: {speed}%</label>
            <input
              type="range"
              min="1"
              max="100"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              className="w-full"
              disabled={isRunning}
            />
          </div>

          <div className="flex flex-col items-center gap-2">
            <label className="text-gray-700 dark:text-gray-300 font-medium">
              グリッドサイズ: {gridSize}×{gridSize}
            </label>
            <input
              type="range"
              min="50"
              max="200"
              value={gridSize}
              onChange={(e) => setGridSize(parseInt(e.target.value))}
              className="w-full"
              disabled={isRunning}
            />
          </div>

          <div className="flex flex-col items-center gap-2">
            <label className="text-gray-700 dark:text-gray-300 font-medium">ステップ数</label>
            <div className="text-2xl font-mono text-blue-600 dark:text-blue-400">
              {stepCount.toLocaleString()}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
              パターン: {INITIAL_PATTERNS.find((p) => p.id === selectedPattern)?.name || "不明"}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 max-w-2xl">
          <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">ルール</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• 白いセル上では右に90度回転</li>
            <li>• 黒いセル上では左に90度回転</li>
            <li>• 現在のセルの色を反転（白→黒、黒→白）</li>
            <li>• 1マス前進</li>
            <li>• 赤い四角がありの位置、矢印が向いている方向</li>
          </ul>
        </div>

        <Link href="/" className="text-blue-500 hover:underline">
          &larr; ホームに戻る
        </Link>
      </div>
    </main>
  );
}
