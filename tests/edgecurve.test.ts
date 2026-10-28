/**
 * 모서리 표의 곡선 정의와 곡선 위 가장 가까운 매개변수(src/edgecurve.ts): 곡선 위 점에서 법선 쪽(과 평면 밖)으로 조금 비킨 점의
 * 가장 가까운 매개변수가 원래 매개변수와 1e-9 안으로 같고, 접선이 해석적 도함수 방향과 같은지 본다.
 * 원(식), 타원(매개변수 각에서), 3차 베지어·여러 매듭 구간 B-스플라인·유리 2차 사분원·닫힌 유리 원(주기, 모서리 구간이 이음을 넘는다).
 * 기록 만들기·읽기·배율과 해석기가 모서리 표에 싣는 기록도 본다.
 */
import { describe, expect, it } from 'vitest';
import { NurbsCurve } from '../src/nurbs';
import {
  BSPLINE_HEAD,
  BSPLINE_RECORD_MAX,
  bsplineRecord,
  type BsplineDef,
  edgeCurve,
  type EllipseDef,
  ellipseRecord,
  nearestOnBspline,
  nearestOnCircle,
  nearestOnCurve,
  nearestOnEllipse,
  scaleCurveRecords,
} from '../src/edgecurve';
import { EDGE_KINDS, stepToScene } from '../src/index';
import { stepEdgeIndex } from '../src/app/doc';
import type { V3 } from '../src/math';
import { BS_CP, curveStep } from './app/curvescene';

