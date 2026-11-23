// シミュレーションの描画で共通に使う小物。すべて CSS ピクセル座標。

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SkyKind = "day" | "dusk" | "night" | "overcast";

const SKY: Record<SkyKind, [string, string]> = {
  day: ["#0b3a6e", "#4b8fd0"],
  dusk: ["#1e1b4b", "#c2678a"],
  night: ["#020617", "#1e293b"],
  overcast: ["#334155", "#64748b"],
};

/** 上から下へのグラデーションの空 */
export function drawSky(ctx: CanvasRenderingContext2D, r: Rect, kind: SkyKind = "day") {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, SKY[kind][0]);
  g.addColorStop(1, SKY[kind][1]);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** ふわっとした雲粒の塊（中心が濃い白の円） */
export function drawPuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha = 0.8,
  color = "255,255,255"
) {
  if (radius <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** 左端に高度目盛り [km] を描く。toY は高度 [m] → y */
export function drawHeightAxis(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  zMaxM: number,
  toY: (zM: number) => number,
  stepKm?: number
) {
  const step = stepKm ?? niceStep(zMaxM / 1000 / 5);
  ctx.save();
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.textAlign = "left";
  for (let km = 0; km <= zMaxM / 1000 + 1e-9; km += step) {
    const y = toY(km * 1000);
    ctx.beginPath();
    ctx.moveTo(r.x, y);
    ctx.lineTo(r.x + r.w, y);
    ctx.stroke();
    ctx.fillText(`${+km.toFixed(2)} km`, r.x + 3, y - 2);
  }
  ctx.restore();
}

export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export interface Series {
  points: [number, number][];
  color: string;
  label?: string;
  dash?: number[];
}

/** 小さな折れ線グラフ（半透明の黒い枠の中に描く） */
export function drawPlot(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  series: Series[],
  opts: {
    xLabel?: string;
    yLabel?: string;
    xRange?: [number, number];
    yRange?: [number, number];
    title?: string;
  } = {}
) {
  const all = series.flatMap((s) => s.points);
  const [x0, x1] = opts.xRange ?? extent(all.map((p) => p[0]));
  const [y0, y1] = opts.yRange ?? extent(all.map((p) => p[1]));
  const pad = { l: 34, r: 6, t: opts.title ? 16 : 6, b: 16 };
  const ix = r.x + pad.l;
  const iy = r.y + pad.t;
  const iw = Math.max(1, r.w - pad.l - pad.r);
  const ih = Math.max(1, r.h - pad.t - pad.b);
  const sx = (x: number) => ix + ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y: number) => iy + ih - ((y - y0) / (y1 - y0 || 1)) * ih;
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.72)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(ix, iy, iw, ih);
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  if (opts.title) ctx.fillText(opts.title, r.x + 4, r.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(fmt(y1), ix - 3, iy + 8);
  ctx.fillText(fmt(y0), ix - 3, iy + ih);
  ctx.textAlign = "left";
  ctx.fillText(fmt(x0), ix, iy + ih + 12);
  ctx.textAlign = "right";
  ctx.fillText(`${fmt(x1)}${opts.xLabel ? " " + opts.xLabel : ""}`, ix + iw, iy + ih + 12);
  if (opts.yLabel) {
    ctx.textAlign = "left";
    ctx.fillText(opts.yLabel, ix + 3, iy + 10);
  }
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  for (const s of series) {
    if (s.points.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    s.points.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))
    );
    ctx.stroke();
  }
  ctx.restore();
}

function extent(v: number[]): [number, number] {
  const f = v.filter(Number.isFinite);
  if (f.length === 0) return [0, 1];
  const lo = Math.min(...f);
  const hi = Math.max(...f);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return v.toExponential(1);
  return String(+v.toFixed(a < 1 ? 2 : a < 10 ? 1 : 0));
}

/** 画面の左上に小さな文字を並べる */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = "rgba(255,255,255,0.85)",
  align: CanvasTextAlign = "left"
) {
  ctx.save();
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 経過時間の表示（秒 → 「3分20秒」「2時間5分」など） */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ""}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}時間${m ? `${m}分` : ""}`;
}
