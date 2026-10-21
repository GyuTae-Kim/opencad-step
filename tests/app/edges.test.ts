import { describe, expect, it } from 'vitest';
import { EDGE_KINDS, EDGE_PARAMS, stepToScene, type StepMeta } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { edgeAt, edgeDetails, edgeKindLabel, isFullCircle, snapOnEdge, type EdgePick } from '../../src/app/edges';
import { cube, cylinder, plateWithHole, StepText } from '../stepText';

const meta = (s: ReturnType<typeof stepToScene>) => s.meta as unknown as StepMeta;

/** 그물의 모든 모서리 자세한 정보 */
function allEdges(s: ReturnType<typeof stepToScene>, mi = 0): EdgePick[] {
  const ex = stepEdgeIndex(s)!;
  const mesh = s.meshes[mi]!;
  const t = ex.tables[ex.tableOf.get(mesh.id)!]!;
  const out: EdgePick[] = [];
  for (let e = 0; e < t.kinds.length; e++) out.push(edgeDetails(mesh, t, e, ex.kinds)!);
  return out;
}

describe('모서리 표(윤곽선 선분 → B-rep 모서리)', () => {
  it('edgeAt: 이분 탐색, 선분 없는 모서리는 건너뛰고 범위 밖은 -1', () => {
    const t = { segStart: Uint32Array.from([0, 3, 3, 4, 10]) };
    expect([0, 2, 3, 4, 9].map((s) => edgeAt(t, s))).toEqual([0, 0, 2, 3, 3]);
    expect(edgeAt(t, 10)).toBe(-1);
    expect(edgeAt(t, -1)).toBe(-1);
    expect(edgeAt({ segStart: new Uint32Array([0]) }, 0)).toBe(-1);
  });

  it('원기둥: 위아래 원 두 개(이음선 없음) — 반지름·중심·축·한 바퀴·길이 2πr, 선분 범위가 윤곽선 전체를 덮는다', () => {
    const w = new StepText();
    w.product('cyl', [cylinder(w, 2, 5)], w.context());
    const s = stepToScene(w.bytes());
    const m = meta(s);
    expect(m.edgeKinds).toEqual(EDGE_KINDS);
    const t = m.edgeTables![m.meshEdgeTable![0]!]!;
    expect(t.params.length).toBe(t.kinds.length * EDGE_PARAMS);
    expect(t.segStart[t.segStart.length - 1]).toBe(s.meshes[0]!.edges!.length / 6);
    const edges = allEdges(s);
    expect(edges.map((e) => e.kind)).toEqual(['circle', 'circle']);
    for (const e of edges) {
      expect(e.radius).toBeCloseTo(2, 6);
      expect(e.length).toBeCloseTo(4 * Math.PI, 6);
      expect(e.sweepDeg).toBeCloseTo(360, 4);
      expect(isFullCircle(e)).toBe(true);
      expect(Math.abs(e.axis![2])).toBeCloseTo(1, 9);
      expect(e.center![0]).toBeCloseTo(0, 9);
      expect(e.center![1]).toBeCloseTo(0, 9);
      // 강조 선분은 가운데 점 기준
      expect(e.segs.length).toBe(e.segCount * 6);
    }
    expect(edges.map((e) => Math.round(e.center![2])).sort()).toEqual([0, 5]);
    expect(edgeKindLabel('circle')).toBe('원호 모서리');
    expect(edgeKindLabel('zzz')).toBe('곡선 모서리');
  });

  it('구멍 뚫린 판: 직선 모서리 길이(20·10·2)와 구멍 원(중심 10, 5)', () => {
    const w = new StepText();
    w.product('plate', [plateWithHole(w)], w.context());
    const s = stepToScene(w.bytes());
    const edges = allEdges(s);
    const lines = edges.filter((e) => e.kind === 'line').map((e) => Math.round(e.length * 1000) / 1000);
    expect(lines.filter((l) => l === 20)).toHaveLength(4);
    expect(lines.filter((l) => l === 10)).toHaveLength(4);
    expect(lines.filter((l) => l === 2)).toHaveLength(4);
    const holes = edges.filter((e) => e.kind === 'circle');
    expect(holes).toHaveLength(2);
    for (const hc of holes) {
      expect(hc.radius).toBeCloseTo(2, 6);
      expect(hc.center![0]).toBeCloseTo(10, 6);
      expect(hc.center![1]).toBeCloseTo(5, 6);
    }
    // 직선 모서리의 가운데 점은 두 끝의 가운데
    const l = edges.find((e) => e.kind === 'line' && Math.abs(e.length - 20) < 1e-9)!;
    for (let q = 0; q < 3; q++) expect(l.mid[q]).toBeCloseTo((l.ends[0][q]! + l.ends[1][q]!) / 2, 9);
  });

  it('자리 변환(+100 x)은 끝점·중심에, 단위가 다른 부품(인치)은 반지름·중심·길이를 장면 단위로', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cube(w, 10).solid], ctx);
    const at = w.ax2([100, 0, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    const edges = allEdges(stepToScene(w.bytes()));
    expect(edges).toHaveLength(12);
    for (const e of edges) {
      expect(e.kind).toBe('line');
      expect(e.length).toBeCloseTo(10, 9);
      for (const p of e.ends) expect(p[0]).toBeGreaterThanOrEqual(100 - 1e-9);
    }

    const v = new StepText();
    const mm = v.context('mm');
    const inch = v.context('inch');
    const pin = v.product('pin', [cylinder(v, 1, 2)], inch);
    const at2 = v.ax2([0, 0, 0]);
    const asm = v.product('asm', [at2], mm, 'SHAPE_REPRESENTATION');
    v.place(asm, pin, at2, 'pin-1');
    const s2 = stepToScene(v.bytes());
    expect(s2.units).toBe('mm');
    const c = allEdges(s2);
    expect(c.map((e) => e.kind)).toEqual(['circle', 'circle']);
    expect(c[0]!.radius).toBeCloseTo(25.4, 4);
    expect(c[0]!.length).toBeCloseTo(2 * Math.PI * 25.4, 3);
    expect(c.map((e) => Math.round(e.center![2] * 10) / 10).sort((a, b) => a - b)).toEqual([0, 50.8]);
  });

  it('매개변수는 배정밀도: 1인치 구멍 지름이 정확히 50.8 mm, 한 바퀴는 360°(단정밀도면 50.79999923…·360.00001)', () => {
    const v = new StepText();
    const mm = v.context('mm');
    const inch = v.context('inch');
    const pin = v.product('pin', [cylinder(v, 0.5, 2)], inch);
    const at = v.ax2([0, 0, 0]);
    const asm = v.product('asm', [at], mm, 'SHAPE_REPRESENTATION');
    v.place(asm, pin, at, 'pin-1');
    const s = stepToScene(v.bytes());
    const t = meta(s).edgeTables![0]!;
    expect(t.params).toBeInstanceOf(Float64Array);
    expect(t.sweep).toBeInstanceOf(Float64Array);
    const c = allEdges(s);
    for (const e of c) {
      expect(e.radius! * 2).toBe(25.4);
      expect(e.sweepDeg).toBeCloseTo(360, 9);
    }
    expect(c.map((e) => e.center![2]).sort((a, b) => a - b)).toEqual([0, 50.8]);
    const ft = meta(s).faceTables![0]!;
    expect(ft.params).toBeInstanceOf(Float64Array);
    expect(ft.params[2 * 8]).toBe(12.7);
  });

  it('faceTable: false면 모서리 표도 없다', () => {
    const w = new StepText();
    w.product('cyl', [cylinder(w, 2, 5)], w.context());
    const off = meta(stepToScene(w.bytes(), { faceTable: false }));
    expect(off.edgeTables).toBeUndefined();
    expect(off.meshEdgeTable).toBeUndefined();
  });

  it('붙잡기: 화면에서 끝점·가운데 점이 허용 거리 안이면 그 점, 한 바퀴 원은 붙잡지 않는다', () => {
    const ep = { kind: 'line', ends: [[0, 0, 0], [10, 0, 0]], mid: [5, 0, 0] } as unknown as EdgePick;
    // 세계 x 1 = 화면 10화소
    const toScreen = (p: readonly number[]) => ({ x: p[0]! * 10, y: p[1]! * 10 });
    expect(snapOnEdge(ep, [0.5, 0, 0], toScreen, 8)).toEqual({ what: 'vertex', point: [0, 0, 0] });
    expect(snapOnEdge(ep, [5.3, 0, 0], toScreen, 8)).toEqual({ what: 'mid', point: [5, 0, 0] });
    expect(snapOnEdge(ep, [9.9, 0, 0], toScreen, 8)).toEqual({ what: 'vertex', point: [10, 0, 0] });
    expect(snapOnEdge(ep, [2.5, 0, 0], toScreen, 8)).toBeNull();
    const circle = { ...ep, kind: 'circle', sweepDeg: 360 } as EdgePick;
    expect(snapOnEdge(circle, [0.1, 0, 0], toScreen, 8)).toBeNull();
    const arc = { ...ep, kind: 'circle', sweepDeg: 90 } as EdgePick;
    expect(snapOnEdge(arc, [0.1, 0, 0], toScreen, 8)?.what).toBe('vertex');
  });
});
