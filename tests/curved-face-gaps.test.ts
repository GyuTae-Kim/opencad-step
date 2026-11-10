/**
 * 표본 질 조사(67차)에서 찾은 곡면 면 삼각화 빈틈의 시험(합성 자료).
 * - 아주 짧은 원호: 두 꼭짓점 개체가 다른데 거리가 해석기 eps 안인 원호를 한 바퀴 원으로 읽어, 그 원호를 쓰는 원기둥 면 고리가 한 바퀴 돌아
 *   "한 바퀴 도는 경계 하나로는 닫을 수 없는 면"으로 실패하고 이웃 평면 면과 틈이 나던 것 → 꼭짓점 개체가 같을 때(또는 사실상 같은 점일 때)만 한 바퀴.
 *   그렇게 그린 면의 고리가 같은 점을 두 번 지나면(꼭짓점 하나로 맞닿은 두 영역) earcut이 겹친 삼각형을 내던 것 → 그 점에서 고리를 나눈다
 * - 극점에 닿은 선 삼각형: 한 변이 한 점으로 모인 B-스플라인 조각·원뿔 꼭짓점에서 다듬기가 극점으로 가는 등매개선 모서리를 거듭 나눠
 *   (점, 가운데 점, 극점)이 같은 등매개선 위에 놓인 삼각형이 곡면에 서거나 한 직선이 되어 접히던 것, 모인 변의 조절점이 반올림만큼 어긋나
 *   극점 정점 법선이 잡음이던 것 → 극점 법선은 안쪽으로 옮겨 구하고, 선 삼각형이 있으면 극점 둘레를 따로 나누거나(캡) 가장 긴 모서리를 뒤집는다
 * - 방추형 원환(68차): 장반지름이 단반지름보다 작은 원환의 축 위 꼭짓점을 극점으로 다루지 않아, 꼭짓점을 지나는 면 고리가 그 점에서 u가 튀어
 *   "한 바퀴 도는 고리"로 읽혀 정의역 끝까지 닫히던 것(면이 곡면의 안쪽 겹친 부분까지 덮어 두 면이 겹치고 넓이·부피가 틀림) → 사과 쪽만 정의역으로, 꼭짓점은 극점
 */
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { meshVolume, stepToScene, watertightness, type StepMeta } from '../src/index';
import { NurbsSurface } from '../src/nurbs';
import { BSplineSurface, TorusSurface } from '../src/surfaces';
import { triangulateRobust } from '../src/tessellate';
import { itemQuality } from '../scripts/sweep/metrics';
import { r, StepText, type P3 } from './stepText';

/**
 * 반지름 3, 높이 10인 원기둥 입체. 아래 원을 꼭짓점 둘(각 0과 delta)로 나눠 아주 짧은 원호(0 → delta)와 나머지 원호(delta → 2π)로 둔다.
 * 옆면 고리는 [짧은 호, 긴 호, 이음선, 위 원(거꾸로), 이음선(거꾸로)], 아래 면 고리는 두 원호를 거꾸로 쓴다.
 */
