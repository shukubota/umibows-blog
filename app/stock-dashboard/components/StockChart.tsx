"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { calculateSMA, calculateRSI } from "../lib/indicators";

type Props = {
  symbol: string;
  prices: number[];
  ma5: number;
  ma25: number;
  ma200: number;
  rsi: number;
};

export default function StockChart({ symbol, prices }: Props) {
  const display = prices.slice(-120);
  const ma5Arr = calculateSMA(prices, 5).slice(-120);
  const ma25Arr = calculateSMA(prices, 25).slice(-120);
  const ma200Arr = calculateSMA(prices, 200).slice(-120);

  const rsiValues: number[] = [];
  for (let i = 0; i < display.length; i++) {
    const slice = prices.slice(0, prices.length - display.length + i + 1);
    rsiValues.push(calculateRSI(slice));
  }

  const priceData = display.map((close, i) => ({
    i,
    close,
    ma5: isNaN(ma5Arr[i]) ? undefined : ma5Arr[i],
    ma25: isNaN(ma25Arr[i]) ? undefined : ma25Arr[i],
    ma200: isNaN(ma200Arr[i]) ? undefined : ma200Arr[i],
  }));

  const rsiData = rsiValues.map((v, i) => ({ i, rsi: isNaN(v) ? undefined : v }));

  const priceMin = Math.min(...display) * 0.98;
  const priceMax = Math.max(...display) * 1.02;

  return (
    <div className="bg-gray-800 rounded-lg p-3 space-y-2">
      <div className="text-gray-400 text-xs font-semibold">{symbol} — 直近120日</div>

      {/* Price chart */}
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={priceData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[priceMin, priceMax]}
            tick={{ fill: "#9ca3af", fontSize: 10 }}
            width={55}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
            labelStyle={{ color: "#9ca3af" }}
            itemStyle={{ color: "#e5e7eb" }}
            formatter={(v) => [`$${Number(v).toFixed(2)}`]}
            labelFormatter={() => ""}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#60a5fa"
            dot={false}
            strokeWidth={1.5}
            name="価格"
          />
          <Line
            type="monotone"
            dataKey="ma5"
            stroke="#fbbf24"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="MA5"
          />
          <Line
            type="monotone"
            dataKey="ma25"
            stroke="#a78bfa"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="MA25"
          />
          <Line
            type="monotone"
            dataKey="ma200"
            stroke="#f87171"
            dot={false}
            strokeWidth={1}
            name="MA200"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* RSI chart */}
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={rsiData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="i" hide />
          <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 10 }} width={35} />
          <Tooltip
            contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(v) => [Number(v).toFixed(1), "RSI"]}
            labelFormatter={() => ""}
          />
          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
          <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="rsi"
            stroke="#c084fc"
            dot={false}
            strokeWidth={1.5}
            name="RSI"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>
          <span className="text-blue-400">—</span> 価格
        </span>
        <span>
          <span className="text-yellow-400">- -</span> MA5
        </span>
        <span>
          <span className="text-purple-400">- -</span> MA25
        </span>
        <span>
          <span className="text-red-400">—</span> MA200
        </span>
        <span>
          <span className="text-purple-300">—</span> RSI
        </span>
      </div>
    </div>
  );
}
