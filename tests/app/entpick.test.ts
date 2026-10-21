import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { Fmt } from '../../src/app/display';
import { edgeDetails, type EdgePick } from '../../src/app/edges';
import { armSize, edgeEntity, faceEntity, lineValue, measurePicked, pickedAnnotations, pickedClosest, pickedEdge, pickedFace, pickedPoint, pickedSection, type Picked } from '../../src/app/entpick';
import { faceDetails, type FacePick } from '../../src/app/faces';
import { cube, cylinder, StepText } from '../stepText';

const MM = new Fmt('mm');

/** 같은 부품 두 개를 at1·at2에 놓은 조립 */
function twoParts(build: (w: StepText) => number, at1: [number, number, number], at2: [number, number, number]) {
  const w = new StepText();
  const ctx = w.context();
  const part = w.product('p', [build(w)], ctx);
  const a1 = w.ax2(at1);
  const a2 = w.ax2(at2);
  const root = w.product('asm', [a1, a2], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, part, a1, 'p-1');
  w.place(root, part, a2, 'p-2');
  return stepToScene(w.bytes());
}

function faces(s: ReturnType<typeof stepToScene>, mi: number): FacePick[] {
  const fx = stepFaceIndex(s)!;
  const m = s.meshes[mi]!;
  const t = fx.tables[fx.tableOf.get(m.id)!]!;
  return Array.from({ length: t.kinds.length }, (_, i) => faceDetails(m, t, i, fx.kinds)!);
}

function edges(s: ReturnType<typeof stepToScene>, mi: number): EdgePick[] {
  const ex = stepEdgeIndex(s)!;
  const m = s.meshes[mi]!;
  const t = ex.tables[ex.tableOf.get(m.id)!]!;
  return Array.from({ length: t.kinds.length }, (_, i) => edgeDetails(m, t, i, ex.kinds)!);
}

