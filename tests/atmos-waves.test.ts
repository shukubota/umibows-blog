import { describe, expect, it } from "vitest";
import {
  bruntVaisala,
  computeMountainWaves,
  coriolisParameter,
  inertialPosition,
  inertiaGravityFrequency,
  inertiaGravityGroupVelocity,
  trappedLeeWavelength,
} from "@/lib/atmos-waves";

describe("慣性振動", () => {
  it("北緯35度の慣性周期は約20.9時間", () => {
    const f = coriolisParameter(35);
    expect((2 * Math.PI) / f / 3600).toBeCloseTo(20.86, 1);
  });

  it("1周期で元の位置に戻り、半径 U/f の円を時計回りに描く", () => {
    const f = coriolisParameter(45);
    const T = (2 * Math.PI) / f;
    const end = inertialPosition(10, 0, f, T);
    expect(Math.hypot(end.x, end.y)).toBeLessThan(1e-6);
    const half = inertialPosition(10, 0, f, T / 2);
    // 東向きに放つと右（南）に曲がり、半周で真南 2U/f の位置
    expect(half.x).toBeCloseTo(0, 3);
    expect(half.y).toBeCloseTo(-20 / f, 3);
  });
});

describe("慣性重力波", () => {
  it("N は典型的な対流圏の値（約 0.01/s）になる", () => {
    expect(bruntVaisala(290, 3)).toBeCloseTo(0.01, 3);
  });

  it("水平な波数では ω = N、鉛直な波数では ω = f", () => {
    expect(inertiaGravityFrequency(0.01, 1e-4, 0)).toBeCloseTo(0.01, 10);
    expect(inertiaGravityFrequency(0.01, 1e-4, Math.PI / 2)).toBeCloseTo(1e-4, 10);
  });

  it("群速度は波数ベクトル（位相の進む向き）と直交する", () => {
    const k = 2e-4;
    const m = 5e-4;
    const { cgx, cgz } = inertiaGravityGroupVelocity(0.01, 1e-4, k, m);
    expect(cgx * k + cgz * m).toBeCloseTo(0, 12);
    // m > 0（位相が上へ進む）なら、エネルギーは下へ向かう
    expect(cgz).toBeLessThan(0);
  });
});

describe("山岳波", () => {
  const xs = Float64Array.from([-40e3, -10e3, 0, 10e3, 40e3]);

  it("地面では流線が山の形に沿う", () => {
    const p = { U: 10, N1: 0.01, N2: 0.01, H: 3000, h0: 500, a: 5000 };
    const { eta } = computeMountainWaves(p, xs, Float64Array.from([0]), { damping: 0.001 });
    xs.forEach((x, i) => {
      const h = (p.h0 * p.a * p.a) / (x * x + p.a * p.a);
      expect(Math.abs(eta[i] - h)).toBeLessThan(0.02 * p.h0);
    });
  });

  it("一様成層・幅の広い山では静力学の解析解に近い", () => {
    const p = { U: 10, N1: 0.01, N2: 0.01, H: 3000, h0: 300, a: 30e3 };
    const l = p.N1 / p.U;
    const zs = Float64Array.from([1000, 2500, 4000]);
    const { eta } = computeMountainWaves(p, xs, zs, { nk: 2000, damping: 0.001 });
    zs.forEach((z, iz) => {
      xs.forEach((x, ix) => {
        const exact =
          (p.h0 * p.a * (p.a * Math.cos(l * z) - x * Math.sin(l * z))) / (x * x + p.a * p.a);
        expect(Math.abs(eta[iz * xs.length + ix] - exact)).toBeLessThan(0.08 * p.h0);
      });
    });
  });

  it("下層だけ安定なら捕捉風下波ができ、風下に波が続く", () => {
    const p = { U: 15, N1: 0.014, N2: 0.004, H: 3000, h0: 400, a: 2500 };
    const lambda = trappedLeeWavelength(p);
    expect(lambda).not.toBeNull();
    expect(lambda!).toBeGreaterThan(5e3);
    expect(lambda!).toBeLessThan(30e3);

    const n = 400;
    const xs2 = Float64Array.from({ length: n }, (_, i) => 20e3 + (i * 60e3) / n);
    const { eta } = computeMountainWaves(p, xs2, Float64Array.from([2000]));
    let crossings = 0;
    for (let i = 1; i < n; i++) if (Math.sign(eta[i]) !== Math.sign(eta[i - 1])) crossings++;
    // 60 km の区間に波長 λ の波が並んでいれば、符号の変化は 2 × 60km/λ 回前後
    const expected = (2 * 60e3) / lambda!;
    expect(crossings).toBeGreaterThan(expected * 0.7);
    expect(crossings).toBeLessThan(expected * 1.3);
  });

  it("上層も同じくらい安定なら捕捉されない", () => {
    expect(trappedLeeWavelength({ U: 15, N1: 0.01, N2: 0.01, H: 3000, h0: 400, a: 2500 })).toBe(
      null
    );
  });
});
