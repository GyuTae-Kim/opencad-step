/**
 * 표본 질 조사(67차)에서 찾은 곡면 면 삼각화 빈틈의 시험(합성 자료).
 * - 극점에 닿은 선 삼각형: 한 변이 한 점으로 모인 B-스플라인 조각·원뿔 꼭짓점에서 다듬기가 극점으로 가는 등매개선 모서리를 거듭 나눠
 *   (점, 가운데 점, 극점)이 같은 등매개선 위에 놓인 삼각형이 곡면에 서거나 한 직선이 되어 접히던 것, 모인 변의 조절점이 반올림만큼 어긋나
 *   극점 정점 법선이 잡음이던 것 → 극점 법선은 안쪽으로 옮겨 구하고, 선 삼각형이 있으면 극점 둘레를 따로 나누거나(캡) 가장 긴 모서리를 뒤집는다
 */
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { meshVolume, stepToScene, watertightness } from '../src/index';
import { NurbsSurface } from '../src/nurbs';
import { BSplineSurface } from '../src/surfaces';
import { itemQuality } from '../scripts/sweep/metrics';
import { StepText, type P3 } from './stepText';

/** 꼭짓점 apex(3D 거리 tol 안)에 닿은 삼각형 가운데 선 것: 넓이가 가장 긴 모서리 제곱의 1e-9배 아래이거나, 법선이 꼭짓점 밖 정점 법선 합과 60° 넘게 어긋남 */
function apexFins(m: Mesh3d, apex: P3, tol: number): number {
  const P = m.positions;
  const N = m.normals!;
  const I = m.indices!;
  const at = (i: number): P3 => [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!];
  const isApex = (i: number) => Math.hypot(P[i * 3]! - apex[0], P[i * 3 + 1]! - apex[1], P[i * 3 + 2]! - apex[2]) < tol;
  let n = 0;
  for (let t = 0; t < I.length; t += 3) {
    const ids = [I[t]!, I[t + 1]!, I[t + 2]!];
    if (ids.filter(isApex).length !== 1) continue;
    const [a, b, c] = ids.map(at) as [P3, P3, P3];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const l = Math.hypot(nrm[0]!, nrm[1]!, nrm[2]!);
    const L = Math.max(Math.hypot(u[0]!, u[1]!, u[2]!), Math.hypot(v[0]!, v[1]!, v[2]!));
    const ref = [0, 0, 0];
    for (const i of ids) if (!isApex(i)) for (let k = 0; k < 3; k++) ref[k] = ref[k]! + N[i * 3 + k]!;
    const d = nrm[0]! * ref[0]! + nrm[1]! * ref[1]! + nrm[2]! * ref[2]!;
    if (!(l > 1e-9 * L * L) || d < 0.5 * l * Math.hypot(ref[0]!, ref[1]!, ref[2]!)) n++;
  }
  return n;
}

/**
 * 한 변(v = 1)이 꼭짓점 하나로 모인 쌍삼차 B-스플라인 조각(구 팔분의 일 꼴, 반지름 R) — 아래 변·양 옆 변 세 모서리로 된 면 하나(열린 껍질).
 * jitter는 모인 줄의 가운데 두 조절점을 꼭짓점에서 그만큼 비킨다(내보낸 파일의 반올림 — 해석기 eps보다 훨씬 작다)
 */