function splitCylinder(delta: number): Uint8Array {
  const w = new StepText();
  const R = 3;
  const H = 10;
  const at = (a: number, z: number): P3 => [R * Math.cos(a), R * Math.sin(a), z];
  const V0 = w.vertex(at(0, 0));
  const Vd = w.vertex(at(delta, 0));
  const V1 = w.vertex(at(0, H));
  const c0 = w.circle([0, 0, 0], R);
  const tiny = w.edge(V0, Vd, c0);
  const rest = w.edge(Vd, V0, c0);
  const top = w.edge(V1, V1, w.circle([0, 0, H], R));
  const seam = w.edge(V0, V1, w.line(at(0, 0), at(0, H)));
  const surf = w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2([0, 0, 0])},3.`);
  const side = w.face([w.bound(w.loop([w.oe(tiny, true), w.oe(rest, true), w.oe(seam, true), w.oe(top, false), w.oe(seam, false)]))], surf);
  const bottom = w.face([w.bound(w.loop([w.oe(rest, false), w.oe(tiny, false)]))], w.plane([0, 0, 0]), false);
  const cap = w.face([w.bound(w.loop([w.oe(top, true)]))], w.plane([0, 0, H]));
  const ctx = w.context();
  w.product('split', [w.solid([side, bottom, cap])], ctx);
  return w.bytes();
}

describe('아주 짧은 원호(67차)', () => {
  // 상자 대각선 √(6²+6²+10²) ≈ 12.9 → 보통 품질 현 높이 0.0129, eps 1.29e-5. 원호 길이 3 × 2e-6 = 6e-6은 eps 안, eps의 1/1000 밖
  for (const delta of [2e-6, 1e-3]) {
    it(`꼭짓점 개체가 다른 원호는 짧아도(각 ${delta}) 한 바퀴로 읽지 않는다 — 면이 모두 그려지고 닫힌 입체에 틈이 없다`, () => {
      const sc = stepToScene(splitCylinder(delta));
      expect((sc.meta as unknown as StepMeta).stats.failedFaces).toBe(0);
      expect(sc.warnings).toEqual([]);
      expect(sc.meshes).toHaveLength(1);
      const m = sc.meshes[0]!;
      expect(m.closed).toBe(true);
      const wt = watertightness(m.positions, m.indices);
      expect(wt.open + wt.bad).toBe(0);
      // 부피 π·3²·10(현 높이 안의 나눔 차 1% 안)
      expect(Math.abs(meshVolume(m.positions, m.indices) / (Math.PI * 90) - 1)).toBeLessThan(0.01);
    });
  }

  it('같은 점을 두 번 지나는 고리(꼭짓점 하나로 맞닿은 가는 띠와 L자 영역)는 그 점에서 나눠 겹친 삼각형 없이 넓이가 맞다', () => {
    // 위 원기둥 면 꼴: 거의 겹친 두 이음선 사이 가는 띠(u 0 ~ 2.5e-5)가 T자 메우기로 넣은 점 X(2.5e-5, −4)에서 아래 L자 영역과 맞닿는다
    const X = [2.4547e-5, -4];
    const uv = [[1.2273e-5, -1.22], [0, -1.22], X, [0, -5], [0.13081, -5], [0.26162, -5], [0.26162, -1.22], [0.25111, -1.22], [0.24061, -1.22], [0.24061, -4], [0.12032, -4], X, [2.4547e-5, -1.22]];
    const xy = uv.flatMap(([u, v]) => [u! * 10, v!]);
    const signedAreas = (t: number[]) =>
      Array.from({ length: t.length / 3 }, (_, k) => {
        const [p, q, r] = [t[k * 3]!, t[k * 3 + 1]!, t[k * 3 + 2]!];
        return ((xy[q * 2]! - xy[p * 2]!) * (xy[r * 2 + 1]! - xy[p * 2 + 1]!) - (xy[r * 2]! - xy[p * 2]!) * (xy[q * 2 + 1]! - xy[p * 2 + 1]!)) / 2;
      });
    // 다리·맞닿음 떼기를 끄면(예전) earcut이 영역 밖 삼각형과 그 뒤집힌 짝을 낸다
    const old = signedAreas(triangulateRobust(xy, [], uv.length, false));
    expect(old.reduce((s, a) => s + Math.abs(a), 0)).toBeGreaterThan(1.5 * old.reduce((s, a) => s + a, 0));
    const now = signedAreas(triangulateRobust(xy, [], uv.length));
    expect(now).toHaveLength(uv.length - 2 - 2);
    expect(now.every((a) => a > 0)).toBe(true);
    expect(now.reduce((s, a) => s + a, 0)).toBeCloseTo(old.reduce((s, a) => s + a, 0), 9);
  });

  it('두 끝이 같은 꼭짓점 개체인 원은 그대로 한 바퀴다(위 원)', () => {
    const sc = stepToScene(splitCylinder(2e-6));
    const m = sc.meshes[0]!;
    // 위 뚜껑(z = 10) 삼각형 넓이 합이 원 넓이 9π에 가깝다
    const P = m.positions;
    const I = m.indices!;
    let a = 0;
    for (let t = 0; t < I.length; t += 3) {
      const [i, j, k] = [I[t]! * 3, I[t + 1]! * 3, I[t + 2]! * 3];
      if (Math.abs(P[i + 2]! - 10) + Math.abs(P[j + 2]! - 10) + Math.abs(P[k + 2]! - 10) > 1e-9) continue;
      a += Math.abs((P[j]! - P[i]!) * (P[k + 1]! - P[i + 1]!) - (P[k]! - P[i]!) * (P[j + 1]! - P[i + 1]!)) / 2;
    }
    expect(Math.abs(a / (9 * Math.PI) - 1)).toBeLessThan(0.02);
  });
});

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

/**
 * 장반지름 R이 단반지름 rr보다 작은 방추형 원환(축 Z, 중심 원점)의 위쪽 사과 반 — 적도 원(z = 0, 반지름 R + rr)에서 축 위 꼭짓점(0, 0, √(rr² − R²))까지.
 * 옆면은 u 0 ~ π·π ~ 2π 두 원환 면(자오선 원호 둘이 꼭짓점에서 만난다 — 표본 파일 꼴), 밑면은 적도 원의 평면 — 닫힌 입체
 */
function spindleCap(R: number, rr: number): { bytes: Uint8Array; apex: P3 } {
  const w = new StepText();
  const apex: P3 = [0, 0, Math.sqrt(rr * rr - R * R)];
  const E = w.vertex([R + rr, 0, 0]);
  const W = w.vertex([-(R + rr), 0, 0]);
  const A = w.vertex(apex);
  const eq = w.circle([0, 0, 0], R + rr);
  const front = w.edge(E, W, eq);
  const back = w.edge(W, E, eq);
  const m0 = w.edge(E, A, w.circle([R, 0, 0], rr, [0, -1, 0], [1, 0, 0]));
  const m1 = w.edge(W, A, w.circle([-R, 0, 0], rr, [0, 1, 0], [-1, 0, 0]));
  const surf = w.add('TOROIDAL_SURFACE', `'',#${w.ax2([0, 0, 0])},${r(R)},${r(rr)}`);
  const f0 = w.face([w.bound(w.loop([w.oe(front, true), w.oe(m1, true), w.oe(m0, false)]))], surf);
  const f1 = w.face([w.bound(w.loop([w.oe(back, true), w.oe(m0, true), w.oe(m1, false)]))], surf);
  const bottom = w.face([w.bound(w.loop([w.oe(back, false), w.oe(front, false)]))], w.plane([0, 0, 0]), false);
  w.product('spindle', [w.solid([f0, f1, bottom])], w.context());
  return { bytes: w.bytes(), apex };
}

