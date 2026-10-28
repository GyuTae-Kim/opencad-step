/**
 * 곡선 모서리 끝의 접선(해석기 모서리 표 tangents — brep.ts, 화면 쪽 찾기·고르기 — app/tangent.ts): 원기둥 윗 테두리 원(한 바퀴),
 * 타원 호, 3차 B-스플라인(자리 변환을 거친 부품), 거꾸로 쓴 원호(same_sense .F.)에서 B-rep 곡선의 해석적 접선과 맞는지 본다.
 * 화면용 꺾은선 첫 토막(현)의 방향과는 다르다는 것도 수치로 보인다.
 */
import { describe, expect, it } from 'vitest';
import { EDGE_TANGENTS, stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import {
  approxTangent,
  curveEndsAt,
  curvesThrough,
  curveTangentAt,
  curveTangentPick,
  curveTangentThrough,
  endPolyline,
  endTangent,
  pointTol,
  polylineNearest,
  throughTangent,
  type CurveEnd,
} from '../../src/app/tangent';
import { StepText } from '../stepText';
import {
  bsAt,
  BS_END,
  BS_START,
  BS_T0,
  BS_T1,
  bsTangentAt,
  curveStep,
  ellAt,
  ELL_END,
  ELL_START,
  ELL_T0,
  ELL_T1,
  ellTangent,
  footParam,
  halfway,
  RIM,
  rimChordAt,
  rimTangentAt,
  RIM_TANGENT,
  type V3,
} from './curvescene';

const scene = stepToScene(curveStep());
const ex = stepEdgeIndex(scene)!;
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const neg = (a: readonly number[]): V3 => [-a[0]!, -a[1]!, -a[2]!];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const unit = (v: readonly number[]): V3 => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
/** 두 단위 방향 사이 각(도) */
const angle = (a: readonly number[], b: readonly number[]): number => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;
const close = (a: readonly number[] | null, b: readonly number[], tol = 1e-6): void => {
  expect(a, `방향 ${b}`).not.toBeNull();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const kindOf = (e: Pick<CurveEnd, 'table' | 'edge'>): string => ex.kinds[e.table.kinds[e.edge]!]!;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

describe('해석기: 모서리 표의 곡선 끝 접선(B-rep 곡선 도함수)', () => {
  it('곡선 모서리마다 시작·끝 접선(모서리 방향, 단위), 직선은 NaN', () => {
    let curved = 0;
    let lines = 0;
    for (const t of ex.tables) {
      expect(t.tangents).toBeInstanceOf(Float32Array);
      expect(t.tangents!.length).toBe(t.kinds.length * EDGE_TANGENTS);
      for (let e = 0; e < t.kinds.length; e++) {
        const v = [...t.tangents!.subarray(e * 6, e * 6 + 6)];
        if (ex.kinds[t.kinds[e]!] === 'line') {
          expect(v.every(Number.isNaN)).toBe(true);
          lines++;
        } else {
          expect(Math.hypot(v[0]!, v[1]!, v[2]!)).toBeCloseTo(1, 6);
          expect(Math.hypot(v[3]!, v[4]!, v[5]!)).toBeCloseTo(1, 6);
          curved++;
        }
      }
    }
    // 원 둘(테두리), 타원 하나, B-스플라인 하나 / 직선: 타원 판 둘, B-스플라인 판 셋(원기둥 이음선은 윤곽선에 없다)
    expect(curved).toBe(4);
    expect(lines).toBe(5);
  });

  it('원기둥 윗 테두리(한 바퀴 원, 이음 꼭짓점 30°): 두 끝이 모두 이음 꼭짓점, 시작은 원이 도는 쪽 접선, 끝에서 안쪽은 그 반대', () => {
    const ends = curveEndsAt(scene.meshes, ex, RIM);
    expect(ends.map((e) => [kindOf(e), e.end])).toEqual([
      ['circle', 0],
      ['circle', 1],
    ]);
    close(endTangent(ends[0]!), RIM_TANGENT);
    close(endTangent(ends[1]!), neg(RIM_TANGENT));
    // 화면용 꺾은선 첫 토막(현)은 접선에서 토막 중심각의 절반만큼 벗어난다
    const poly = endPolyline(ends[0]!);
    const chord = sub(poly[1]!, poly[0]!);
    const half = angle(sub(poly[1]!, [0, 0, 20]), sub(poly[0]!, [0, 0, 20])) / 2;
    expect(half).toBeGreaterThan(1);
    expect(Math.abs(angle(chord, RIM_TANGENT) - half)).toBeLessThan(1e-3);
  });

  it('타원 호: 시작은 t가 커지는 쪽 접선, 끝(t = π)에서 호 안쪽은 t가 줄어드는 쪽', () => {
    const s = curveEndsAt(scene.meshes, ex, ELL_START);
    expect(s.map((e) => [kindOf(e), e.end])).toEqual([['ellipse', 0]]);
    close(endTangent(s[0]!), ellTangent(ELL_T0));
    const e = curveEndsAt(scene.meshes, ex, ELL_END);
    expect(e.map((x) => [kindOf(x), x.end])).toEqual([['ellipse', 1]]);
    close(endTangent(e[0]!), neg(ellTangent(ELL_T1)));
  });

  it('B-스플라인(Z축 90° 돌린 부품): 끝 접선 = 끝 조절점 차(세계로 옮긴 것)', () => {
    const s = curveEndsAt(scene.meshes, ex, BS_START);
    expect(s.map((e) => [kindOf(e), e.end])).toEqual([['bspline', 0]]);
    expect(s[0]!.mesh.matrix).toBeTruthy();
    close(endTangent(s[0]!), BS_T0);
    const e = curveEndsAt(scene.meshes, ex, BS_END);
    expect(e.map((x) => [kindOf(x), x.end])).toEqual([['bspline', 1]]);
    close(endTangent(e[0]!), BS_T1);
  });

  it('거꾸로 쓴 원호(same_sense .F.): 접선은 모서리(꺾은선) 방향을 따른다', () => {
    // (10,0,0) → (−10,0,0) 반원(+y 쪽): 모서리를 B → A로, 원 매개변수와 거꾸로 쓴다
    const w = new StepText();
    const mm = w.context('mm');
    const A = w.vertex([10, 0, 0]);
    const B = w.vertex([-10, 0, 0]);
    const arc = w.edge(B, A, w.circle([0, 0, 0], 10), false);
    const dia = w.edge(A, B, w.line([10, 0, 0], [-10, 0, 0]));
    const face = w.face([w.bound(w.loop([w.oe(dia, true), w.oe(arc, true)]))], w.plane([0, 0, 0], [0, 0, -1]));
    const item = w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
    w.product('half-disc', [item], mm, 'SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    const x = stepEdgeIndex(s)!;
    const atB = curveEndsAt(s.meshes, x, [-10, 0, 0]);
    expect(atB.map((e) => e.end)).toEqual([0]);
    const poly = endPolyline(atB[0]!);
    expect(poly[0]).toEqual([-10, 0, 0]);
    // B에서 호 안쪽(+y), A에서 호 안쪽도 +y
    close(endTangent(atB[0]!), [0, 1, 0]);
    expect(dot(endTangent(atB[0]!)!, sub(poly[1]!, poly[0]!))).toBeGreaterThan(0);
    close(endTangent(curveEndsAt(s.meshes, x, [10, 0, 0])[0]!), [0, 1, 0]);
  });
});

describe('화면: 첫 점에 닿는 곡선 끝 찾기·커서 아래 점의 접선 고르기', () => {
  it('커서 아래 점이 그 곡선의 꺾은선 위(꼭짓점·토막 위·다른 끝)면 접선, 곡선 밖·첫 점 자리면 null', () => {
    const ends = curveEndsAt(scene.meshes, ex, BS_START);
    const poly = endPolyline(ends[0]!);
    close(curveTangentAt(ends, BS_START, poly[1]!), BS_T0);
    const m: V3 = [(poly[2]![0] + poly[3]![0]) / 2, (poly[2]![1] + poly[3]![1]) / 2, (poly[2]![2] + poly[3]![2]) / 2];
    close(curveTangentAt(ends, BS_START, m), BS_T0);
    close(curveTangentAt(ends, BS_START, BS_END), BS_T0);
    expect(curveTangentAt(ends, BS_START, BS_START)).toBeNull();
    expect(curveTangentAt(ends, BS_START, [BS_END[0] + 1, BS_END[1], BS_END[2]])).toBeNull();
    expect(curveTangentAt([], BS_START, poly[1]!)).toBeNull();
  });

  it('한 바퀴 원: 커서 아래 점이 꺾은선 길이로 앞 절반이면 원이 도는 쪽, 뒤 절반이면 거꾸로', () => {
    const ends = curveEndsAt(scene.meshes, ex, RIM);
    const poly = endPolyline(ends[0]!);
    const n = poly.length - 1;
    close(curveTangentAt(ends, RIM, poly[1]!), RIM_TANGENT);
    close(curveTangentAt(ends, RIM, poly[Math.floor(n / 2) - 1]!), RIM_TANGENT);
    close(curveTangentAt(ends, RIM, poly[n - 1]!), neg(RIM_TANGENT));
    close(curveTangentAt(ends, RIM, poly[Math.ceil(n / 2) + 1]!), neg(RIM_TANGENT));
    // 아랫 테두리 점은 이 원 위가 아니다
    expect(curveTangentAt(ends, RIM, [RIM[0], RIM[1], 0])).toBeNull();
    // 고른 끝의 첫 토막(현): 앞 절반이면 이음 꼭짓점 → 다음 꼭짓점, 뒤 절반이면 이음 꼭짓점 → 앞 꼭짓점
    close(curveTangentPick(ends, RIM, poly[2]!)!.chord, unit(sub(poly[1]!, poly[0]!)), 1e-6);
    close(curveTangentPick(ends, RIM, poly[n - 2]!)!.chord, unit(sub(poly[n - 1]!, poly[n]!)), 1e-6);
  });

  it('꺾은선 가장 가까운 점: 거리와 시작부터 길이', () => {
    const r = polylineNearest(
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 3, 0],
      ],
      [5, 1, 0],
    );
    expect(r.dist).toBeCloseTo(1, 12);
    expect(r.s).toBeCloseTo(5, 12);
    expect(r.total).toBeCloseTo(7, 12);
  });

  it('첫 점이 곡선 끝이 아니거나 모서리 표에 접선이 없으면(옛 결과) 빈 목록, 허용치는 좌표 크기에 비례', () => {
    expect(curveEndsAt(scene.meshes, ex, [100, 100, 100])).toEqual([]);
    expect(curveEndsAt(scene.meshes, null, RIM)).toEqual([]);
    const old = { ...ex, tables: ex.tables.map((t) => ({ ...t, tangents: undefined })) };
    expect(curveEndsAt(scene.meshes, old, RIM)).toEqual([]);
    expect(curveEndsAt(scene.meshes, ex, [RIM[0] + 2e-5, RIM[1], RIM[2]])).toHaveLength(2);
    expect(curveEndsAt(scene.meshes, ex, [RIM[0] + 1e-3, RIM[1], RIM[2]])).toEqual([]);
    expect(pointTol([0, 0, 0])).toBe(1e-6);
    expect(pointTol([-2000, 10, 0])).toBeCloseTo(2.001e-3, 12);
  });
});

describe('화면: 곡선 모서리의 끝이 아닌 곳(화면용 꺾은선 위)을 첫 점으로 — 그 점에서의 B-rep 곡선 접선', () => {
  const rimPoly = endPolyline(curveEndsAt(scene.meshes, ex, RIM)[0]!);
  const ellPoly = endPolyline(curveEndsAt(scene.meshes, ex, ELL_START)[0]!);
  const bsPoly = endPolyline(curveEndsAt(scene.meshes, ex, BS_START)[0]!);
  /** 옛 결과처럼 곡선 정의(curveStart·curves)가 없는 모서리 표 */
  const old = { ...ex, tables: ex.tables.map((t) => ({ ...t, curveStart: undefined, curves: undefined })) };
  /** 테두리 원 위 30° 지점(이음 꼭짓점에서 원이 도는 쪽으로)을 그린 꺾은선 위 점 */
  const rim30 = rimChordAt(rimPoly, Math.PI / 6);

  it('지나는 곡선 모서리: 토막 위 점은 그 토막·비율, 안쪽 꼭짓점은 그 번호. 끝·꺾은선 밖·옛 결과(접선 없음)는 없다', () => {
    const on = curvesThrough(scene.meshes, ex, rim30.point);
    expect(on.map((o) => [kindOf(o), o.seg, o.vertex])).toEqual([['circle', rim30.seg, -1]]);
    expect(on[0]!.f).toBeCloseTo(rim30.f, 6);
    expect(rim30.f).toBeGreaterThan(0.05);
    expect(rim30.f).toBeLessThan(0.95);
    // 시작부터 꺾은선 길이
    let s = 0;
    for (let i = 1; i <= rim30.seg; i++) s += dist(rimPoly[i]!, rimPoly[i - 1]!);
    expect(on[0]!.s).toBeCloseTo(s + rim30.f * dist(rimPoly[rim30.seg + 1]!, rimPoly[rim30.seg]!), 9);
    expect(curvesThrough(scene.meshes, ex, bsPoly[12]!).map((o) => [kindOf(o), o.seg, o.f, o.vertex])).toEqual([['bspline', 12, 0, 12]]);
    // 모서리 끝은 끝 접선(curveEndsAt)이 맡는다 — 한 바퀴 원의 이음 꼭짓점도
    expect(curvesThrough(scene.meshes, ex, RIM)).toEqual([]);
    expect(curvesThrough(scene.meshes, ex, BS_END)).toEqual([]);
    // 원 위 정확한 30° 점(곡선 위로 다듬은 측정 점)은 꺾은선(현)에서 화살 높이만큼 떨어져 있지만 곡선 정의로 잰 거리로 그 모서리 위다
    // (토막·비율은 꺾은선에서 가장 가까운 자리). 원에서 1e-3 비킨 점은 아니다
    const exact30: V3 = [10 * Math.cos(Math.PI / 3), 10 * Math.sin(Math.PI / 3), 20];
    expect(polylineNearest(rimPoly, exact30).dist).toBeGreaterThan(1e-3);
    const on30 = curvesThrough(scene.meshes, ex, exact30);
    expect(on30.map((o) => [kindOf(o), o.seg, o.vertex])).toEqual([['circle', rim30.seg, -1]]);
    expect(on30[0]!.f).toBeCloseTo(rim30.f, 3);
    expect(curvesThrough(scene.meshes, ex, [10.001 * Math.cos(Math.PI / 3), 10.001 * Math.sin(Math.PI / 3), 20])).toEqual([]);
    // 타원 호 위 정확한 점: 곡선 정의가 있으면 그 모서리, 없으면(옛 결과) 꺾은선 거리만이라 아니다
    const ellExact = ellAt(0.5 * (ELL_T0 + ELL_T1) + 0.01);
    expect(polylineNearest(ellPoly, ellExact).dist).toBeGreaterThan(4 * pointTol(ellExact));
    expect(curvesThrough(scene.meshes, ex, ellExact).map(kindOf)).toEqual(['ellipse']);
    expect(curvesThrough(scene.meshes, old, ellExact)).toEqual([]);
    expect(curvesThrough(scene.meshes, null, rim30.point)).toEqual([]);
    const noTan = { ...ex, tables: ex.tables.map((t) => ({ ...t, tangents: undefined })) };
    expect(curvesThrough(scene.meshes, noTan, rim30.point)).toEqual([]);
  });

  it('원기둥 테두리 30° 지점(현 위라 원 안쪽으로 비킨 점): 모서리 표 params로 그 각의 원 접선, 방향은 커서 쪽, 현은 그 토막', () => {
    // 꺾은선(현) 위라 원에서 안쪽으로 조금 들어가 있다
    expect(10 - Math.hypot(rim30.point[0], rim30.point[1])).toBeGreaterThan(1e-3);
    const on = curvesThrough(scene.meshes, ex, rim30.point);
    const t = throughTangent(on[0]!, ex.kinds)!;
    expect(t.exact).toBe(true);
    close(t.dir, rimTangentAt(Math.PI / 6), 1e-9);
    // 첫 점이 놓인 토막의 현과는 각이 다르다
    const chord = unit(sub(rimPoly[rim30.seg + 1]!, rimPoly[rim30.seg]!));
    expect(angle(chord, t.dir)).toBeGreaterThan(1);
    // 커서가 원이 도는 쪽 앞이면 그 방향, 이음 꼭짓점 쪽 뒤면 반대
    const ahead = curveTangentThrough(on, rim30.point, rimPoly[rim30.seg + 3]!, ex.kinds)!;
    close(ahead.dir, rimTangentAt(Math.PI / 6), 1e-9);
    expect(ahead.exact).toBe(true);
    expect(ahead.chords).toHaveLength(1);
    close(ahead.chord, chord, 1e-9);
    close(curveTangentThrough(on, rim30.point, rimPoly[1]!, ex.kinds)!.dir, neg(rimTangentAt(Math.PI / 6)), 1e-9);
    // 커서가 다른 곡선 위·첫 점 자리면 없다
    expect(curveTangentThrough(on, rim30.point, ELL_END, ex.kinds)).toBeNull();
    expect(curveTangentThrough(on, rim30.point, rim30.point, ex.kinds)).toBeNull();
    expect(curveTangentThrough([], rim30.point, rimPoly[1]!, ex.kinds)).toBeNull();
  });

  it('타원 호 가운데(꺾은선 길이 반): 곡선 정의(틀 x축)로 가장 가까운 매개변수의 접선, 정의가 없으면(옛 결과) 꺾은선 어림', () => {
    const m = halfway(ellPoly);
    const on = curvesThrough(scene.meshes, ex, m);
    expect(on.map(kindOf)).toEqual(['ellipse']);
    const t = throughTangent(on[0]!, ex.kinds)!;
    expect(t.exact).toBe(true);
    const tm = footParam(ellAt, ellTangent, m, ELL_T0, ELL_T1);
    expect(tm).toBeGreaterThan(ELL_T0);
    expect(tm).toBeLessThan(ELL_T1);
    close(t.dir, ellTangent(tm), 1e-9);
    // 커서가 호의 끝(t = π) 쪽이면 t가 커지는 쪽, 시작 쪽이면 반대
    close(curveTangentThrough(on, m, ELL_END, ex.kinds)!.dir, ellTangent(tm), 1e-9);
    close(curveTangentThrough(on, m, ELL_START, ex.kinds)!.dir, neg(ellTangent(tm)), 1e-9);
    // 옛 결과: 곡선 정의가 없어 이웃 꼭짓점 접선(2차 어림)을 섞는다 — 정확하지 않지만 0.5° 안
    const o = curvesThrough(scene.meshes, old, m);
    const a = throughTangent(o[0]!, old.kinds)!;
    expect(a.exact).toBe(false);
    expect(angle(a.dir, ellTangent(tm))).toBeLessThan(0.5);
    expect(angle(a.dir, ellTangent(tm))).toBeGreaterThan(1e-3);
  });

  it('B-스플라인(돌린 부품) 가운데 꼭짓점: 곡선 정의로 뉴턴, 꼭짓점의 현은 이웃 두 토막, 꺾은선 어림(2차)도 현보다 접선에 가깝다', () => {
    const k = 12;
    const p = bsPoly[k]!;
    const on = curvesThrough(scene.meshes, ex, p);
    expect(on[0]!.mesh.matrix).toBeTruthy();
    const t = throughTangent(on[0]!, ex.kinds)!;
    expect(t.exact).toBe(true);
    const u = footParam(bsAt, bsTangentAt, p, 0, 1);
    close(t.dir, bsTangentAt(u), 1e-9);
    const pick = curveTangentThrough(on, p, BS_END, ex.kinds)!;
    close(pick.dir, bsTangentAt(u), 1e-9);
    expect(pick.chords).toHaveLength(2);
    close(pick.chords[0]!, unit(sub(bsPoly[k]!, bsPoly[k - 1]!)), 1e-9);
    close(pick.chords[1]!, unit(sub(bsPoly[k + 1]!, bsPoly[k]!)), 1e-9);
    close(curveTangentThrough(on, p, BS_START, ex.kinds)!.dir, neg(bsTangentAt(u)), 1e-9);
    // 정의가 없을 때의 어림: 안쪽 꼭짓점은 이웃 두 토막 길이로 2차 어림
    const a = approxTangent(on[0]!)!;
    expect(angle(a, bsTangentAt(u))).toBeLessThan(0.05);
    expect(angle(a, bsTangentAt(u))).toBeLessThan(angle(pick.chords[1]!, bsTangentAt(u)) / 10);
    // 원 테두리 안쪽 꼭짓점의 어림은 대칭이라 정확한 접선과 같다
    const r = curvesThrough(scene.meshes, ex, rimPoly[7]!);
    expect(angle(approxTangent(r[0]!)!, throughTangent(r[0]!, ex.kinds)!.dir)).toBeLessThan(1e-4);
  });
});
