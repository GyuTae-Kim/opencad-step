/**
 * 43차 측정 접점(첫 점에서 곡선 모서리에 그은 접선이 닿는 점 — AutoCAD 접점 붙잡기): 코어 0.36.0의 기존 앱 점 길(pointsFor·SnapPoint.order·setMeasureSnapLimit)만으로 붙는다.
 * - 계산(curvesnap.ts curveTangents·tangentsOnArc): 원·타원은 닫힌 식, B-스플라인은 매개변수 뉴턴 — 기댓값은 시험 장면(curvescene.ts)의 식으로 따로 구한다
 * - 실제 코어(가짜 DOM): 첫 점을 찍은 뒤 접점 둘레를 가리키면 앱 점 'point'("접점")로 붙고 찍으면 "끝점 → 접점",
 *   둘째 점·지우기 뒤 같은 자리를 다시 보면(코어가 앞 pointsFor 결과를 다시 쓴다) 앞 첫 점의 접점은 붙지 않는다(MeasureFirst 세대 한도)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import type { Mesh3d, Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import type { StepEdgeTable } from '../../src/scene';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, edgeSnapPoints, hoverSnapLabel, measureSnapOptions, snapPair, TANGENT_POINT_LABEL } from '../../src/app/snap';
import { curveSnap, curveTangents, type EdgeArc, MeasureFirst, tangentsOnArc } from '../../src/app/curvesnap';
import { bsplineEval, edgeCurve, type BsplineDef } from '../../src/edgecurve';
import { translate } from '../../site/i18n.mjs';
import { type FakeElement, installDom } from './fakeview';
import { bsAt, bsTangentAt, curveStep, ELL_C, ELL_END, ELL_T0, ELL_T1, ellAt, ellTangent, footParam, RIM_R, type V3 } from './curvescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const scene = stepToScene(curveStep());
const ex = stepEdgeIndex(scene)!;
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
/** (F − Q)와 접선 T가 이루는 각의 사인(0이면 F가 Q의 접선 위) */
const sinTo = (F: readonly number[], Q: readonly number[], T: readonly number[]): number => Math.hypot(...cross(sub(F, Q), T)) / dist(F, Q) / Math.hypot(...T);

/** 장면의 곡선 모서리(그물·표·모서리 번호·정의) */
function curveEdges(): { mesh: Mesh3d; table: StepEdgeTable; e: number; kind: string; center?: V3 }[] {
  const out: { mesh: Mesh3d; table: StepEdgeTable; e: number; kind: string; center?: V3 }[] = [];
  for (const mesh of scene.meshes) {
    const ti = ex.tableOf.get(mesh.id);
    const table = ti === undefined ? undefined : ex.tables[ti];
    if (!table) continue;
    for (let e = 0; e < table.kinds.length; e++) {
      const d = edgeCurve(table, e, ex.kinds);
      if (d) out.push({ mesh, table, e, kind: d.kind, ...(d.kind !== 'bspline' ? { center: [...d.center] as V3 } : {}) });
    }
  }
  return out;
}
const edges = curveEdges();
const bottom = edges.find((c) => c.kind === 'circle' && c.center![2] === 0)!;
const top = edges.find((c) => c.kind === 'circle' && c.center![2] === 20)!;
const ellipse = edges.find((c) => c.kind === 'ellipse')!;
const spline = edges.find((c) => c.kind === 'bspline')!;
const tangents = (c: (typeof edges)[number], F: readonly number[]) => curveTangents(c.mesh, c.table, c.e, ex.kinds, F);