/**
 * 방추형 원환(축 Z)의 반 바퀴 띠 면 하나(열린 껍질): v0 위도 원에서 v = π/2 위 원(반지름 R — 꼭짓점 위 오목한 데의 둘레)까지, u 0 ~ π.
 * 꼭짓점은 지나지 않지만 위 원 현이 꼭짓점에서 R 남짓이라 R보다 큰 현 높이에서는 꼭짓점이 현 높이 안이다
 */
function spindleBand(R: number, rr: number, v0: number): Uint8Array {
  const w = new StepText();
  const z0 = rr * Math.sin(v0);
  const rho0 = R + rr * Math.cos(v0);
  const B0 = w.vertex([rho0, 0, z0]);
  const B1 = w.vertex([-rho0, 0, z0]);
  const T0 = w.vertex([R, 0, rr]);
  const T1 = w.vertex([-R, 0, rr]);
  const bottom = w.edge(B0, B1, w.circle([0, 0, z0], rho0));
  const top = w.edge(T0, T1, w.circle([0, 0, rr], R));
  const m0 = w.edge(B0, T0, w.circle([R, 0, 0], rr, [0, -1, 0], [1, 0, 0]));
  const m1 = w.edge(B1, T1, w.circle([-R, 0, 0], rr, [0, 1, 0], [-1, 0, 0]));
  const surf = w.add('TOROIDAL_SURFACE', `'',#${w.ax2([0, 0, 0])},${r(R)},${r(rr)}`);
  const face = w.face([w.bound(w.loop([w.oe(bottom, true), w.oe(m1, true), w.oe(top, false), w.oe(m0, false)]))], surf);
  const shell = w.add('OPEN_SHELL', `'',(#${face})`);
  w.product('band', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], w.context(), 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
  return w.bytes();
}

