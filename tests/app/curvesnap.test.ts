/**
 * 측정 붙잡기 점을 B-rep 곡선 위로(app/curvesnap.ts — 순수 계산): 꺾은선 꼭짓점의 곡선 매개변수, 수직 발·모서리 위 점·코어 가운데 점 다듬기,
 * 곡선 길이 가운데 점, 곡선까지 거리. 기댓값은 시험 장면(curvescene.ts)의 식으로 따로 구한다.
 */
import { describe, expect, it } from 'vitest';
import type { SnapRefineInput } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { curveDistance, curveMidpoint, edgeArc, type EdgeArc, refineOnArc, refineSnap, toLocal, toWorld } from '../../src/app/curvesnap';
import { curveEndsAt, type CurveEnd } from '../../src/app/tangent';
import { arcCuts, arcMidParam, type EllipseDef, ellipseEval, rtsafe } from '../../src/edgecurve';
import { StepText } from '../stepText';
import { bsAt, BS_START, bsTangentAt, curveStep, ellAt, ELL_START, ELL_T0, ELL_T1, ellTangent, footParam, RIM, RIM_H, RIM_R, rimAt, type V3 } from './curvescene';

const scene = stepToScene(curveStep());
const ex = stepEdgeIndex(scene)!;
const byId = new Map(scene.meshes.map((m) => [m.id, m] as const));
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + k * b[0]!, a[1]! + k * b[1]!, a[2]! + k * b[2]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};

/** 곡선 끝(curveEndsAt)의 모서리 곡선과 세계 ↔ 묶음 좌표 */
function arcOf(e: CurveEnd): { arc: EdgeArc; local: (p: readonly number[]) => V3; world: (p: readonly number[]) => V3 } {
  const arc = edgeArc(e.mesh.edges!, e.table, e.edge, ex.kinds)!;
  expect(arc).toBeTruthy();
  return { arc, local: (p) => toLocal(e.mesh, p)!.p, world: (p) => toWorld(e.mesh, p[0]!, p[1]!, p[2]!) };
}
const rimEnd = curveEndsAt(scene.meshes, ex, RIM)[0]!;
const ellEnd = curveEndsAt(scene.meshes, ex, ELL_START)[0]!;
const bsEnd = curveEndsAt(scene.meshes, ex, BS_START)[0]!;

describe('꺾은선 꼭짓점의 곡선 매개변수(edgeArc)', () => {
  it('원(한 바퀴 — 틀 x축은 이음 꼭짓점 쪽): 0에서 ±2π까지 단조, 꼭짓점마다 그 각의 원 위 점(float32 꼭짓점 안)', () => {
    const { arc, world } = arcOf(rimEnd);
    expect(arc.n).toBeGreaterThan(8);
    expect(arc.param(0)).toBe(0);
    expect(Math.abs(arc.param(arc.n))).toBeCloseTo(2 * Math.PI, 12);
    const s = Math.sign(arc.param(arc.n));
    for (let i = 0; i <= arc.n; i++) {
      if (i) expect(s * (arc.param(i) - arc.param(i - 1))).toBeGreaterThan(0);
      close(world(arc.ev(arc.param(i))[0]), world(arc.vertex(i)), 1e-5);
      // 틀 x축이 이음 꼭짓점(float32) 쪽이라 각 = 원기둥 원 틀에서 이음 꼭짓점부터 잰 각(꼭짓점 반올림만큼), 점은 원 위(1e-12)
      const P = world(arc.ev(arc.param(i))[0]);
      close(P, rimAt(arc.param(i)), 1e-6);
      expect(Math.abs(Math.hypot(P[0], P[1]) - RIM_R)).toBeLessThan(1e-12);
      expect(P[2]).toBe(RIM_H);
    }
  });

  it('타원 호(틀 x축 30°): 시작·끝이 π/6·π, B-스플라인(돌린 부품): 0·1이고 안쪽은 가장 가까운 매개변수', () => {
    const e = arcOf(ellEnd);
    expect(e.arc.param(0)).toBeCloseTo(ELL_T0, 6);
    expect(e.arc.param(e.arc.n)).toBeCloseTo(ELL_T1, 6);
    for (let i = 0; i <= e.arc.n; i++) close(e.world(e.arc.ev(e.arc.param(i))[0]), ellAt(e.arc.param(i)), 1e-9);
    const b = arcOf(bsEnd);
    expect(b.arc.param(0)).toBe(0);
    expect(b.arc.param(b.arc.n)).toBe(1);
    for (let i = 1; i < b.arc.n; i++) {
      expect(b.arc.param(i)).toBeGreaterThan(b.arc.param(i - 1));
      close(b.world(b.arc.ev(b.arc.param(i))[0]), bsAt(b.arc.param(i)), 1e-9);
      close(bsAt(b.arc.param(i)), b.world(b.arc.vertex(i)), 1e-5);
    }
  });

  it('직선 모서리·곡선 정의가 없는 모서리(옛 결과의 타원)는 없다', () => {
    const t = ellEnd.table;
    const line = Array.from(t.kinds).findIndex((k) => ex.kinds[k] === 'line');
    expect(edgeArc(ellEnd.mesh.edges!, t, line, ex.kinds)).toBeNull();
    const old = { ...t, curveStart: undefined, curves: undefined };
    expect(edgeArc(new Float32Array(ellEnd.mesh.edges!), old, ellEnd.edge, ex.kinds)).toBeNull();
  });
});

