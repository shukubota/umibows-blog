// 十種雲形のでき方シミュレーションの共通の型。
// 1つの雲につき1つの CloudSim を定義し、プレイヤー（components/clouds/CloudSimPlayer.tsx）が
// init → step を繰り返して draw で描く。状態 S は step の中で書き換えてよい（毎フレーム新しく作らない）。
import type { CloudId, MathBlock } from "@/lib/clouds/types";

export type Params = Record<string, number>;

/** スライダーで変えられるパラメータ。値を変えるとシミュレーションは最初からやり直す。 */
export interface SimParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 初期値 */
  value: number;
  unit: string;
  /** 表示する小数の桁数（省略時は step から決める） */
  digits?: number;
}

/** キャンバスの横に出す数値（例: 雲底 1.2 km） */
export interface Readout {
  label: string;
  value: string;
}

export interface CloudSim<S> {
  id: CloudId;
  /** 例: 「上昇する熱気泡と積雲の発生」 */
  title: string;
  /** 何をどう簡単にして解いているかの説明（段落、インライン数式可） */
  description: string[];
  /** 実際に数値積分している式 */
  equations: MathBlock[];
  params: SimParam[];
  /** 再生速度1のとき、実時間1秒あたりに進めるシミュレーション時間 [s] */
  timeScale: number;
  /** 1回の step に渡す時間刻みの上限 [s]。プレイヤーはこれ以下に分割して step を呼ぶ */
  maxDt: number;
  /** この時間 [s] に達したら止める。省略時は止めない */
  duration?: number;
  /** キャンバスの高さ / 幅（省略時 0.55） */
  aspect?: number;
  init(p: Params): S;
  /** dt [s] だけ進める（S を書き換える） */
  step(s: S, p: Params, dt: number): void;
  /** w, h は CSS ピクセル。背景から全部描く */
  draw(ctx: CanvasRenderingContext2D, s: S, p: Params, w: number, h: number): void;
  readouts(s: S, p: Params): Readout[];
  /** 経過時間 [s]（表示と duration の判定に使う） */
  time(s: S): number;
}

export type AnyCloudSim = CloudSim<unknown>;

/** 状態の型を推論させつつ、登録用の配列に入れられる形にする */
export function defineSim<S>(sim: CloudSim<S>): AnyCloudSim {
  return sim as AnyCloudSim;
}

export function defaultParams(sim: AnyCloudSim): Params {
  return Object.fromEntries(sim.params.map((p) => [p.key, p.value]));
}
