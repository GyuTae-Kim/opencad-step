import { describe, expect, it } from 'vitest';
import type { Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { perpendicularFoot } from 'opencad-viewer3d/inference';
import { measureResult } from 'opencad-viewer3d/snap';
import { circleCenters, edgeSnapPoints, hoverSnapLabel, measureSnapOptions, snapLabel, snapPair } from '../../src/app/snap';
import { StepText, plateWithHole } from '../stepText';

const near = (a: readonly number[], b: readonly number[], d = 6) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, d));

/** 반원 호 모서리 하나(반지름 2, 중심 (10, 5, 0))와 그 지름 선분으로 된 반달 면 */
function halfMoon(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const A = w.vertex([12, 5, 0]);
  const B = w.vertex([8, 5, 0]);
  const arc = w.edge(A, B, w.circle([10, 5, 0], 2));
  const chord = w.edge(B, A, w.line([8, 5, 0], [12, 5, 0]));
  const face = w.face([w.bound(w.loop([w.oe(arc, true), w.oe(chord, true)]))], w.plane([0, 0, 0]));
  const shell = w.add('OPEN_SHELL', `'',(#${face})`);
  w.product('moon', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
  return w.bytes();
}

describe('두 점 측정 붙잡기 점(코어 0.8.0 setMeasureSnap)', () => {
  it('circleCenters: 구멍 위아래 원의 중심을 그물 id와 함께, 자리 변환(matrix)을 반영한 세계 좌표로', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('plate', [plateWithHole(w)], ctx);
    const g1 = w.ax2([0, 0, 0]);
    const g2 = w.ax2([100, 0, 0], [0, 0, 1], [0, 1, 0]); // 90° 돌려 x로 100 옮김
    const root = w.product('asm', [g1, g2], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, g1, 'a');
    w.place(root, part, g2, 'b');
    const s = stepToScene(w.bytes());
    const ex = stepEdgeIndex(s);
    const pts = circleCenters(s.meshes, ex);
    expect(pts).toHaveLength(4);
    expect(pts.every((p) => p.kind === 'center')).toBe(true);
    const [m1, m2] = s.meshes;
    const of = (id: string) => pts.filter((p) => p.id === id).map((p) => p.point);
    // 첫 자리: (10, 5, 0)·(10, 5, 2)
    const a = of(m1!.id).sort((x, y) => x[2]! - y[2]!);
    near(a[0]!, [10, 5, 0]);
    near(a[1]!, [10, 5, 2]);
    // 둘째 자리: x축 → y축(90°)이라 (10, 5) → (100 − 5, 10)
    const b = of(m2!.id).sort((x, y) => x[2]! - y[2]!);
    near(b[0]!, [95, 10, 0]);
    near(b[1]!, [95, 10, 2]);
    // 상한
    expect(circleCenters(s.meshes, ex, 3)).toHaveLength(3);
    expect(circleCenters(s.meshes, null)).toEqual([]);
  });

  it('반으로 나뉜 원호 둘(같은 중심)은 중심 하나', () => {
    const w = new StepText();
    const ctx = w.context();
    const A = w.vertex([2, 0, 0]);
    const B = w.vertex([-2, 0, 0]);
    const c = w.circle([0, 0, 0], 2);
    const e1 = w.edge(A, B, c);
    const e2 = w.edge(B, A, c);
    const face = w.face([w.bound(w.loop([w.oe(e1, true), w.oe(e2, true)]))], w.plane([0, 0, 0]));
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('disc', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    const pts = circleCenters(s.meshes, stepEdgeIndex(s));
    expect(pts).toHaveLength(1);
    near(pts[0]!.point, [0, 0, 0]);
  });

  it('edgeSnapPoints: 원호 모서리는 끝점 둘·곡선 가운데 점·중심, 직선 모서리는 끝점·가운데 점', () => {
    const s = stepToScene(halfMoon());
    const ex = stepEdgeIndex(s)!;
    const mesh = s.meshes[0]!;
    const t = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const kinds = Array.from(t.kinds, (k) => ex.kinds[k]);
    const arcE = kinds.indexOf('circle');
    const lineE = kinds.indexOf('line');
    const pick = (e: number): Pick3d => ({ kind: 'edge', id: mesh.id, index: t.segStart[e]!, point: [0, 0, 0] }) as unknown as Pick3d;
    const arc = edgeSnapPoints(pick(arcE), s.meshes, ex)!;
    expect(arc.map((p) => p.kind)).toEqual(['endpoint', 'endpoint', 'midpoint', 'center']);
    near(arc[3]!.point, [10, 5, 0]);
    // 곡선 길이 가운데 점은 원 위(반지름 2)이고 호의 가운데(위쪽 (10, 7, 0) — 반시계 0 → 180°)
    near(arc[2]!.point, [10, 7, 0], 2);
    expect(Math.hypot(arc[2]!.point[0]! - 10, arc[2]!.point[1]! - 5)).toBeCloseTo(2, 2);
    const line = edgeSnapPoints(pick(lineE), new Map(s.meshes.map((m) => [m.id, m] as const)), ex)!;
    expect(line.map((p) => p.kind)).toEqual(['endpoint', 'endpoint', 'midpoint']);
    near(line[2]!.point, [10, 5, 0]);
    // 윤곽선이 아니거나 표가 없으면 null
    expect(edgeSnapPoints({ ...pick(arcE), kind: 'mesh' } as Pick3d, s.meshes, ex)).toBeNull();
    expect(edgeSnapPoints(pick(arcE), s.meshes, null)).toBeNull();
  });

  it('snapLabel·snapPair: 붙잡은 종류 이름, 붙잡기를 켜지 않았거나 둘 다 자유 점이면 null', () => {
    expect(['vertex', 'endpoint', 'midpoint', 'center', 'point', null].map((k) => snapLabel(k as never))).toEqual(['꼭짓점', '끝점', '가운데 점', '중심', '붙잡은 점', '면 위 점']);
    expect(snapPair({})).toBeNull();
    expect(snapPair({ snapA: null, snapB: null })).toBeNull();
    expect(snapPair({ snapA: 'center', snapB: null })).toEqual(['중심', '면 위 점']);
    expect(snapPair({ snapA: 'midpoint', snapB: 'endpoint' })).toEqual(['가운데 점', '끝점']);
  });

  it('추론 붙잡기 이름(코어 0.9.0): 교차점·수직 발·축 방향 — 결과의 축은 코어 0.9.1 axisA·axisB에서', () => {
    expect(snapLabel('intersection')).toBe('교차점');
    expect(snapLabel('perpendicular')).toBe('수직 발');
    expect(snapLabel('axis', 'y')).toBe('Y축 방향');
    expect(snapLabel('axis')).toBe('축 방향');
    // 코어가 만든 결과(measureResult — onMeasure·측정 글 꼴이 받는 값): 축 붙잡기면 axisB가 실린다
    const r = measureResult([1, 2, 3], [1, 27, 3], [{ kind: 'vertex' }, { kind: 'axis', axis: 'y' }]);
    expect(r.axisB).toBe('y');
    expect(snapPair(r)).toEqual(['꼭짓점', 'Y축 방향']);
    // 축은 결과에 실린 값을 그대로 쓴다(dx·dy·dz로 짐작하지 않는다)
    const odd = { ...measureResult([0, 0, 0], [5, 0, 0], [{ kind: 'vertex' }, { kind: 'axis', axis: 'z' }]) };
    expect(snapPair(odd)).toEqual(['꼭짓점', 'Z축 방향']);
    expect(snapPair({ snapA: 'axis', snapB: 'center', axisA: 'x' })).toEqual(['X축 방향', '중심']);
    // 축을 모르면(추론 없이 만든 결과 등) 이름만
    expect(snapPair({ snapA: 'vertex', snapB: 'axis' })).toEqual(['꼭짓점', '축 방향']);
    expect(snapPair(measureResult([0, 0, 0], [3, 4, 0], [{ kind: 'center' }, { kind: 'perpendicular' }]))).toEqual(['중심', '수직 발']);
    // 커서 아래(measureHoverSnap): 없으면 null, 모형 위 자유 점이면 '면 위 점', 축이면 그 축
    expect(hoverSnapLabel(null)).toBeNull();
    expect(hoverSnapLabel({ snap: null })).toBe('면 위 점');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x' })).toBe('X축 방향');
    expect(hoverSnapLabel({ snap: 'intersection' })).toBe('교차점');
  });

  it('measureSnapOptions: 측정 중 윤곽선 고르기·원 중심·추론 붙잡기를 켜고, 같은 모서리는 한 번만 구한다', () => {
    const s = stepToScene(halfMoon());
    const ex = stepEdgeIndex(s)!;
    const centers = circleCenters(s.meshes, ex);
    const o = measureSnapOptions(s.meshes, ex, centers);
    expect(o.edges).toBe(true);
    expect(o.inference).toBe(true);
    expect(o.midpoints).toBeUndefined();
    expect(o.points).toBe(centers);
    const mesh = s.meshes[0]!;
    const t = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const pick = { kind: 'edge', id: mesh.id, index: t.segStart[0]!, point: [0, 0, 0] } as unknown as Pick3d;
    const a = o.pointsFor!(pick);
    expect(a?.length).toBeGreaterThan(0);
    expect(o.pointsFor!({ ...pick })).toBe(a); // 같은 모서리: 앞서 구한 배열 그대로(마우스 이동마다 다시 구하지 않음)
    expect(o.pointsFor!({ ...pick, kind: 'mesh' } as Pick3d)).toBeNull();
  });

  it('구멍 중심에서 판 모서리로 내린 수직 발(코어 perpendicularFoot)이 B-rep 모서리 위 — STEP 윤곽선이 추론 붙잡기의 선분이 된다', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('plate', [plateWithHole(w)], ctx);
    const s = stepToScene(w.bytes());
    const ex = stepEdgeIndex(s)!;
    const mesh = s.meshes[0]!;
    const c = circleCenters(s.meshes, ex).map((p) => p.point).sort((x, y) => x[2]! - y[2]!)[0]!;
    const E = mesh.edges!;
    const feet: number[][] = [];
    for (let i = 0; i + 5 < E.length; i += 6) {
      const a = [E[i]!, E[i + 1]!, E[i + 2]!];
      const b = [E[i + 3]!, E[i + 4]!, E[i + 5]!];
      // 바닥(z = 0)의 판 테두리 변만(구멍 원의 꺾은선 토막은 짧다)
      if (Math.abs(a[2]!) > 1e-9 || Math.abs(b[2]!) > 1e-9 || Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) < 5) continue;
      const f = perpendicularFoot(c, a, b, 1e-6);
      if (f) feet.push(f);
    }
    // 판 테두리 네 변 모두에 발이 있고, 발에서 중심까지의 선은 그 변에 수직(중심 (10, 5, 0)에서 x·y 한쪽만 다르다)
    expect(feet).toHaveLength(4);
    for (const f of feet) expect(Math.abs(f[0]! - c[0]!) < 1e-6 || Math.abs(f[1]! - c[1]!) < 1e-6).toBe(true);
  });
});