/** 곡선 위 점 C(t)에서 평면 안 법선(접선 × 판 법선) 쪽으로 d만큼 나간 점 — 거기서 곡선으로 내린 발은 C(t) */
const offNormal = (C: V3, T: V3, d: number): V3 => {
  const n = cross(T, [0, 0, 1]);
  const l = Math.hypot(...n);
  return add(C, n, d / l);
};

describe('붙잡기 다듬기(refineOnArc — 묶음 좌표)', () => {
  it('수직 발: 곡선 위 점에서 법선으로 비킨 첫 점이면 그 곡선 위 점(원·타원·B-스플라인 1e-9). 둘레 토막에 발이 없으면 null', () => {
    const cases: [CurveEnd, (t: number) => V3, (t: number) => V3][] = [
      [rimEnd, rimAt, (t) => [-Math.sin(t + Math.PI / 6), Math.cos(t + Math.PI / 6), 0]],
      [ellEnd, ellAt, ellTangent],
      [bsEnd, bsAt, bsTangentAt],
    ];
    const ray = { origin: [0, 0, 0], dir: [0, 0, 1] };
    for (const [end, C, T] of cases) {
      const { arc, local, world } = arcOf(end);
      const k = Math.floor(arc.n / 2);
      const tq = 0.3 * arc.param(k) + 0.7 * arc.param(k + 1);
      const F = offNormal(C(tq), T(tq), 1);
      // 코어 점: 현 위 아무 데(그 토막의 0.5)
      const core = local(world(arc.vertex(k)).map((v, i) => 0.5 * (v + world(arc.vertex(k + 1))[i]!)));
      const q = refineOnArc(arc, { kind: 'perpendicular', point: core, k, first: local(F), ray });
      close(world(q!), C(tq));
      expect(Math.abs(dot(sub(F, world(q!)), T(tq)))).toBeLessThan(1e-9);
      // 첫 점이 없으면 null
      expect(refineOnArc(arc, { kind: 'perpendicular', point: core, k, first: null, ray })).toBeNull();
      // 열린 곡선의 먼 토막(앞뒤 두 토막 둘레 밖에 발이 있다)
      if (end !== rimEnd) {
        const far = k >= 6 ? k - 6 : k + 6;
        expect(refineOnArc(arc, { kind: 'perpendicular', point: core, k: far, first: local(F), ray })).toBeNull();
      }
    }
  });

  it('모서리 위 점: 곡선 위 점을 지나는 광선이면 그 점(1e-9), 모서리 끝 밖을 지나면 그 끝', () => {
    const { arc, local, world } = arcOf(ellEnd);
    const k = 3;
    const tq = 0.6 * arc.param(k) + 0.4 * arc.param(k + 1);
    const P = ellAt(tq);
    const dir: V3 = [-0.5, 0.6, -0.62];
    const l = Math.hypot(...dir);
    const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    const q = refineOnArc(arc, { kind: 'onEdge', point: local(P), k, first: null, ray: { origin: local(add(P, d, -40)), dir: d } });
    close(world(q!), P);
    // 시작 꼭짓점 앞(곡선 밖으로 늘인 접선 위)을 지나는 광선: 토막 0이면 그 끝
    const before = add(ellAt(ELL_T0), ellTangent(ELL_T0), -0.4);
    const q0 = refineOnArc(arc, { kind: 'onEdge', point: local(world(arc.vertex(0))), k: 0, first: null, ray: { origin: local(add(before, d, -40)), dir: d } });
    close(world(q0!), ellAt(arc.param(0)), 1e-9);
  });

  it('코어 가운데 점: 토막 두 끝 매개변수의 가운데(원은 그 호의 가운데 — 두 끝에서 같은 거리)', () => {
    const { arc, world } = arcOf(rimEnd);
    const k = 7;
    const q = world(refineOnArc(arc, { kind: 'midpoint', point: [0, 0, 0], k, first: null, ray: { origin: [0, 0, 0], dir: [0, 0, 1] } })!);
    expect(Math.abs(Math.hypot(q[0], q[1]) - RIM_R)).toBeLessThan(1e-12);
    expect(q[2]).toBeCloseTo(RIM_H, 12);
    const a = world(arc.ev(arc.param(k))[0]);
    const b = world(arc.ev(arc.param(k + 1))[0]);
    expect(Math.abs(dist(q, a) - dist(q, b))).toBeLessThan(1e-12);
    expect(refineOnArc(arc, { kind: 'midpoint', point: [0, 0, 0], k: arc.n, first: null, ray: { origin: [0, 0, 0], dir: [0, 0, 1] } })).toBeNull();
  });
});