describe('첫 점에서 그은 접선의 접점(curveTangents)', () => {
  it('원: 평면 위 바깥 점에서 두 접점(닫힌 식 — 반지름 ⊥ 접선, 원 위 1e-12), 평면 밖·원 안·원 위의 첫 점에서는 없다', () => {
    expect([bottom, top, ellipse, spline].every(Boolean)).toBe(true);
    const F: V3 = [40, 0, 0];
    const got = tangents(bottom, F);
    expect(got).toHaveLength(2);
    // 기댓값: c + r(r/d · e ± √(1 − r²/d²) · n×e) — c = 0, r = 10, d = 40, e = +X
    const s = Math.sqrt(1 - (RIM_R / 40) ** 2) * RIM_R;
    const want: V3[] = [
      [RIM_R ** 2 / 40, s, 0],
      [RIM_R ** 2 / 40, -s, 0],
    ];
    for (const w of want) close(got.find((q) => dist(q, w) < 1e-6), w, 1e-12);
    for (const q of got) {
      expect(Math.abs(Math.hypot(q[0]!, q[1]!) - RIM_R)).toBeLessThan(1e-12);
      expect(Math.abs(dot(q, sub(F, q)))).toBeLessThan(1e-9);
    }
    // 윗 테두리(z = 20)는 첫 점(z = 0)이 원 평면 밖이라 3D로 접하는 직선이 없다
    expect(tangents(top, F)).toEqual([]);
    expect(tangents(bottom, [3, 4, 0])).toEqual([]);
    expect(tangents(bottom, [6, 8, 0])).toEqual([]);
    expect(tangents(bottom, [40, 0, 0.5])).toEqual([]);
  });

  it('타원 호(틀 30° 돈 a = 12, b = 6의 π/6 → π): 호 안의 접점만 — 접선 식과 다른 길(표본 반 나눔)로 구한 곡선 위 점, 접선과 사인 1e-9', () => {
    const F: V3 = [40, 20, 0];
    const got = tangents(ellipse, F);
    // 틀 좌표 (x0, y0) = (10, 10√3)에서 x cos t / 12 + y sin t / 6 = 1의 두 근 t ≈ 0.058(호 밖)·2.521(호 안)
    expect(got).toHaveLength(1);
    const Q = got[0]!;
    const t = footParam(ellAt, ellTangent, Q, ELL_T0, ELL_T1);
    close(Q, ellAt(t), 1e-9);
    expect(sinTo(F, Q, ellTangent(t))).toBeLessThan(1e-9);
    expect(t).toBeGreaterThan(2.4);
    // 호 끝에서 그 끝의 접선 위인 첫 점: 접점이 끝점이라 빼고(끝점 붙잡기가 맡는다) 다른 접점만
    const T = ellTangent(ELL_T1);
    const G: V3 = [ELL_END[0] + 9 * T[0], ELL_END[1] + 9 * T[1], 0];
    for (const q of tangents(ellipse, G)) expect(dist(q, ELL_END)).toBeGreaterThan(1e-3);
  });

  it('B-스플라인(돌려 놓은 판의 3차 베지어): 한 점의 접선 위 첫 점에서 그 점이 접점, 찾은 접점은 모두 곡선 위 접선이 첫 점을 지난다', () => {
    for (const u of [0.15, 0.4, 0.75]) {
      const C = bsAt(u);
      const T = bsTangentAt(u);
      for (const k of [6, -9]) {
        const F: V3 = [C[0] + k * T[0], C[1] + k * T[1], 0];
        const got = tangents(spline, F);
        expect(got.some((q) => dist(q, C) < 1e-9), `u ${u} k ${k}`).toBe(true);
        for (const q of got) {
          const uq = footParam(bsAt, bsTangentAt, q, 0, 1);
          close(q, bsAt(uq), 1e-9);
          expect(sinTo(F, q, bsTangentAt(uq))).toBeLessThan(1e-9);
        }
      }
    }
    // 판 평면 밖
    expect(tangents(spline, [bsAt(0.4)[0], bsAt(0.4)[1], 1])).toEqual([]);
  });

  it('평면이 아닌 B-스플라인(꼬인 3차 — 직접 만든 곡선): 접선 위 첫 점에서만 3D 접점, 접선에서 조금 비킨 점에서는 없다. 가까운 두 근도 구간 나눔으로 찾는다', () => {
    // (t, t², t³)를 [0, 1] 베지어로: 조절점 (0,0,0), (1/3,0,0), (2/3,1/3,0), (1,1,1)
    const def: BsplineDef = { kind: 'bspline', degree: 3, knots: Float64Array.from([0, 0, 0, 0, 1, 1, 1, 1]), ctrl: Float64Array.from([0, 0, 0, 1 / 3, 0, 0, 2 / 3, 1 / 3, 0, 1, 1, 1]), rational: false, ta: 0, tb: 1, period: 0 };
    const ev = bsplineEval(def);
    const n = 64;
    const arc: EdgeArc = { def, ev, n, param: (i) => i / n, vertex: (i) => [...ev(i / n)[0]] as V3 };
    const u = 0.55;
    const [C, D] = ev(u);
    const F: V3 = [C[0] + 0.8 * D[0], C[1] + 0.8 * D[1], C[2] + 0.8 * D[2]];
    const got = tangentsOnArc(arc, F, 1e-9);
    expect(got).toHaveLength(1);
    close(got[0], C, 1e-9);
    const off: V3 = [F[0], F[1] + 1e-3, F[2] - 1e-3];
    expect(tangentsOnArc(arc, off, 1e-9)).toEqual([]);
    // 원에 아주 가까운 바깥 첫 점(d = r(1 + 1e-6))의 두 접점(각 ±0.0014 rad) — 원은 식이라 늘 둘
    const near = tangents(bottom, [RIM_R * (1 + 1e-6), 0, 0]);
    expect(near).toHaveLength(2);
    expect(dist(near[0]!, near[1]!)).toBeLessThan(0.05);
    // B-스플라인 바로 바깥(볼록한 쪽 1e-4)의 첫 점: 두 접점이 표본 한 칸(1/16) 안에 함께 있어 부호가 같다 — 극값을 품은 칸을 반으로 나눠 둘 다 찾는다
    const C5 = bsAt(0.5);
    const T5 = bsTangentAt(0.5);
    const N5: V3 = [-T5[1], T5[0], 0];
    const sides = [1, -1].map((s) => tangents(spline, [C5[0] + s * 1e-4 * N5[0], C5[1] + s * 1e-4 * N5[1], 0]).filter((q) => dist(q, C5) < 0.05));
    const two = sides.find((g) => g.length === 2)!;
    expect(two, '볼록한 쪽의 두 접점').toBeTruthy();
    expect(sides.find((g) => g !== two)).toEqual([]);
    const us = two.map((q) => footParam(bsAt, bsTangentAt, q, 0, 1));
    expect(Math.abs(us[0]! - us[1]!)).toBeLessThan(1 / 16);
    expect(Math.abs(us[0]! - us[1]!)).toBeGreaterThan(1e-5);
    const Fs = sides[0] === two ? 1 : -1;
    const Fn: V3 = [C5[0] + Fs * 1e-4 * N5[0], C5[1] + Fs * 1e-4 * N5[1], 0];
    two.forEach((q, i) => {
      close(q, bsAt(us[i]!), 1e-9);
      expect(sinTo(Fn, q, bsTangentAt(us[i]!))).toBeLessThan(1e-7);
    });
  });

  it('붙잡기 점(edgeSnapPoints): 첫 점이 있으면 곡선 모서리의 끝점·가운데 점·중심 뒤에 접점(kind point·그 세대 차례 값), 첫 점이 없거나 곧은 모서리면 예전 그대로', () => {
    const cs = curveSnap(scene.meshes, ex)!;
    const byId = new Map(scene.meshes.map((m) => [m.id, m] as const));
    const segOf = (c: (typeof edges)[number]) => c.table.segStart[c.e]! + 1;
    const pick = (c: (typeof edges)[number]): Pick3d => ({ kind: 'edge', id: c.mesh.id, index: segOf(c), raw: segOf(c), point: [0, 0, 0] });
    const plain = edgeSnapPoints(pick(bottom), byId, ex, cs)!;
    const withF = edgeSnapPoints(pick(bottom), byId, ex, cs, { point: [40, 0, 0], order: -3 })!;
    expect(withF.slice(0, plain.length)).toEqual(plain);
    expect(withF.slice(plain.length).map((p) => [p.kind, p.order, p.id])).toEqual([
      ['point', -3, bottom.mesh.id],
      ['point', -3, bottom.mesh.id],
    ]);
    // 타원 호 끝의 접선 위 첫 점: 그 끝점 자리 접점은 끝점과 겹쳐 더하지 않는다
    const T = ellTangent(ELL_T1);
    const G: V3 = [ELL_END[0] + 9 * T[0], ELL_END[1] + 9 * T[1], 0];
    const ep = edgeSnapPoints(pick(ellipse), byId, ex, cs, { point: G, order: -1 })!;
    expect(ep.filter((p) => p.kind === 'point').every((p) => dist(p.point, ELL_END) > 1e-3)).toBe(true);
    expect(ep.filter((p) => p.kind === 'endpoint')).toHaveLength(2);
  });
});