function dome(R: number, jitter: number): { bytes: Uint8Array; apex: P3 } {
  const w = new StepText();
  const k = 0.5523;
  const apex: P3 = [0, 0, R];
  const ring = (rr: number, z: number): P3[] => [
    [rr, 0, z],
    [rr, rr * k, z],
    [rr * k, rr, z],
    [0, rr, z],
  ];
  const rows: P3[][] = [ring(R, 0), ring(R, R * k), ring(R * k, R), [apex, [jitter, -jitter, R], [-jitter, jitter, R + jitter], apex]];
  const curve = (pts: P3[]) => w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${pts.map((p) => `#${w.pt(p)}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const net = [0, 1, 2, 3].map((i) => `(${rows.map((row) => `#${w.pt(row[i]!)}`).join(',')})`).join(',');
  const surf = w.add('B_SPLINE_SURFACE_WITH_KNOTS', `'',3,3,(${net}),.UNSPECIFIED.,.F.,.F.,.F.,(4,4),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.`);
  const r0 = rows[0]!;
  const B0 = w.vertex(r0[0]!);
  const B1 = w.vertex(r0[3]!);
  const T = w.vertex(apex);
  const bottom = w.edge(B0, B1, curve(r0));
  const right = w.edge(B1, T, curve(rows.map((r) => r[3]!)));
  const left = w.edge(T, B0, curve(rows.map((r) => r[0]!).reverse()));
  const face = w.face([w.bound(w.loop([w.oe(bottom, true), w.oe(right, true), w.oe(left, true)]))], surf);
  const shell = w.add('OPEN_SHELL', `'',(#${face})`);
  w.product('dome', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], w.context(), 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
  return { bytes: w.bytes(), apex };
}

/** 밑 원(반지름 r, z = 0)과 꼭짓점(0, 0, h)을 이음선 하나로 잇는 원뿔 옆면 + 밑면 — 닫힌 입체 */
function cone(r: number, h: number): Uint8Array {
  const w = new StepText();
  const apex: P3 = [0, 0, h];
  const B = w.vertex([r, 0, 0]);
  const A = w.vertex(apex);
  const base = w.edge(B, B, w.circle([0, 0, 0], r));
  const seam = w.edge(B, A, w.line([r, 0, 0], apex));
  const surf = w.add('CONICAL_SURFACE', `'',#${w.ax2([0, 0, 0], [0, 0, -1], [1, 0, 0])},${r},${Math.atan2(r, h)}`);
  const side = w.face([w.bound(w.loop([w.oe(base, true), w.oe(seam, true), w.oe(seam, false)]))], surf);
  const bottom = w.face([w.bound(w.loop([w.oe(base, false)]))], w.plane([0, 0, 0]), false);
  w.product('cone', [w.solid([side, bottom])], w.context());
  return w.bytes();
}

describe('극점에 닿은 선 삼각형(67차)', () => {
  it('모인 변의 조절점이 반올림만큼 어긋나도 극점 법선은 안쪽 곡면 법선과 같은 쪽이다', () => {
    const R = 10;
    const k = 0.5523;
    const ring = (rr: number, z: number): [number, number, number][] => [
      [rr, 0, z],
      [rr, rr * k, z],
      [rr * k, rr, z],
      [0, rr, z],
    ];
    // ctrl[i][j]: i는 u, j는 v — v = 1 줄이 꼭짓점(가운데 둘은 1e-12 비킴)
    const rows: [number, number, number][][] = [
      ring(R, 0),
      ring(R, R * k),
      ring(R * k, R),
      [
        [0, 0, R],
        [1e-12, -1e-12, R],
        [-1e-12, 1e-12, R],
        [0, 0, R],
      ],
    ];
    const ctrl = [0, 1, 2, 3].map((i) => rows.map((row) => row[i]!));
    const knots = new Float64Array([0, 0, 0, 0, 1, 1, 1, 1]);
    const s = new BSplineSurface(new NurbsSurface(3, 3, knots, knots, ctrl, null), 1e-6);
    expect(s.poles).toEqual([{ fixed: 1, value: 1 }]);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const n = s.normal(u, 1);
      const inner = s.normal(u, 1 - 1e-3);
      expect(n[0] * inner[0] + n[1] * inner[1] + n[2] * inner[2]).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
    }
  });

  // 예전에 극점 둘레에 선·접힌 삼각형이 생기던 조합(현 높이는 R에 비례): R, 비킴, 현 높이, 각
  const domeCases: [number, number, number, number][] = [
    [1, 0, 0.001, 10],
    [1, 0, 0.002, 5],
    [10, 1e-9, 0.6, 10],
  ];
  for (const [R, jitter, chordTolerance, angleTolerance] of domeCases)
    it(`B-스플라인 조각(R ${R}, 비킴 ${jitter}, 현 ${chordTolerance}, 각 ${angleTolerance}°): 극점 둘레에 선 삼각형·접힌 삼각형이 없다`, () => {
      const d = dome(R, jitter);
      const sc = stepToScene(d.bytes, { chordTolerance, angleTolerance });
      expect(sc.warnings).toEqual([]);
      const m = sc.meshes[0]!;
      expect(apexFins(m, d.apex, R * 1e-6)).toBe(0);
      expect(itemQuality(m).folded).toBe(0);
    });

  // 반지름 1.75, 반꼭지각(°)·현 높이·각 — 예전에 꼭짓점과 같은 모선 위 두 점을 이은 한 직선 삼각형이 생기던 조합
  const coneCases: [number, number, number][] = [
    [20, 0.012, 20],
    [45, 0.003, 20],
    [60, 0.002, 20],
  ];
  for (const [deg, chordTolerance, angleTolerance] of coneCases)
    it(`원뿔 꼭짓점(반꼭지각 ${deg}°, 현 ${chordTolerance}): 선 삼각형·접힌 삼각형 없이 닫히고 부피가 맞다`, () => {
      const r = 1.75;
      const h = r / Math.tan((deg * Math.PI) / 180);
      const sc = stepToScene(cone(r, h), { chordTolerance, angleTolerance });
      const m = sc.meshes[0]!;
      expect(m.closed).toBe(true);
      const wt = watertightness(m.positions, m.indices);
      expect(wt.open + wt.bad).toBe(0);
      expect(apexFins(m, [0, 0, h], h * 1e-6)).toBe(0);
      expect(itemQuality(m).folded).toBe(0);
      expect(Math.abs(meshVolume(m.positions, m.indices) / ((Math.PI * r * r * h) / 3) - 1)).toBeLessThan(0.01);
    });
});