describe('코어 refine 입력(refineSnap — 세계 좌표)', () => {
  /** 그물 윤곽선 선분 raw의 세계 끝점 둘 */
  const ends = (e: CurveEnd, raw: number): [V3, V3] => {
    const E = e.mesh.edges!;
    return [toWorld(e.mesh, E[raw * 6]!, E[raw * 6 + 1]!, E[raw * 6 + 2]!), toWorld(e.mesh, E[raw * 6 + 3]!, E[raw * 6 + 4]!, E[raw * 6 + 5]!)];
  };
  const input = (e: CurveEnd, raw: number, kind: SnapRefineInput['kind'], point: V3, first: V3 | null, origin: V3, dir: V3): SnapRefineInput => ({
    kind,
    point,
    segment: { kind: 'edge', id: e.mesh.id, index: raw, raw, ends: ends(e, raw) },
    first,
    ray: { origin, dir },
  });

  it('돌린 부품(자리 변환)의 B-스플라인: 광선이 지나는 곡선 위 점·법선으로 비킨 첫 점의 발을 세계 좌표로(1e-9)', () => {
    const { arc } = arcOf(bsEnd);
    const k = 5;
    const raw = bsEnd.table.segStart[bsEnd.edge]! + k;
    const u = 0.5 * (arc.param(k) + arc.param(k + 1)) + 0.1 * (arc.param(k + 1) - arc.param(k));
    const P = bsAt(u);
    const [a, b] = ends(bsEnd, raw);
    const core: V3 = [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])];
    close(refineSnap(input(bsEnd, raw, 'onEdge', core, null, add(P, [0, 0, 1], 30), [0, 0, -1]), byId, ex), P);
    const F = offNormal(P, bsTangentAt(u), -1);
    close(refineSnap(input(bsEnd, raw, 'perpendicular', core, F, [0, 0, 50], [0, 0, -1]), byId, ex), P);
  });

  it('직선 모서리·선 형상 묶음·모르는 그물·토막 끝이 그물과 맞지 않으면 null', () => {
    const t = bsEnd.table;
    const line = Array.from(t.kinds).findIndex((k) => ex.kinds[k] === 'line');
    const raw = t.segStart[line]!;
    const [a] = ends(bsEnd, raw);
    expect(refineSnap(input(bsEnd, raw, 'onEdge', a, null, add(a, [0, 0, 1], 30), [0, 0, -1]), byId, ex)).toBeNull();
    const rawC = t.segStart[bsEnd.edge]! + 2;
    const ok = input(bsEnd, rawC, 'onEdge', ends(bsEnd, rawC)[0], null, add(ends(bsEnd, rawC)[0], [0, 0, 1], 30), [0, 0, -1]);
    expect(refineSnap(ok, byId, ex)).toBeTruthy();
    expect(refineSnap({ ...ok, segment: { ...ok.segment, kind: 'line' } }, byId, ex)).toBeNull();
    expect(refineSnap({ ...ok, segment: { ...ok.segment, id: 'nope' } }, byId, ex)).toBeNull();
    expect(refineSnap({ ...ok, segment: { ...ok.segment, ends: [add(ok.segment.ends[0], [0, 0, 1e-3]), ok.segment.ends[1]] } }, byId, ex)).toBeNull();
  });
});