describe('측정 첫 점 세대(MeasureFirst)', () => {
  it('첫 점만 찍었을 때만 그 점, 찍은 점이 바뀔 때마다 세대를 올려 붙잡기 한도를 1 − 세대로(지금 세대 차례 −세대만 붙는다)', () => {
    let count = 0;
    const limits: (number | null)[] = [];
    const v = {
      get measurePointCount() {
        return count;
      },
      get measurePoints() {
        return count ? [{ point: [1, 2, 3] as V3, snap: null }] : [];
      },
      setMeasureSnapLimit: (n: number | null) => void limits.push(n),
    };
    const f = new MeasureFirst(v as never);
    expect(f.point()).toBeNull();
    count = 1;
    expect(f.point()).toEqual([1, 2, 3]);
    expect(f.order).toBe(-1);
    f.changed();
    expect([f.order, limits]).toEqual([-2, [-1]]);
    // 지금 세대(−2) < 한도(−1), 앞 세대(−1)는 한도에 걸린다
    expect(-2 < limits[0]!).toBe(true);
    expect(-1 < limits[0]!).toBe(false);
    count = 2;
    expect(f.point()).toBeNull();
  });
});

describe('실제 코어로 접점 붙잡기(가짜 DOM)', () => {
  interface View {
    v: Viewer3d;
    canvas: FakeElement;
    got: MeasureResult[];
  }
  function view(first = true): View {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
    v.setScene(scene);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    v.setMeasureMode(true);
    const mf = first ? new MeasureFirst(v) : null;
    v.setMeasureSnap(measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), curveSnap(scene.meshes, ex), false, null, mf));
    const got: MeasureResult[] = [];
    // 앱(app.ts)처럼: 찍은 점이 바뀌면 세대를 올린다
    v.onMeasure((m) => {
      mf?.changed();
      if (m) got.push(m);
    });
    return { v, canvas: v.canvas as unknown as FakeElement, got };
  }
  const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
    w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  const at = (w: View, p: readonly number[]): { x: number; y: number } => {
    const q = w.v.project(p, { occlusion: true })!;
    expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
    return { x: q.x, y: q.y };
  };
  const hoverXY = (w: View, x: number, y: number) => {
    ptr(w, 'pointermove', x, y, 0);
    w.v.renderNow();
    return w.v.measureHoverSnap;
  };
  const clickXY = (w: View, x: number, y: number): void => {
    ptr(w, 'pointermove', x, y, 0);
    ptr(w, 'pointerdown', x, y, 1);
    ptr(w, 'pointerup', x, y, 0);
    w.v.renderNow();
  };
  // 남동 등각에서 보이는 앞쪽 접점: 첫 점 (40, 0, 0)에서 원기둥 바닥 원(z = 0)에 그은 접선의 (2.5, −9.68…, 0)
  const F: V3 = [40, 0, 0];
  const Q: V3 = [RIM_R ** 2 / 40, -Math.sqrt(1 - (RIM_R / 40) ** 2) * RIM_R, 0];

  it('첫 점(타원 판 꼭짓점)을 찍은 뒤 접점 둘레를 가리키면 "접점"(곡선 위 1e-9 — 첫 점에서 그은 직선이 접한다), 찍으면 "끝점 → 접점"', () => {
    const w = view();
    const c = at(w, ELL_C);
    // 첫 점 전에는 그 자리에 접점이 없다
    const q = at(w, Q);
    const h0 = hoverXY(w, q.x + 0.7, q.y - 0.4);
    expect(h0?.snap).not.toBe('point');
    clickXY(w, c.x + 0.3, c.y - 0.2);
    expect(w.v.measurePointCount).toBe(1);
    close(w.v.measurePoints[0]!.point, F, 1e-6);
    const h = hoverXY(w, q.x + 0.7, q.y - 0.4)!;
    expect(h.snap).toBe('point');
    close(h.point, Q, 1e-9);
    expect(hoverSnapLabel(h)).toBe(TANGENT_POINT_LABEL);
    clickXY(w, q.x + 0.7, q.y - 0.4);
    const m = w.got.at(-1)!;
    expect(snapPair(m)).toEqual(['끝점', '접점']);
    expect(m.distance).toBeCloseTo(Math.sqrt(40 ** 2 - RIM_R ** 2), 6);
    // 둘째 점 뒤 같은 자리(코어가 앞 pointsFor 결과를 다시 쓴다) — 앞 첫 점의 접점은 붙잡기 한도로 걸러 붙지 않는다
    expect(hoverXY(w, q.x + 0.7, q.y - 0.4)?.snap).not.toBe('point');
    w.v.dispose();
  });

  it('세대를 쓰지 않으면(MeasureFirst 없음) 접점을 더하지 않는다 — 붙잡기 결과가 예전과 같다, 지우기(Esc) 뒤 같은 자리도 접점이 남지 않는다', () => {
    const plain = view(false);
    const w = view();
    const c = at(w, ELL_C);
    const q = at(w, Q);
    clickXY(plain, c.x + 0.3, c.y - 0.2);
    clickXY(w, c.x + 0.3, c.y - 0.2);
    expect(hoverXY(plain, q.x + 0.7, q.y - 0.4)?.snap).not.toBe('point');
    expect(hoverXY(w, q.x + 0.7, q.y - 0.4)?.snap).toBe('point');
    // 지우기: 찍은 점이 없으면 같은 자리를 다시 봐도(코어가 앞 결과를 다시 쓴다) 접점이 아니다
    w.v.clearMeasure();
    expect(w.v.measurePointCount).toBe(0);
    expect(hoverXY(w, q.x + 0.7, q.y - 0.4)?.snap).not.toBe('point');
    // 조금 움직여도(새로 구함) 첫 점이 없으니 접점이 없다
    expect(hoverXY(w, q.x + 1.1, q.y - 0.2)?.snap).not.toBe('point');
    plain.v.dispose();
    w.v.dispose();
  });

  it('새 이름 "접점"은 네 언어 사전에 있다', () => {
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) expect(translate(TANGENT_POINT_LABEL, lang), lang).not.toMatch(/[가-힣]/);
  });
});
