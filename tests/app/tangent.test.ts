/**
 * 곡선 모서리 끝의 접선(해석기 모서리 표 tangents — brep.ts, 화면 쪽 찾기·고르기 — app/tangent.ts): 원기둥 윗 테두리 원(한 바퀴),
 * 타원 호, 3차 B-스플라인(자리 변환을 거친 부품), 거꾸로 쓴 원호(same_sense .F.)에서 B-rep 곡선의 해석적 접선과 맞는지 본다.
 * 화면용 꺾은선 첫 토막(현)의 방향과는 다르다는 것도 수치로 보인다.
 */
import { describe, expect, it } from 'vitest';
import { EDGE_TANGENTS, stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { curveEndsAt, curveTangentAt, curveTangentPick, endPolyline, endTangent, pointTol, polylineNearest, type CurveEnd } from '../../src/app/tangent';
import { StepText } from '../stepText';
import { BS_END, BS_START, BS_T0, BS_T1, curveStep, ELL_END, ELL_START, ELL_T0, ELL_T1, ellTangent, RIM, RIM_TANGENT, type V3 } from './curvescene';

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
const kindOf = (e: CurveEnd): string => ex.kinds[e.table.kinds[e.edge]!]!;

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
