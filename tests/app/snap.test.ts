import { describe, expect, it } from 'vitest';
import type { Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { perpendicularFoot } from 'opencad-viewer3d/inference';
import { measureResult } from 'opencad-viewer3d/snap';
import { curveSnap } from '../../src/app/curvesnap';
import {
  arrowLock,
  circleCenters,
  CURVE_POINT_LABEL,
  edgeSnapPoints,
  hoverSnapLabel,
  lockHint,
  lockName,
  type LockViewer,
  MEASURE_INFERENCE,
  measureSnapOptions,
  snapLabel,
  snapPair,
  TANGENT_LABEL,
  type TangentHint,
  trackMark,
  viewerLockHint,
  viewerLockName,
} from '../../src/app/snap';
import { translate } from '../../site/i18n.mjs';
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
    // 곡선 계산 조각(curveSnap)을 받은 뒤: 곡선 가운데 점은 원 위 정확한 호 가운데, 직선 가운데 점·끝점·중심은 그대로
    const cs = curveSnap(s.meshes, ex)!;
    const arc2 = edgeSnapPoints(pick(arcE), s.meshes, ex, cs)!;
    expect(arc2.map((p) => p.kind)).toEqual(['endpoint', 'endpoint', 'midpoint', 'center']);
    near(arc2[2]!.point, [10, 7, 0], 12);
    expect(Math.abs(Math.hypot(arc2[2]!.point[0]! - 10, arc2[2]!.point[1]! - 5) - 2)).toBeLessThan(1e-12);
    expect(arc2[0]!.point).toEqual(arc[0]!.point);
    expect(edgeSnapPoints(pick(lineE), s.meshes, ex, cs)![2]!.point).toEqual(line[2]!.point);
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

  it('끌어온 축(코어 0.16.0 track): 끌어온 점이 있고 첫 점 축 방향이 없으면 "끌어온 점에서 Z축", 첫 점 축 위 나란한 자리는 그 축 방향', () => {
    expect(snapLabel('axis', 'z', false, true)).toBe('끌어온 점에서 Z축');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'z', trackFrom: [1, 2, 3] })).toBe('끌어온 점에서 Z축');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x', trackFrom: [1, 2, 3], direction: [1, 0, 0] })).toBe('X축 방향');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'y', trackFrom: [1, 2, 3], locked: true, direction: [0, 1, 0] })).toBe('Y축 방향 · 잠금');
    // 결과(코어 결과에는 끌어온 점이 없어 앱이 찍은 점 measurePoints의 trackFrom으로 trackA·trackB를 담는다)
    expect(snapPair({ snapA: 'axis', axisA: 'y', snapB: 'axis', axisB: 'z', trackA: true, trackB: true })).toEqual(['끌어온 점에서 Y축', '끌어온 점에서 Z축']);
    expect(snapPair({ snapA: 'vertex', snapB: 'axis', axisB: 'x' })).toEqual(['꼭짓점', 'X축 방향']);
  });

  it('끌어온 축끼리의 교차·모서리 위(코어 0.17.0): 가르는 차례 trackOther → segment → direction, 이름 9개가 네 언어 사전에 있다', () => {
    expect(trackMark({ trackFrom: [0, 0, 0] })).toBe(true);
    expect(trackMark({ trackFrom: [0, 0, 0], trackOther: { axis: 'x' } })).toBe('x');
    expect(trackMark({ trackFrom: [0, 0, 0], segment: { kind: 'line' } })).toBe('edge');
    // 축끼리의 교차·모서리 위는 첫 점 축 위이기도 해(direction) 그 이름이 먼저, 첫 점 축 위 나란한 자리는 끌어온 축이 아니다
    expect(trackMark({ trackFrom: [0, 0, 0], trackOther: { axis: 'z' }, direction: [1, 0, 0] })).toBe('z');
    expect(trackMark({ trackFrom: [0, 0, 0], segment: {}, direction: [1, 0, 0] })).toBe('edge');
    expect(trackMark({ trackFrom: [0, 0, 0], direction: [1, 0, 0] })).toBe(false);
    // 끌어온 점 없이 선분이 실린 축 위 점은 0.18.0부터 첫 점 축과 모서리의 교차(아래 시험)
    expect(trackMark({ direction: [1, 0, 0] })).toBe(false);
    expect(hoverSnapLabel({ snap: 'axis', axis: 'y', trackFrom: [1, 2, 3], trackOther: { axis: 'x' } })).toBe('끌어온 Y축과 X축의 교차');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x', trackFrom: [1, 2, 3], segment: { kind: 'line' } })).toBe('끌어온 점에서 X축 · 모서리 위');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'z', trackFrom: [1, 2, 3], segment: {}, direction: [0, 0, 1], locked: true })).toBe('끌어온 점에서 Z축 · 모서리 위 · 잠금');
    // 끝점 같은 다른 종류에 실린 선분 식별자(0.16.0)는 끌어온 축 이름이 아니다
    expect(hoverSnapLabel({ snap: 'endpoint', trackFrom: [1, 2, 3], segment: {} })).toBe('끝점');
    expect(snapPair({ snapA: 'axis', axisA: 'y', trackA: 'x', snapB: 'axis', axisB: 'x', trackB: 'edge' })).toEqual(['끌어온 Y축과 X축의 교차', '끌어온 점에서 X축 · 모서리 위']);
    const labels: string[] = [];
    for (const a of ['x', 'y', 'z'] as const) {
      labels.push(snapLabel('axis', a, false, 'edge'));
      for (const b of ['x', 'y', 'z'] as const) if (a !== b) labels.push(snapLabel('axis', a, false, b));
    }
    expect(new Set(labels).size).toBe(9);
    for (const code of ['en', 'ja', 'zh-CN', 'de'])
      for (const l of [...labels, '끌어온 점에서 X축 · 모서리 위 · 잠금', '끌어온 Z축과 Y축의 교차 · 잠금']) {
        expect(translate(l, code), `${code}: ${l}`).not.toMatch(/[가-힣]/);
      }
    expect(translate('끌어온 Y축과 X축의 교차', 'en')).toBe('Intersection of tracked Y and X axes');
    expect(translate('끌어온 점에서 X축 · 모서리 위 · 잠금', 'de')).toBe('X-Achse vom verfolgten Punkt · Auf Kante · Gesperrt');
  });

  it('첫 점 축과 모서리·축과 면(코어 0.18.0): trackFrom 없이 segment면 "X축 · 모서리 위", face면 "X축 · 면 위", 끌어온 축의 면은 "끌어온 점에서 X축 · 면 위"', () => {
    // 가르는 차례(코어 README): trackOther → face → segment → 끌어온 점 그대로 → 첫 점 축 방향
    expect(trackMark({ segment: {} })).toBe('axisEdge');
    expect(trackMark({ segment: {}, direction: [1, 0, 0] })).toBe('axisEdge');
    expect(trackMark({ face: {}, direction: [0, 1, 0] })).toBe('axisFace');
    expect(trackMark({ trackFrom: [0, 0, 0], face: {} })).toBe('face');
    expect(trackMark({ trackFrom: [0, 0, 0], face: {}, direction: [0, 0, 1] })).toBe('face');
    expect(trackMark({ trackFrom: [0, 0, 0], trackOther: { axis: 'y' }, face: {} })).toBe('y');
    expect(trackMark(null)).toBe(false);
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x', direction: [1, 0, 0], segment: { kind: 'edge' } })).toBe('X축 · 모서리 위');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'y', direction: [0, 1, 0], segment: { kind: 'edge' }, refined: true })).toBe('Y축 · 모서리 위');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'z', direction: [0, 0, 1], face: { id: 'm', index: 0, normal: [0, 0, 1] } })).toBe('Z축 · 면 위');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x', trackFrom: [1, 2, 3], face: { id: 'm', index: 0, normal: [1, 0, 0] } })).toBe('끌어온 점에서 X축 · 면 위');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'x', direction: [1, 0, 0] })).toBe('X축 방향');
    // 찍은 결과(코어 결과에는 선분·면이 없어 찍은 점 measurePoints에서 가른다)
    expect(snapPair({ snapA: 'endpoint', snapB: 'axis', axisB: 'y', trackB: 'axisEdge' })).toEqual(['끝점', 'Y축 · 모서리 위']);
    expect(snapPair({ snapA: 'vertex', snapB: 'axis', axisB: 'z', trackB: 'axisFace', lockedB: true })).toEqual(['꼭짓점', 'Z축 · 면 위 · 잠금']);
    const labels: string[] = [];
    for (const a of ['x', 'y', 'z'] as const) for (const t of ['axisEdge', 'axisFace', 'face'] as const) labels.push(snapLabel('axis', a, false, t));
    expect(new Set(labels).size).toBe(9);
    for (const code of ['en', 'ja', 'zh-CN', 'de'])
      for (const l of [...labels, 'X축 · 모서리 위 · 잠금', '끌어온 점에서 Y축 · 면 위 · 잠금']) expect(translate(l, code), `${code}: ${l}`).not.toMatch(/[가-힣]/);
    expect(translate('X축 · 모서리 위', 'en')).toBe('X axis · On edge');
    expect(translate('Z축 · 면 위 · 잠금', 'ja')).toBe('Z 軸 · 面上 · ロック');
    expect(translate('끌어온 점에서 Y축 · 면 위', 'zh-CN')).toBe('追踪点的 Y 轴 · 在面上');
    expect(translate('Y축 · 면 위', 'de')).toBe('Y-Achse · Auf Fläche');
  });

  it('곡선 위로 다듬은 점(코어 0.14.0 refined): 붙잡지 않은 점이면 "곡선 위 점", 수직 발은 그대로 "수직 발"', () => {
    expect(CURVE_POINT_LABEL).toBe('곡선 위 점');
    expect(snapLabel(null, undefined, true)).toBe('곡선 위 점');
    expect(hoverSnapLabel({ snap: null, refined: true })).toBe('곡선 위 점');
    expect(hoverSnapLabel({ snap: 'perpendicular', refined: true })).toBe('수직 발');
    // 결과(코어 결과에는 refined가 없어 앱이 찍은 점 measurePoints에서 옮겨 담는다)
    expect(snapPair({ snapA: null, snapB: null, refinedA: true })).toEqual(['곡선 위 점', '면 위 점']);
    expect(snapPair({ snapA: 'endpoint', snapB: null, refinedB: true })).toEqual(['끝점', '곡선 위 점']);
    expect(snapPair({ snapA: 'endpoint', snapB: 'perpendicular', refinedB: true })).toEqual(['끝점', '수직 발']);
    expect(snapPair({ snapA: null, snapB: null })).toBeNull();
  });

  it('measureSnapOptions: 측정 중 윤곽선 고르기·원 중심·추론 붙잡기를 켜고, 같은 모서리는 한 번만 구한다', () => {
    const s = stepToScene(halfMoon());
    const ex = stepEdgeIndex(s)!;
    const centers = circleCenters(s.meshes, ex);
    const o = measureSnapOptions(s.meshes, ex, centers);
    expect(o.edges).toBe(true);
    // 0.9.0 셋에 0.10.0 모서리와 나란히·Shift 잠금, 0.16.0 끌어온 축, 0.18.0 첫 점 축과 모서리·축과 면
    expect(o.inference).toEqual({ intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true });
    expect(o.inference).toBe(MEASURE_INFERENCE);
    expect(o.midpoints).toBeUndefined();
    expect(o.points).toBe(centers);
    const mesh = s.meshes[0]!;
    const t = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const pick = { kind: 'edge', id: mesh.id, index: t.segStart[0]!, point: [0, 0, 0] } as unknown as Pick3d;
    const a = o.pointsFor!(pick);
    expect(a?.length).toBeGreaterThan(0);
    expect(o.pointsFor!({ ...pick })).toBe(a); // 같은 모서리: 앞서 구한 배열 그대로(마우스 이동마다 다시 구하지 않음)
    expect(o.pointsFor!({ ...pick, kind: 'mesh' } as Pick3d)).toBeNull();
    // 곡선 계산 조각을 받기 전에는 다듬기 없음, 받은 뒤에는 refine(곡선 붙잡기에 넘긴다)
    expect('refine' in o).toBe(false);
    const cs = curveSnap(s.meshes, ex)!;
    const seen: unknown[] = [];
    const o2 = measureSnapOptions(s.meshes, ex, centers, { refine: (c) => (seen.push(c), cs.refine(c)), mid: cs.mid });
    const input = { kind: 'onEdge', point: [0, 0, 0], segment: { kind: 'line', id: 'x', index: 0, raw: 0, ends: [[0, 0, 0], [1, 0, 0]] }, first: null, ray: { origin: [0, 0, 1], dir: [0, 0, -1] } } as const;
    expect(o2.refine!(input as never)).toBeNull();
    expect(seen).toHaveLength(1);
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

describe('두 점 측정 방향 잠금(코어 0.10.0 추론 잠금·모서리와 나란히 — 잠그는 판정은 measurelock.test.ts가 실제 코어로)', () => {

  it('이름: 모서리와 나란히, 잠근 점은 " · 잠금"(조각마다 번역), 결과의 lockedB', () => {
    expect(snapLabel('parallel')).toBe('모서리와 나란히');
    expect(hoverSnapLabel({ snap: 'parallel' })).toBe('모서리와 나란히');
    expect(hoverSnapLabel({ snap: 'axis', axis: 'z', locked: true })).toBe('Z축 방향 · 잠금');
    expect(snapPair({ snapA: 'vertex', snapB: 'axis', axisB: 'z', lockedB: true })).toEqual(['꼭짓점', 'Z축 방향 · 잠금']);
    expect(snapPair(measureResult([0, 0, 0], [3, 3, 0], [{ kind: 'vertex' }, { kind: 'parallel' }]))).toEqual(['꼭짓점', '모서리와 나란히']);
    expect(translate('Z축 방향 · 잠금', 'en')).toBe('Along Z axis · Locked');
    expect(translate('모서리와 나란히', 'de')).toBe('Parallel zur Kante');
  });

  it('잠금 이름·안내: 잠갔으면 잠근 방향, 끝점을 잡는 동안 키보드 기기는 Shift로 잠글 방향이 있으면 Shift·화살표, 없으면 화살표 안내, 손가락 기기는 단추라 없음', () => {
    expect(lockName(null)).toBeNull();
    expect(lockName({ kind: 'axis', axis: 'y' })).toBe('y');
    expect(lockName({ kind: 'parallel' })).toBe('parallel');
    expect(lockName({ kind: 'perpendicular' })).toBe('perpendicular');
    expect(lockHint(1, null)).toBe('Shift·화살표로 방향 잠금');
    expect(lockHint(1, null, false, false)).toBe('화살표로 축 잠금');
    expect(lockHint(1, null, true)).toBeNull();
    expect(lockHint(1, null, true, false)).toBeNull();
    expect(lockHint(0, null)).toBeNull();
    expect(lockHint(0, null, false, false)).toBeNull();
    expect(lockHint(2, null)).toBeNull();
    expect(lockHint(0, 'z', true)).toBe('Z축으로 잠금');
    expect(lockHint(1, 'parallel', false, false)).toBe('모서리와 나란히 잠금');
    for (const t of ['Shift·화살표로 방향 잠금', '화살표로 축 잠금', 'X축으로 잠금', '모서리와 나란히 잠금', '모서리에 수직으로 잠금']) for (const l of ['en', 'ja', 'zh-CN', 'de']) expect(translate(t, l)).not.toMatch(/[가-힣]/);
  });

  it('viewerLockHint: 코어 상태(찍은 점 수·잠금·커서 아래 잠글 방향 measureHoverLock)로 안내를 고른다', () => {
    const v = (n: number, lock: LockViewer['measureInferenceLock'], hover: LockViewer['measureHoverLock']): LockViewer => ({ measurePointCount: n, measureInferenceLock: lock, measureHoverLock: hover });
    const edge = { kind: 'parallel' as const, direction: [Math.SQRT1_2, Math.SQRT1_2, 0] as [number, number, number] };
    expect(viewerLockHint(v(1, null, edge))).toBe('Shift·화살표로 방향 잠금');
    expect(viewerLockHint(v(1, null, null))).toBe('화살표로 축 잠금');
    expect(viewerLockHint(v(1, null, edge), true)).toBeNull();
    expect(viewerLockHint(v(0, null, null))).toBeNull();
    expect(viewerLockHint(v(1, { ...edge, source: 'shift' }, edge))).toBe('모서리와 나란히 잠금');
    expect(viewerLockHint(v(0, { kind: 'axis', axis: 'x', direction: [1, 0, 0], source: 'api' }, null), true)).toBe('X축으로 잠금');
  });

  it('곡선 접선 잠금(tangent.ts — 받기 전이면 null): 잠갔으면 "접선 방향으로 잠금", 커서 아래에 접선이 있으면 Shift 안내, 결과·커서 아래 이름은 "접선 방향"', () => {
    const v = (n: number, lock: LockViewer['measureInferenceLock'], hover: LockViewer['measureHoverLock']): LockViewer => ({ measurePointCount: n, measureInferenceLock: lock, measureHoverLock: hover });
    const tan = (locked: boolean, now: boolean): TangentHint => ({ locked: () => locked, now: () => (now ? [0, 1, 0] : null) });
    const dir = [0.6, 0.8, 0] as [number, number, number];
    expect(viewerLockHint(v(1, null, null), false, tan(false, true))).toBe('Shift·화살표로 방향 잠금');
    expect(viewerLockHint(v(1, null, null), false, tan(false, false))).toBe('화살표로 축 잠금');
    expect(viewerLockHint(v(1, null, null), true, tan(false, true))).toBeNull();
    expect(viewerLockHint(v(1, { kind: 'parallel', direction: dir, source: 'api' }, null), false, tan(true, false))).toBe('접선 방향으로 잠금');
    expect(viewerLockName(v(1, { kind: 'parallel', direction: dir, source: 'api' }, null), tan(true, false))).toBe('tangent');
    expect(viewerLockName(v(1, { kind: 'parallel', direction: dir, source: 'api' }, null), null)).toBe('parallel');
    expect(lockHint(1, 'tangent')).toBe('접선 방향으로 잠금');
    expect(hoverSnapLabel({ snap: 'parallel', locked: true }, true)).toBe('접선 방향 · 잠금');
    expect(hoverSnapLabel({ snap: 'endpoint' }, true)).toBe('끝점');
    expect(snapPair({ snapA: 'endpoint', snapB: 'parallel', lockedB: true, tangentB: true })).toEqual(['끝점', '접선 방향 · 잠금']);
    expect(TANGENT_LABEL).toBe('접선 방향');
    for (const t of [TANGENT_LABEL, '접선 방향으로 잠금', '접선 방향 · 잠금']) for (const l of ['en', 'ja', 'zh-CN', 'de']) expect(translate(t, l), `${l}: ${t}`).not.toMatch(/[가-힣]/);
    expect(translate('접선 방향 · 잠금', 'en')).toBe('Along tangent · Locked');
  });

  it('화살표: →·←·↑는 X·Y·Z축(같은 축이면 풀기, 첫 점 전에도), ↓는 끝점을 잡는 동안 지금 방향(잠갔으면 풀기), 두 점을 다 찍었으면 넘긴다', () => {
    expect(arrowLock('ArrowRight', 0, null)).toBe('x');
    expect(arrowLock('ArrowLeft', 1, null)).toBe('y');
    expect(arrowLock('ArrowUp', 1, { kind: 'parallel' })).toBe('z');
    expect(arrowLock('ArrowUp', 1, { kind: 'axis', axis: 'z' })).toBe(false);
    expect(arrowLock('ArrowDown', 1, null)).toBe(true);
    expect(arrowLock('ArrowDown', 1, { kind: 'axis', axis: 'x' })).toBe(false);
    expect(arrowLock('ArrowDown', 0, null)).toBeNull();
    expect(arrowLock('ArrowRight', 2, null)).toBeNull();
    expect(arrowLock('Enter', 1, null)).toBeNull();
  });
});