describe('방추형 원환(68차)', () => {
  // 현 높이 0.5 > R 0.3: 위 원의 현이 꼭짓점에서 현 높이 안이어도 꼭짓점을 지나는 것으로 읽지 않는다(축 둘레 각이 반 바퀴 뒤집히는 토막만 꼭짓점을 지난다)
  for (const chordTolerance of [0.5, undefined])
    it(`꼭짓점 둘레 위 원을 경계로 쓰는 띠 면(현 높이 ${chordTolerance ?? '기본'}): 꼭짓점까지 덮지 않고 넓이가 맞다`, () => {
      const [R, rr, v0] = [0.3, 4, 0.85];
      const sc = stepToScene(spindleBand(R, rr, v0), chordTolerance ? { chordTolerance } : {});
      expect(sc.warnings).toEqual([]);
      const m = sc.meshes[0]!;
      expect(itemQuality(m).folded).toBe(0);
      const t = (sc.meta as unknown as StepMeta).faceTables![0]!;
      const want = Math.PI * rr * (R * (Math.PI / 2 - v0) + rr * (1 - Math.sin(v0)));
      expect(Math.abs(t.area![0]! / want - 1)).toBeLessThan(1e-3);
      let a = 0;
      const P = m.positions;
      const I = m.indices!;
      for (let k = 0; k < I.length; k += 3) {
        const [i, j, l] = [I[k]! * 3, I[k + 1]! * 3, I[k + 2]! * 3];
        const ux = P[j]! - P[i]!, uy = P[j + 1]! - P[i + 1]!, uz = P[j + 2]! - P[i + 2]!;
        const wx = P[l]! - P[i]!, wy = P[l + 1]! - P[i + 1]!, wz = P[l + 2]! - P[i + 2]!;
        a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
      }
      expect(Math.abs(a / want - 1)).toBeLessThan(0.05);
    });

  it('곡면: 사과 쪽(R + r·cos v > 0)만 정의역이고 v 끝 둘이 축 위 꼭짓점(극점), 꼭짓점 법선은 사과 쪽 그대로 — 보통 원환은 예전대로', () => {
    const f = { o: [0, 0, 0] as [number, number, number], x: [1, 0, 0] as [number, number, number], y: [0, 1, 0] as [number, number, number], z: [0, 0, 1] as [number, number, number] };
    const s = new TorusSurface(f, 1, 3);
    const vp = Math.acos(-1 / 3);
    expect([s.v0, s.v1, s.periodV]).toEqual([-vp, vp, 0]);
    expect(s.poles).toEqual([
      { fixed: 1, value: -vp },
      { fixed: 1, value: vp },
    ]);
    for (const k of [0, 1]) {
      const q = s.polePoint(k);
      expect(Math.hypot(q[0], q[1])).toBeLessThan(1e-12);
      expect(q[2]).toBeCloseTo((k ? 1 : -1) * Math.sqrt(8), 12);
    }
    // 되짚기는 사과 쪽 점을 정의역 안으로(적도 아래 점은 음수 v)
    for (const [u, v] of [
      [0.3, -1.2],
      [2, 0.5],
      [5, vp - 1e-3],
    ] as const) {
      const [pu, pv] = s.project(s.point(u, v));
      expect(pu).toBeCloseTo(u, 9);
      expect(pv).toBeCloseTo(v, 9);
    }
    // 꼭짓점 법선: R + r·cos v가 반올림으로 음수여도 뒤집지 않는다(곧 안쪽 v의 법선과 같은 쪽)
    for (const u of [0, 1, 2.5, 4, 6]) {
      const n = s.normal(u, vp);
      const inner = s.normal(u, vp - 1e-4);
      expect(n[0] * inner[0] + n[1] * inner[1] + n[2] * inner[2]).toBeGreaterThan(0.999);
    }
    const plain = new TorusSurface(f, 5, 1.5);
    expect([plain.v0, plain.v1, plain.periodV, plain.poles.length]).toEqual([0, 2 * Math.PI, 2 * Math.PI, 0]);
  });

  // 표본 파일 꼴(R 0.2536 < r 4.5)과 덜 뾰족한 꼴
  for (const [R, rr] of [
    [0.253575080342705, 4.5],
    [1, 3],
  ] as const)
    it(`꼭짓점을 지나는 두 면(R ${R}, r ${rr}): 겹치지 않고 닫혀 넓이·부피가 맞고 접힌 삼각형이 없다`, () => {
      const d = spindleCap(R, rr);
      const sc = stepToScene(d.bytes);
      const meta = sc.meta as unknown as StepMeta;
      expect(meta.stats.failedFaces).toBe(0);
      expect(sc.warnings).toEqual([]);
      expect(sc.meshes).toHaveLength(1);
      const m = sc.meshes[0]!;
      expect(m.closed).toBe(true);
      const wt = watertightness(m.positions, m.indices);
      expect(wt.open + wt.bad).toBe(0);
      expect(itemQuality(m).folded).toBe(0);
      expect(apexFins(m, d.apex, rr * 1e-6)).toBe(0);
      const vp = Math.acos(-R / rr);
      // 원환 면 하나(u 반 바퀴): π·r·(R·vp + r·sin vp), 부피: π∫ρ² dz(자오선 v 0 → vp — 꼭짓점 쪽 오목한 데를 뺀다)
      const half = Math.PI * rr * (R * vp + rr * Math.sin(vp));
      let vol = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const v = ((i + 0.5) / n) * vp;
        const rho = R + rr * Math.cos(v);
        vol += rho * rho * rr * Math.cos(v) * (vp / n);
      }
      vol *= Math.PI;
      expect(Math.abs(meshVolume(m.positions, m.indices) / vol - 1)).toBeLessThan(0.01);
      // 면 표(입체의 면 차례 — 원환 둘, 평면): 원환 면 넓이가 반쪽 캡 넓이(예전에는 곡면의 안쪽 겹친 부분까지 덮어 열 배 남짓)
      const t = meta.faceTables![0]!;
      expect(t.stepIds).toHaveLength(3);
      for (const i of [0, 1]) expect(Math.abs(t.area![i]! / half - 1)).toBeLessThan(1e-3);
    });
});
