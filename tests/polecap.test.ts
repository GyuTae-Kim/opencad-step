/**
 * 극점 둘레 삼각화 시험(합성 자료): 한 변이 한 점으로 모인 B-스플라인 곡면(극점)에서, 극점으로 들어가는 두 경계 곡선이
 * 극점에서 같은 접선으로 만나면(뾰족점 — 폭이 극점까지 거리의 제곱으로 줄어든다) 아주 세밀한 품질로 나눌 때 극점에서 나간
 * 모서리들을 거듭 나눈 점이 3D로 거의 겹쳐 바늘 같은 삼각형이 접히던 것 → 극점 둘레를 빛살·깊이 줄로 따로 나눈다.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { meshVolume, stepToScene, watertightness } from '../src/index';
import { itemQuality } from '../scripts/sweep/metrics';
import { type P3, StepText } from './stepText';

const FINEST = { tolerance: 0.0001, angleTolerance: 5 } as const;
const APEX: P3 = [5, 12, 0];

/**
 * 두 B-스플라인 면(쌍삼차 베지어)으로 닫힌 렌즈 입체. 두 면은 같은 세 모서리(아래 곡선, 양 옆 곡선)를 쓰고
 * 매개변수 v = 1 변 전체가 꼭짓점 APEX 한 점이다. v = 2/3 조절점 줄도 모두 한 점이라 양 옆 곡선은 APEX에서 같은 접선으로 만난다.
 * 가운데 조절점 줄만 z = ±h로 부풀린다(위 면 +h, 아래 면 −h). cusp = false면 v = 2/3 줄도 펼쳐 보통 꼭짓점(폭이 거리에 비례)으로.
 */