const add = (a: readonly number[], b: readonly number[], s = 1): V3 => [a[0]! + b[0]! * s, a[1]! + b[1]! * s, a[2]! + b[2]! * s];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): V3 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};
const near = (a: readonly number[], b: readonly number[], tol: number): void => {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
/** 주기 2π로 감은 차 */
const angDiff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('원: 식으로 가장 가까운 점·접선', () => {
  const X = unit([Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0]);
  const n: V3 = [0, 0, 2];
  const Y = cross([0, 0, 1], X);
  const c = { center: [1, 2, 3] as V3, normal: n, r: 5 };
  const at = (t: number): V3 => add(add(c.center, X, 5 * Math.cos(t)), Y, 5 * Math.sin(t));
  it('법선 쪽·평면 밖으로 비킨 점의 매개변수(틀 x축에서 잰 각)가 1e-9 안, 접선은 법선 × 반지름 방향', () => {
    for (const t of [0.1, 1, 2.5, 4, 6.2]) {
      const radial = unit([Math.cos(t) * X[0] + Math.sin(t) * Y[0], Math.cos(t) * X[1] + Math.sin(t) * Y[1], 0]);
      const q = add(add(at(t), radial, 0.3), [0, 0, 1], -0.7);
      const f = nearestOnCircle(c, q, X)!;
      expect(angDiff(f.t, t)).toBeLessThan(1e-9);
      near(f.point, at(t), 1e-12);
      near(f.tangent, unit(add(add([0, 0, 0], X, -Math.sin(t)), Y, Math.cos(t))), 1e-12);
      expect(f.dist).toBeCloseTo(Math.hypot(0.3, 0.7), 12);
    }
    // 축 위 점은 모든 점이 같은 거리 — 못 정한다
    expect(nearestOnCircle(c, [1, 2, 10])).toBeNull();
    // 틀 x축을 주지 않으면 t는 없다(접선만)
    expect(Number.isNaN(nearestOnCurve({ kind: 'circle', ...c }, at(1))!.t)).toBe(true);
  });
});

describe('타원: 매개변수 각에서 뉴턴', () => {
  const X = unit([Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0]);
  const Y = cross([0, 0, 1], X);
  const a = 12;
  const b = 6;
  const center: V3 = [40, 0, 0];
  // 법선은 단위가 아니고 x축은 법선 쪽으로 기울어도 된다(틀처럼 바로잡는다)
  const c: EllipseDef = { kind: 'ellipse', center, normal: [0, 0, 3], x: add(X, [0, 0, 1], 0.3), a, b };
  const at = (t: number): V3 => add(add(center, X, a * Math.cos(t)), Y, b * Math.sin(t));
  const tan = (t: number): V3 => unit(add(add([0, 0, 0], X, -a * Math.sin(t)), Y, b * Math.cos(t)));
  it('곡선 안팎(법선 ±0.05)·평면 밖으로 비킨 점의 매개변수가 1e-9 안, 접선은 −a sin t X + b cos t Y', () => {
    for (const t of [0.3, 1.2, 2.0, Math.PI / 2, 3.0, 4.4, 5.9]) {
      const N = cross([0, 0, 1], tan(t));
      for (const d of [0.05, -0.05, 0]) {
        const q = add(add(at(t), N, d), [0, 0, 1], 0.4);
        const f = nearestOnEllipse(c, q)!;
        expect(angDiff(f.t, t), `t ${t}, 비킴 ${d}`).toBeLessThan(1e-9);
        expect(f.t).toBeGreaterThanOrEqual(0);
        expect(f.t).toBeLessThan(2 * Math.PI);
        near(f.point, at(t), 1e-9);
        near(f.tangent, tan(t), 1e-9);
      }
    }
  });
});

/** NurbsCurve → 정의(기록을 거쳐) */
function defOf(nc: NurbsCurve, ta: number, tb: number, period = 0, origin: V3 | null = null): BsplineDef {
  const rec = bsplineRecord(nc, ta, tb, period, origin)!;
  expect(rec).not.toBeNull();
  const table = { kinds: Uint8Array.of(EDGE_KINDS.indexOf('bspline')), params: new Float64Array(8), curveStart: Uint32Array.of(0, rec.length), curves: Float64Array.from(rec) };
  return edgeCurve(table, 0, EDGE_KINDS) as BsplineDef;
}

/** 곡선 위 매개변수 u의 점에서 평면(z=0) 안 법선 쪽으로 d만큼 비킨 점 */
const offsetAt = (nc: NurbsCurve, u: number, d: number): V3 => {
  const [C, D] = nc.evalDerivs(u, 1);
  return add(C!, cross([0, 0, 1], unit(D!)), d);
};

describe('B-스플라인: 매듭 구간 표본 + 뉴턴', () => {
  it('3차 베지어(조절점 넷): 매개변수 1e-9 안, 접선은 도함수 방향', () => {
    const nc = new NurbsCurve(3, Float64Array.of(0, 0, 0, 0, 1, 1, 1, 1), BS_CP as V3[], null);
    const c = defOf(nc, 0, 1);
    for (const u of [0.05, 0.25, 0.5, 0.75, 0.95])
      for (const d of [0.05, -0.05, 0]) {
        const f = nearestOnBspline(c, offsetAt(nc, u, d))!;
        expect(Math.abs(f.t - u), `u ${u}, 비킴 ${d}`).toBeLessThan(1e-9);
        near(f.tangent, unit(nc.evalDerivs(u, 1)[1]!), 1e-9);
      }
  });

  it('여러 매듭 구간(3차, 조절점 일곱, 매듭 경계 가까이 포함)과 거꾸로 쓴 모서리 구간(ta > tb)', () => {
    const cp: V3[] = [
      [0, 0, 0],
      [3, 5, 0],
      [7, 6, 0],
      [10, 1, 0],
      [14, -2, 0],
      [18, 3, 0],
      [21, 0, 0],
    ];
    const nc = new NurbsCurve(3, Float64Array.of(0, 0, 0, 0, 0.3, 0.5, 0.8, 1, 1, 1, 1), cp, null);
    const c = defOf(nc, 1, 0);
    for (const u of [0.02, 0.2999999, 0.3000001, 0.41, 0.5, 0.66, 0.8, 0.97])
      for (const d of [0.03, -0.03]) {
        const f = nearestOnBspline(c, offsetAt(nc, u, d))!;
        expect(Math.abs(f.t - u), `u ${u}, 비킴 ${d}`).toBeLessThan(1e-9);
      }
    // 구간 밖으로 나간 점은 가까운 끝
    expect(nearestOnBspline(c, [-5, -1, 0])!.t).toBe(0);
  });

  it('유리 2차 사분원(가중치 1, √2/2, 1): 반지름 쪽으로 비킨 점의 매개변수 1e-9 안, 접선은 원의 접선', () => {
    const R = 7;
    const w = Math.SQRT1_2;
    const nc = new NurbsCurve(2, Float64Array.of(0, 0, 0, 1, 1, 1), [
      [R, 0, 0],
      [R, R, 0],
      [0, R, 0],
    ], [1, w, 1]);
    const c = defOf(nc, 0, 1);
    expect(c.rational).toBe(true);
    for (const u of [0.1, 0.37, 0.5, 0.81]) {
      const C = nc.point(u);
      for (const k of [1.02, 0.97]) {
        const f = nearestOnBspline(c, [C[0] * k, C[1] * k, 0])!;
        expect(Math.abs(f.t - u)).toBeLessThan(1e-9);
        near(f.tangent, unit([-C[1], C[0], 0]), 1e-9);
      }
    }
  });

  it('닫힌 유리 원(아홉 조절점, 주기 1)의 모서리 구간 0.6 → 1.6: 이음을 넘는 곳도 찾고 t는 매듭 구간으로 감는다', () => {
    const w = Math.SQRT1_2;
    const R = 4;
    const sq: V3[] = [
      [R, 0, 0],
      [R, R, 0],
      [0, R, 0],
      [-R, R, 0],
      [-R, 0, 0],
      [-R, -R, 0],
      [0, -R, 0],
      [R, -R, 0],
      [R, 0, 0],
    ];
    const nc = new NurbsCurve(2, Float64Array.of(0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1), sq, [1, w, 1, w, 1, w, 1, w, 1]);
    const c = defOf(nc, 0.6, 1.6, 1);
    for (const u of [0.02, 0.1, 0.62, 0.9, 0.98]) {
      const C = nc.point(u);
      const f = nearestOnBspline(c, [C[0] * 1.01, C[1] * 1.01, 0.2])!;
      expect(Math.abs(f.t - u), `u ${u}`).toBeLessThan(1e-9);
      near(f.point, C, 1e-9);
    }
  });
});

describe('기록 만들기·읽기·배율', () => {
  const nc = new NurbsCurve(3, Float64Array.of(0, 0, 0, 0, 1, 1, 1, 1), BS_CP as V3[], [1, 2, 0.5, 1]);
  it('B-스플라인 기록: 머리·매듭·조절점(origin을 뺀 직교 좌표와 가중치), 한도를 넘으면 null', () => {
    const rec = bsplineRecord(nc, 0.1, 0.9, 0, [1, 1, 0])!;
    expect(rec.slice(0, BSPLINE_HEAD)).toEqual([3, 4, 1, 0.1, 0.9, 0]);
    expect(rec.slice(BSPLINE_HEAD, BSPLINE_HEAD + 8)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const ctrl = rec.slice(BSPLINE_HEAD + 8);
    expect(ctrl).toHaveLength(16);
    near(ctrl.slice(4, 7), [1, 5, 0], 1e-12);
    expect(ctrl[7]).toBe(2);
    expect(bsplineRecord(nc, 0, 1, 0, null, rec.length - 1)).toBeNull();
    expect(bsplineRecord(nc, 0, 1, 0, null, rec.length)).not.toBeNull();
    expect(BSPLINE_RECORD_MAX).toBeGreaterThanOrEqual(256);
    // origin을 뺀 기록의 정의 위 가장 가까운 점 = 원래 곡선 위 점 − origin
    const def = defOf(nc, 0, 1, 0, [1, 1, 0]);
    const C = nc.point(0.4);
    const f = nearestOnBspline(def, [C[0] - 1, C[1] - 1, 0])!;
    expect(Math.abs(f.t - 0.4)).toBeLessThan(1e-9);
  });

  it('배율: B-스플라인 조절점 좌표만 k배(가중치·매듭·구간은 그대로), 타원 축은 그대로', () => {
    const rb = bsplineRecord(nc, 0, 1, 0)!;
    const re = ellipseRecord([0.6, 0.8, 0]);
    const curves = Float64Array.from([...re, ...rb]);
    const curveStart = Uint32Array.of(0, 3, 3, curves.length);
    const kinds = Uint8Array.of(EDGE_KINDS.indexOf('ellipse'), EDGE_KINDS.indexOf('line'), EDGE_KINDS.indexOf('bspline'));
    const s = scaleCurveRecords(curveStart, curves, kinds, EDGE_KINDS, 25.4);
    expect([...s.subarray(0, 3)]).toEqual(re);
    const sb = [...s.subarray(3)];
    expect(sb.slice(0, BSPLINE_HEAD + 8)).toEqual(rb.slice(0, BSPLINE_HEAD + 8));
    const c0 = BSPLINE_HEAD + 8;
    for (let i = 0; i < 4; i++) {
      for (let q = 0; q < 3; q++) expect(sb[c0 + i * 4 + q]).toBeCloseTo(rb[c0 + i * 4 + q]! * 25.4, 12);
      expect(sb[c0 + i * 4 + 3]).toBe(rb[c0 + i * 4 + 3]);
    }
    expect(curves[3 + c0 + 4]).toBe(2);
  });

  it('해석기: 타원은 틀 x축, B-스플라인은 정의를 싣고 원·직선은 기록이 없다', () => {
    const scene = stepToScene(curveStep());
    const ex = stepEdgeIndex(scene)!;
    const seen: string[] = [];
    for (const t of ex.tables) {
      const here = [...t.kinds].map((k) => ex.kinds[k]!);
      for (let e = 0; e < t.kinds.length; e++) {
        const kind = ex.kinds[t.kinds[e]!]!;
        const len = t.curveStart ? t.curveStart[e + 1]! - t.curveStart[e]! : 0;
        const d = edgeCurve(t, e, ex.kinds);
        if (kind === 'line') {
          expect(len).toBe(0);
          expect(d).toBeNull();
        } else if (kind === 'circle') {
          expect(len).toBe(0);
          expect(d).toMatchObject({ kind: 'circle', r: 10 });
        } else if (kind === 'ellipse') {
          expect(len).toBe(3);
          const el = d as EllipseDef;
          near(el.x, [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0], 1e-15);
          expect([el.a, el.b]).toEqual([12, 6]);
        } else if (kind === 'bspline') {
          const bs = d as BsplineDef;
          expect(bs).toMatchObject({ degree: 3, rational: false, ta: 0, tb: 1, period: 0 });
          expect([...bs.knots]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
          expect([...bs.ctrl]).toEqual(BS_CP.flat());
        }
        seen.push(kind);
      }
      // 원기둥 표(원만)는 기록 배열이 없고, 타원·B-스플라인이 있는 표는 모서리마다 시작(+ 끝 하나)
      if (!here.includes('ellipse') && !here.includes('bspline')) expect(t.curveStart).toBeUndefined();
      else expect(t.curveStart).toHaveLength(t.kinds.length + 1);
    }
    expect(seen.filter((k) => k === 'bspline')).toHaveLength(1);
    expect(seen.filter((k) => k === 'ellipse')).toHaveLength(1);
  });
});