describe('개체 측정: 누른 면·모서리 → 개체 → 두 개 사이', () => {
  it('원기둥 두 개(구멍 피치): 옆면은 축 — 축 사이 거리 50, 윗원 모서리는 중심 거리, 윗면끼리는 같은 높이(0)', () => {
    const s = twoParts((w) => cylinder(w, 2, 5), [0, 0, 0], [30, 40, 0]);
    const fa = faces(s, 0);
    const fb = faces(s, 1);
    const sideA = fa.find((f) => f.kind === 'cylinder')!;
    const sideB = fb.find((f) => f.kind === 'cylinder')!;
    const ea = faceEntity(sideA)!;
    expect(ea.type).toBe('axis');
    // 기준점은 면 가운데를 축에 내린 발(높이 2.5)
    if (ea.type === 'axis') expect(ea.origin[2]).toBeCloseTo(2.5, 6);
    const r = measurePicked(pickedFace(sideA, [2, 0, 1]), pickedFace(sideB, [32, 40, 1]), { size: 10 });
    expect(r.approx).toBe(false);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.label).toBe('축 사이 거리');
    expect(r.lines[0]!.value).toBeCloseTo(50, 9);

    const topA = edges(s, 0).find((e) => e.center![2] > 4)!;
    const topB = edges(s, 1).find((e) => e.center![2] > 4)!;
    expect(edgeEntity(topA)?.type).toBe('circle');
    const c = measurePicked(pickedEdge(topA, topA.ends[0]), pickedEdge(topB, topB.ends[0]), { size: 10 });
    expect(c.lines[0]!.label).toBe('중심 거리');
    expect(c.lines[0]!.value).toBeCloseTo(50, 6);

    // 윗면(평면)끼리: 나란한 면 거리 0, 바닥–윗면은 5
    const capA = fa.find((f) => f.kind === 'plane' && f.normal![2] > 0)!;
    const botB = fb.find((f) => f.kind === 'plane' && f.normal![2] < 0)!;
    const p = measurePicked(pickedFace(capA, capA.center), pickedFace(botB, botB.center), { size: 10 });
    expect(p.lines[0]!.label).toBe('평행 면 거리');
    expect(p.lines[0]!.value).toBeCloseTo(5, 6);
    // 원 중심–면: 아래 원 중심에서 위 뚜껑까지 5
    const botEdge = edges(s, 0).find((e) => e.center![2] < 1)!;
    const cp = measurePicked(pickedEdge(botEdge, botEdge.ends[0]), pickedFace(capA, capA.center), { size: 10 }).lines[0]!;
    expect(cp.label).toBe('중심–면 거리');
    expect(cp.value).toBeCloseTo(5, 6);
  });

  it('정육면체: 직선 모서리 끝 붙잡기(꼭짓점) – 면, 단면 평면, 점', () => {
    const w = new StepText();
    w.product('c', [cube(w, 10).solid], w.context());
    const s = stepToScene(w.bytes());
    const top = faces(s, 0).find((f) => f.normal?.[2] === 1)!;
    const line = edges(s, 0).find((e) => e.ends[0][2] === 0 && e.ends[1][2] === 0)!;
    const v = pickedEdge(line, line.ends[0], { what: 'vertex', point: line.ends[0] });
    expect(v.what).toBe('vertex');
    expect(v.title).toBe('꼭짓점');
    const r = measurePicked(v, pickedFace(top, top.center), { size: 10 });
    expect(r.lines[0]).toEqual({ label: '점–면 거리', unit: 'length', value: 10 });
    // 가운데 점
    const m = pickedEdge(line, line.mid, { what: 'mid', point: line.mid });
    expect(m.title).toBe('모서리 가운데 점');
    // 단면 평면 z=3 – 윗면: 7
    const sec = pickedSection(s.meshes[0]!.id, [5, 5, 3], [0, 0, 1]);
    expect(measurePicked(sec, pickedFace(top, top.center), { size: 10 }).lines[0]!.value).toBeCloseTo(7, 9);
    // 직선 모서리 – 나란한 모서리
    const other = edges(s, 0).find((e) => e !== line && Math.abs(e.ends[0][2] - 10) < 1e-9 && Math.abs((e.ends[1][0] - e.ends[0][0]) * (line.ends[1][1] - line.ends[0][1]) - (e.ends[1][1] - e.ends[0][1]) * (line.ends[1][0] - line.ends[0][0])) < 1e-9)!;
    const pl = measurePicked(pickedEdge(line, line.mid), pickedEdge(other, other.mid), { size: 10 });
    expect(pl.lines[0]!.label).toBe('평행 모서리 거리');
  });

  it('해석적으로 못 잴 때: 고른 면 삼각형 사이 최소 거리(≈)와 다른 부품이면 부품 사이 최소 거리', () => {
    const s = twoParts((w) => cube(w, 10).solid, [0, 0, 0], [0, 0, 13]);
    const topA = faces(s, 0).find((f) => f.normal?.[2] === 1)!;
    const botB = faces(s, 1).find((f) => f.normal?.[2] === -1)!;
    // B-스플라인 면처럼(개체 없음)
    const a: Picked = { ...pickedFace(topA, topA.center), entity: null };
    const b: Picked = { ...pickedFace(botB, botB.center), entity: null };
    const meshOf = (id: string): Mesh3d | undefined => s.meshes.find((m) => m.id === id);
    const c = pickedClosest(a, b, meshOf)!;
    expect(c.distance).toBeCloseTo(3, 5);
    const r = measurePicked(a, b, { size: 10, closest: (x, y) => pickedClosest(x, y, meshOf), parts: () => ({ a: [0, 0, 10], b: [0, 0, 13], distance: 3 }) });
    expect(r.approx).toBe(true);
    expect(r.lines.map((l) => [l.label, Math.round(l.value * 1000) / 1000, l.approx])).toEqual([
      ['최소 거리', 3, true],
      ['부품 사이 최소 거리', 3, true],
    ]);
    expect(lineValue(r.lines[0]!, MM)).toBe('≈ 3 mm');
    // 최근접점을 못 구하면 누른 점 사이 거리(정확)
    const q = measurePicked(pickedPoint('x', [0, 0, 0]), { ...pickedPoint('x', [3, 4, 0]), entity: null }, { size: 1 });
    expect(q.lines).toEqual([{ label: '누른 점 사이 거리', unit: 'length', value: 5 }]);
    expect(q.approx).toBe(false);
  });

  it('덧그림: 결과 선에 값 글(표시 단위), 하나만 고르면 원은 지름 원·직선은 길이, 각은 도', () => {
    const s = twoParts((w) => cylinder(w, 2, 5), [0, 0, 0], [30, 40, 0]);
    const topA = edges(s, 0).find((e) => e.center![2] > 4)!;
    const one = pickedAnnotations([pickedEdge(topA, topA.ends[0])], null, MM);
    expect(one.map((a) => a.kind)).toEqual(['point', 'radius']);
    expect(one[1]!.label).toBe('Ø4 mm');
    expect(one[1]!.normal).toBeDefined();
    const sideA = faces(s, 0).find((f) => f.kind === 'cylinder')!;
    const sideB = faces(s, 1).find((f) => f.kind === 'cylinder')!;
    const A = pickedFace(sideA, [2, 0, 1]);
    const B = pickedFace(sideB, [32, 40, 1]);
    const r = measurePicked(A, B, { size: 10 });
    const anns = pickedAnnotations([A, B], r, new Fmt('mm', { unit: 'in', decimals: 2, quality: 'normal' }));
    expect(anns.find((a) => a.kind === 'distance')!.label).toBe('1.97 in');
    const ang = measurePicked(pickedSection('m', [0, 0, 0], [0, 0, 1]), pickedSection('m', [0, 0, 0], [0, Math.SQRT1_2, Math.SQRT1_2]), { size: 10 });
    expect(pickedAnnotations([], ang, MM).find((a) => a.kind === 'angle')!.label).toBe('45°');
  });

  it('덧그림 팔 길이: 두 기준점 거리를 장면 크기 3~25%로 잘라 다섯 배', () => {
    const a = pickedPoint('a', [0, 0, 0]);
    expect(armSize(a, pickedPoint('b', [1, 0, 0]), 1000)).toBeCloseTo(150, 9);
    expect(armSize(a, pickedPoint('b', [100, 0, 0]), 1000)).toBeCloseTo(500, 9);
    expect(armSize(a, pickedPoint('b', [900, 0, 0]), 1000)).toBeCloseTo(1250, 9);
  });

  it('타원 모서리: 하나만 고르면 반지름 선 대신 두 지름(긴 × 짧은), 측정은 중심으로', () => {
    const ep = { meshId: 'm', edge: 0, stepId: 1, kind: 'ellipse', segStart: 0, segCount: 4, length: 30, radius: 6, minorRadius: 3, center: [0, 0, 0], axis: [0, 0, 1], ends: [[6, 0, 0], [6, 0, 0]], mid: [-6, 0, 0], segs: new Float32Array(), segOrigin: [0, 0, 0] } as EdgePick;
    const p = pickedEdge(ep, [6, 0, 0]);
    expect(p.entity?.type).toBe('circle');
    const anns = pickedAnnotations([p], null, MM);
    expect(anns.map((a) => a.kind)).toEqual(['point', 'point']);
    expect(anns[1]!.label).toBe('12 mm × 6 mm');
    expect(anns.some((a) => a.kind === 'radius')).toBe(false);
  });
});