describe('곡선 길이 가운데 점과 곡선까지 거리', () => {
  it('원호(반원)는 각 가운데, 타원·B-스플라인은 길이 적분 가운데 — 곡선 위(1e-9)이고 두 쪽 호 길이가 같다', () => {
    // 반원: (10,0,0) → (−10,0,0) 위쪽(+y)으로 도는 반지름 10
    const w = new StepText();
    const mm = w.context('mm');
    const A = w.vertex([10, 0, 0]);
    const B = w.vertex([-10, 0, 0]);
    const arcE = w.edge(B, A, w.circle([0, 0, 0], 10), false);
    const dia = w.edge(A, B, w.line([10, 0, 0], [-10, 0, 0]));
    const face = w.face([w.bound(w.loop([w.oe(dia, true), w.oe(arcE, true)]))], w.plane([0, 0, 0], [0, 0, -1]));
    w.product('half-disc', [w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`)], mm, 'SHAPE_REPRESENTATION');
    const disc = stepToScene(w.bytes());
    const dx = stepEdgeIndex(disc)!;
    const de = curveEndsAt(disc.meshes, dx, [10, 0, 0])[0]!;
    close(curveMidpoint(de.mesh, de.table, de.edge, dx.kinds), [0, 10, 0], 1e-12);

    // 타원: 심프슨 적분(시험이 따로)과 같은 길이 가운데
    const speedE = (t: number): number => Math.hypot(12 * Math.sin(t), 6 * Math.cos(t));
    const simpson = (f: (t: number) => number, a: number, b: number, n = 4000): number => {
      const h = (b - a) / n;
      let s = f(a) + f(b);
      for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
      return (s * h) / 3;
    };
    const me = curveMidpoint(ellEnd.mesh, ellEnd.table, ellEnd.edge, ex.kinds)!;
    const te = footParam(ellAt, ellTangent, me, ELL_T0, ELL_T1);
    expect(dist(ellAt(te), me)).toBeLessThan(1e-9);
    expect(Math.abs(simpson(speedE, ELL_T0, te) - simpson(speedE, te, ELL_T1))).toBeLessThan(1e-6);

    // B-스플라인(3차 베지어): 같은 방법
    const bp = [
      [0, 0],
      [2, 6],
      [9, 7],
      [12, 0],
    ];
    const speedB = (u: number): number => {
      const d = [(1 - u) ** 2, 2 * u * (1 - u), u * u];
      return Math.hypot(...[0, 1].map((k) => 3 * d.reduce((s, w2, i) => s + w2 * (bp[i + 1]![k]! - bp[i]![k]!), 0)));
    };
    const mb = curveMidpoint(bsEnd.mesh, bsEnd.table, bsEnd.edge, ex.kinds)!;
    const ub = footParam(bsAt, bsTangentAt, mb, 0, 1);
    expect(dist(bsAt(ub), mb)).toBeLessThan(1e-9);
    expect(Math.abs(simpson(speedB, 0, ub) - simpson(speedB, ub, 1))).toBeLessThan(1e-9);
    // 해석기가 모서리 표에 적분해 실은 길이와 같은 곡선
    expect(simpson(speedB, 0, 1)).toBeCloseTo(bsEnd.table.length[bsEnd.edge]!, 7);
  });

  it('curveDistance: 원 위 점은 0, 반지름 쪽으로 1e-3 비킨 점은 1e-3(세계 단위), 돌린 부품의 B-스플라인도', () => {
    const { arc } = arcOf(rimEnd);
    const k = 4;
    const p = rimAt(0.7 * arc.param(k) + 0.3 * arc.param(k + 1));
    expect(Math.abs(Math.hypot(p[0], p[1]) - RIM_R)).toBeLessThan(1e-12);
    expect(curveDistance(rimEnd.mesh, rimEnd.table, rimEnd.edge, ex.kinds, p, k)).toBeLessThan(1e-12);
    const off: V3 = [p[0] * (1 + 1e-4), p[1] * (1 + 1e-4), p[2]];
    expect(curveDistance(rimEnd.mesh, rimEnd.table, rimEnd.edge, ex.kinds, off, k)).toBeCloseTo(1e-3, 9);
    // B-스플라인 판 평면에서 0.25 띄운 점(판 좌표 z = 세계 z)
    const b = arcOf(bsEnd).arc;
    let kb = 0;
    while (kb + 1 < b.n && b.param(kb + 1) <= 0.4) kb++;
    const q = add(bsAt(0.4), [0, 0, 0.25]);
    expect(curveDistance(bsEnd.mesh, bsEnd.table, bsEnd.edge, ex.kinds, q, kb)).toBeCloseTo(0.25, 9);
  });
});

describe('곡선 계산(edgecurve.ts): 근 찾기·곡선 길이 가운데', () => {
  it('rtsafe: g가 음수인 쪽을 lo로 주면 구간 방향과 상관없이 근', () => {
    const gh = (t: number): [number, number] => [t * t - 2, 2 * t];
    expect(rtsafe(gh, 0, 3)).toBeCloseTo(Math.SQRT2, 15);
    const g2 = (t: number): [number, number] => [2 - t * t, -2 * t];
    expect(rtsafe(g2, 3, 0)).toBeCloseTo(Math.SQRT2, 15);
  });

  it('arcMidParam·arcCuts: 원은 매개변수 가운데, 타원은 납작할수록 잘게 나눈다', () => {
    const c = ellipseEval({ center: [0, 0, 0], normal: [0, 0, 1], x: [1, 0, 0], a: 3, b: 3 })!;
    expect(arcMidParam(c.ev, arcCuts({ kind: 'circle', center: [0, 0, 0], normal: [0, 0, 1], r: 3 }, 0.2, 2.6))).toBeCloseTo(1.4, 13);
    const flat: EllipseDef = { kind: 'ellipse', center: [0, 0, 0], normal: [0, 0, 1], x: [1, 0, 0], a: 10, b: 0.1 };
    expect(arcCuts(flat, 0, 2 * Math.PI).length - 1).toBe(800);
    expect(arcCuts({ ...flat, b: 10 }, 0, Math.PI).length - 1).toBe(8);
    expect(Number.isNaN(arcMidParam(c.ev, [1]))).toBe(true);
  });
});
