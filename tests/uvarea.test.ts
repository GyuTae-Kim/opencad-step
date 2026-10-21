import { describe, expect, it } from 'vitest';
import { cross, len, makeFrame } from '../src/math';
import { ConeSurface, CylinderSurface, SphereSurface, type Surface, TorusSurface } from '../src/surfaces';
import { uvArea } from '../src/tessellate';

/** 예전 방식(곡면 미분으로 3점 공식) — 바로 세는 식과 견준다 */
function byDerivs(s: Surface, u: readonly number[], v: readonly number[], tris: readonly number[]): number {
  const A = 2 / 3;
  const B = 1 / 6;
  let total = 0;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const [a, b, c] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    const jac = Math.abs((u[b]! - u[a]!) * (v[c]! - v[a]!) - (u[c]! - u[a]!) * (v[b]! - v[a]!)) / 2;
    let g = 0;
    for (const [wa, wb, wc] of [
      [A, B, B],
      [B, A, B],
      [B, B, A],
    ] as const) {
      const [, su, sv] = s.derivs(wa * u[a]! + wb * u[b]! + wc * u[c]!, wa * v[a]! + wb * v[b]! + wc * v[c]!);
      g += len(cross(su, sv));
    }
    total += (jac * g) / 3;
  }
  return total;
}

/** u0~u1 × v0~v1 격자(n × n칸, 칸마다 삼각형 둘) */
function grid(u0: number, u1: number, v0: number, v1: number, n: number) {
  const u: number[] = [];
  const v: number[] = [];
  const tris: number[] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      u.push(u0 + ((u1 - u0) * i) / n);
      v.push(v0 + ((v1 - v0) * j) / n);
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      tris.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  return { u, v, tris };
}

describe('곡면 넓이(매개변수 영역 적분)', () => {
  // 기울어진 틀(직교)
  const f = makeFrame([3, -2, 7], [1, 2, 2], [2, -1, 0]);

  it('원기둥·원뿔은 정확, 구·원환은 미분으로 센 3점 공식과 같다(반지름이 음수인 곡면 포함)', () => {
    const cases: [Surface, number, number, number, number, number][] = [
      [new CylinderSurface(f, 2.5), 0, 2 * Math.PI, -1, 4, 2 * Math.PI * 2.5 * 5],
      [new CylinderSurface(f, -2.5), 0.3, 1.9, 0, 2, 1.6 * 2.5 * 2],
      // 원뿔 r=3, 반각 ±atan(3/4), v 0~4: 반지름 3 → 6(또는 0), 모선 5 — 옆넓이 π(3 + 6)·5, π·3·5
      [new ConeSurface(f, 3, Math.atan(3 / 4)), 0, 2 * Math.PI, 0, 4, Math.PI * (3 + 6) * 5],
      [new ConeSurface(f, 3, -Math.atan(3 / 4)), 0, 2 * Math.PI, 0, 4, Math.PI * 3 * 5],
      [new SphereSurface(f, 3), 0, 2 * Math.PI, -Math.PI / 2, Math.PI / 2, 4 * Math.PI * 9],
      [new SphereSurface(f, -3), 0, Math.PI, 0, Math.PI / 2, Math.PI * 9],
      [new TorusSurface(f, 10, 2), 0, 2 * Math.PI, 0, 2 * Math.PI, 4 * Math.PI * Math.PI * 20],
      [new TorusSurface(f, 10, -2), 0, Math.PI, 0, Math.PI, NaN],
    ];
    for (const [s, u0, u1, v0, v1, exact] of cases) {
      const g = grid(u0, u1, v0, v1, 24);
      const fast = uvArea(s, g.u, g.v, g.tris);
      expect(fast / byDerivs(s, g.u, g.v, g.tris)).toBeCloseTo(1, 12);
      if (Number.isFinite(exact)) expect(fast).toBeCloseTo(exact, s.kind === 'sphere' || s.kind === 'torus' ? 3 : 9);
    }
  });
});