function lens(h = 3, cusp = true): Uint8Array {
  const w = new StepText();
  const row0: P3[] = [
    [0, 0, 0],
    [3.3, -1, 0],
    [6.7, -1, 0],
    [10, 0, 0],
  ];
  const row1 = (z: number): P3[] => [
    [1, 4, 0],
    [3.5, 4, z],
    [6.5, 4, z],
    [9, 4, 0],
  ];
  const row2: P3[] = cusp
    ? [
        [5, 9, 0],
        [5, 9, 0],
        [5, 9, 0],
        [5, 9, 0],
      ]
    : [
        [3, 9, 0],
        [4.3, 9, 0],
        [5.7, 9, 0],
        [7, 9, 0],
      ];
  const row3: P3[] = [APEX, APEX, APEX, APEX];
  const curve = (pts: P3[]) =>
    w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${pts.map((p) => `#${w.pt(p)}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  /** 조절점 net[i][j]: i는 u(x 쪽), j는 v(y 쪽) — ∂u×∂v는 +z 쪽 */
  const surface = (z: number) => {
    const rows = [row0, row1(z), row2, row3];
    const net = [0, 1, 2, 3].map((i) => `(${rows.map((row) => `#${w.pt(row[i]!)}`).join(',')})`).join(',');
    return w.add('B_SPLINE_SURFACE_WITH_KNOTS', `'',3,3,(${net}),.UNSPECIFIED.,.F.,.F.,.F.,(4,4),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.`);
  };
  const B0 = w.vertex(row0[0]!);
  const B1 = w.vertex(row0[3]!);
  const T = w.vertex(APEX);
  const r1 = row1(0);
  const bottom = w.edge(B0, B1, curve(row0));
  const right = w.edge(B1, T, curve([row0[3]!, r1[3]!, row2[3]!, APEX]));
  const left = w.edge(T, B0, curve([APEX, row2[0]!, r1[0]!, row0[0]!]));
  // 위 면: 법선 +z(같은 방향), 아래 면: 법선 −z(같은 매개변수 곡면을 거꾸로) — 모서리를 반대 방향으로 쓴다
  const top = w.face([w.bound(w.loop([w.oe(bottom, true), w.oe(right, true), w.oe(left, true)]))], surface(h), true);
  const under = w.face([w.bound(w.loop([w.oe(left, false), w.oe(right, false), w.oe(bottom, false)]))], surface(-h), false);
  const ctx = w.context();
  w.product('lens', [w.solid([top, under])], ctx);
  return w.bytes();
}

/** 두 끝이 모두 APEX는 아닌 삼각형 모서리 가운데 가장 짧은 3D 길이 */
function minEdgeOffApex(m: Mesh3d): number {
  const P = m.positions;
  const I = m.indices!;
  const apex = (i: number) => Math.hypot(P[i * 3]! - APEX[0], P[i * 3 + 1]! - APEX[1], P[i * 3 + 2]! - APEX[2]) < 1e-9;
  let min = Infinity;
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = I[t + e]!;
      const b = I[t + ((e + 1) % 3)]!;
      if (apex(a) && apex(b)) continue;
      min = Math.min(min, Math.hypot(P[a * 3]! - P[b * 3]!, P[a * 3 + 1]! - P[b * 3 + 1]!, P[a * 3 + 2]! - P[b * 3 + 2]!));
    }
  return min;
}

function diag(m: Mesh3d): number {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3]!, m.positions[i]!);
    hi[i % 3] = Math.max(hi[i % 3]!, m.positions[i]!);
  }
  return Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
}

describe('극점 둘레 삼각화(한 변이 한 점으로 모인 B-스플라인 곡면)', () => {
  it('뾰족한 극점도 아주 세밀한 품질에서 틈·접힘 없이, 극점 밖 모서리가 바늘처럼 짧지 않다', () => {
    const sc = stepToScene(lens(), FINEST);
    expect(sc.warnings).toEqual([]);
    expect(sc.meshes).toHaveLength(1);
    const m = sc.meshes[0]!;
    expect(m.closed).toBe(true);
    const wt = watertightness(m.positions, m.indices);
    expect(wt.open + wt.bad).toBe(0);
    const q = itemQuality(m);
    expect(q.windingEdges).toBe(0);
    expect(q.folded).toBe(0);
    expect(q.volume).toBeGreaterThan(0);
    // 해석기 용접 거리(eps = 현 높이 × 1e-3, 현 높이 = 상자 대각선 × 1e-4)의 10배보다 짧은 극점 밖 모서리가 없다
    const eps = diag(m) * 1e-7;
    expect(minEdgeOffApex(m)).toBeGreaterThan(10 * eps);
  });

  it('보통 품질과 아주 세밀한 품질의 부피가 거의 같다(극점 둘레를 따로 나눠도 모양이 그대로)', () => {
    const fine = stepToScene(lens(), FINEST).meshes[0]!;
    const normal = stepToScene(lens()).meshes[0]!;
    const vf = meshVolume(fine.positions, fine.indices);
    const vn = meshVolume(normal.positions, normal.indices);
    expect(vf).toBeGreaterThan(10);
    expect(Math.abs(vf - vn) / vf).toBeLessThan(0.01);
    // 위·아래가 거울 대칭이라 z 범위도 대칭
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 2; i < fine.positions.length; i += 3) {
      zmin = Math.min(zmin, fine.positions[i]!);
      zmax = Math.max(zmax, fine.positions[i]!);
    }
    expect(zmax).toBeGreaterThan(0.5);
    expect(zmax + zmin).toBeCloseTo(0, 6);
  });

  it('뾰족하지 않은 극점(폭이 거리에 비례)도 법선이 극점 둘레로 크게 돌면 따로 나눠 틈·접힘이 없다', () => {
    const sc = stepToScene(lens(3, false), FINEST);
    const m = sc.meshes[0]!;
    expect(m.closed).toBe(true);
    const wt = watertightness(m.positions, m.indices);
    expect(wt.open + wt.bad).toBe(0);
    expect(itemQuality(m).folded).toBe(0);
    expect(minEdgeOffApex(m)).toBeGreaterThan(10 * diag(m) * 1e-7);
  });

  it('보통 품질에서도 같다(뾰족한 극점은 보통 품질에서도 점이 겹쳐 틈·접힘이 생기던 것)', () => {
    for (const cusp of [true, false]) {
      const m = stepToScene(lens(3, cusp)).meshes[0]!;
      expect(m.closed).toBe(true);
      const wt = watertightness(m.positions, m.indices);
      expect(wt.open + wt.bad).toBe(0);
      expect(itemQuality(m).folded).toBe(0);
      expect(minEdgeOffApex(m)).toBeGreaterThan(10 * diag(m) * 1e-7);
    }
  });
});
