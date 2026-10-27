import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/index';
import { createDoc, stepFaceIndex, subtreeMeshIds } from '../../src/app/doc';
import { brepArea, inertiaText, localProps, massText, meshNodes, physProps, symEigen3 } from '../../src/app/physics';
import { sampleStepBytes } from '../../src/app/sample';
import { cube, cylinder, StepText, type P3 } from '../stepText';

describe('물리 속성(부피·겉넓이·무게중심·질량)', () => {
  it('정육면체: 부피·B-rep 겉넓이·무게중심, 자리 변환(이동) 반영, 밀도 → 질량', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cube(w, 10).solid], ctx);
    const at = w.ax2([100, 0, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    w.density(part.pd, 7850, ctx);
    const s = stepToScene(w.bytes());
    const doc = createDoc('c.stp', 1, { scene: s, ms: 0 });
    const owner = meshNodes(doc.products);
    const p = physProps(s.meshes, null, { faces: doc.faces, sceneMm: 1, densityOf: (id) => owner.get(id)?.props?.density });
    expect(p.volume).toBeCloseTo(1000, 6);
    expect(p.area).toBeCloseTo(600, 6);
    expect(p.areaExact).toBe(true);
    expect(p.centroid![0]).toBeCloseTo(105, 6);
    expect(p.centroid![2]).toBeCloseTo(5, 6);
    // 7850 kg/m³ × 1 cm³ = 7.85 g
    expect(p.mass!).toBeCloseTo(0.00785, 9);
    expect(massText(p.mass!, (v) => v.toFixed(2))).toBe('7.85 g');
    expect(massText(2.5, (v) => String(v))).toBe('2.5 kg');
    expect(p.closed).toBe(1);
    expect(p.bounds!.min[0]).toBeCloseTo(100, 6);
    expect(brepArea(doc.faces, s.meshes[0]!.id)).toEqual({ area: expect.closeTo(600, 6), exact: true });
    expect(localProps(s.meshes[0]!).volume).toBeCloseTo(1000, 6);
  });

  it('예제: 고른 마디만, 파일 밀도가 없으면 고른 재질로, 단위를 모르면 질량 없음', () => {
    const s = stepToScene(sampleStepBytes());
    const doc = createDoc('s.stp', 1, { scene: s, ms: 0 });
    const owner = meshNodes(doc.products);
    const plate = doc.products[0]!.children[0]!;
    const ids = new Set(subtreeMeshIds(plate));
    const p = physProps(s.meshes, ids, { faces: stepFaceIndex(s), sceneMm: 1, densityOf: (id) => owner.get(id)?.props?.density });
    // 20×10×2 판 − 지름 4 구멍: 400 − 8π mm³(삼각형이라 조금 다르다)
    expect(p.volume).toBeCloseTo(400 - 8 * Math.PI, 0);
    expect(p.area).toBeCloseTo(2 * (200 - 4 * Math.PI) + 2 * (20 * 2 + 10 * 2) + 2 * Math.PI * 2 * 2, 6);
    // 알루미늄 2700 kg/m³
    expect(p.mass!).toBeCloseTo(2700 * (400 - 8 * Math.PI) * 1e-9, 5);
    // 파일 밀도 없음 + 고른 재질
    const none = physProps(s.meshes, ids, { sceneMm: 1, picked: 1000 });
    expect(none.densityFrom).toEqual({ file: 0, picked: 1 });
    expect(none.mass!).toBeCloseTo(1000 * (400 - 8 * Math.PI) * 1e-9, 5);
    const unknownUnits = physProps(s.meshes, ids, { sceneMm: NaN, picked: 1000 });
    expect(unknownUnits.mass).toBeNull();
    expect(unknownUnits.noDensity).toBe(1);
  });

  it('열린 그물은 부피에서 빼고 겉넓이만', () => {
    const tri = { id: 'o', positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]), color: [1, 1, 1, 1] as [number, number, number, number] };
    const p = physProps([tri], null, { sceneMm: 1 });
    expect(p.closed).toBe(0);
    expect(p.open).toBe(1);
    expect(p.volume).toBe(0);
    expect(p.area).toBeCloseTo(0.5, 9);
    expect(p.centroid).toBeNull();
  });
});

/** 원점 모서리 a×b×c 상자(평면 면 여섯) */
function box(w: StepText, a: number, b: number, c: number): number {
  const P = (i: number): P3 => [i & 1 ? a : 0, i & 2 ? b : 0, i & 4 ? c : 0];
  const V = Array.from({ length: 8 }, (_, i) => w.vertex(P(i)));
  const edges = new Map<string, number>();
  const oe = (i: number, j: number) => {
    const k = i < j ? `${i}-${j}` : `${j}-${i}`;
    let e = edges.get(k);
    if (e === undefined) {
      const [s0, t0] = i < j ? [i, j] : [j, i];
      e = w.edge(V[s0]!, V[t0]!, w.line(P(s0), P(t0)));
      edges.set(k, e);
    }
    return w.oe(e, i < j);
  };
  const quads: [number[], P3, P3][] = [
    [[0, 2, 3, 1], [0, 0, -1], [1, 0, 0]],
    [[4, 5, 7, 6], [0, 0, 1], [1, 0, 0]],
    [[0, 1, 5, 4], [0, -1, 0], [1, 0, 0]],
    [[2, 6, 7, 3], [0, 1, 0], [1, 0, 0]],
    [[0, 4, 6, 2], [-1, 0, 0], [0, 1, 0]],
    [[1, 3, 7, 5], [1, 0, 0], [0, 1, 0]],
  ];
  const faces = quads.map(([q, n, x]) => w.face([w.bound(w.loop(q.map((i, k) => oe(i, q[(k + 1) % 4]!))))], w.plane(P(q[0]!), n, x)));
  return w.solid(faces);
}

describe('관성 모멘트(무게중심 기준 관성 텐서·주 관성 모멘트)', () => {
  it('symEigen3: 대칭 행렬의 고윳값(작은 것부터)과 직교 고유 벡터', () => {
    const e = symEigen3([2, 1, 0, 1, 2, 0, 0, 0, 5]);
    expect(e.values[0]).toBeCloseTo(1, 12);
    expect(e.values[1]).toBeCloseTo(3, 12);
    expect(e.values[2]).toBeCloseTo(5, 12);
    expect(Math.abs(e.vectors[0][0] + e.vectors[0][1])).toBeLessThan(1e-12); // (1, -1, 0)/√2
    expect(Math.abs(e.vectors[2][2])).toBeCloseTo(1, 12);
  });

  it('정육면체 10 mm 강철(자리 이동): 세 주 관성 모멘트 = m(a² + a²)/12, 질량을 모르면 없음', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cube(w, 10).solid], ctx);
    const at = w.ax2([100, 0, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    const s = stepToScene(w.bytes());
    const p = physProps(s.meshes, null, { sceneMm: 1, picked: 7850 });
    const m = 7850 * 1e-6; // kg
    const I = (m * (0.01 ** 2 + 0.01 ** 2)) / 12;
    for (const v of p.inertia!.principal) expect(v / I).toBeCloseTo(1, 9);
    for (const v of p.inertia!.tensor.slice(0, 3)) expect(v / I).toBeCloseTo(1, 9);
    for (const v of p.inertia!.tensor.slice(3)) expect(Math.abs(v / I)).toBeLessThan(1e-9);
    expect(physProps(s.meshes, null, { sceneMm: 1 }).inertia).toBeNull();
    expect(inertiaText(I, (v) => v.toFixed(3))).toBe('130.833 g·mm²');
    expect(inertiaText(2e-5, (v) => v.toFixed(0))).toBe('20 kg·mm²');
    expect(inertiaText(2, (v) => String(v))).toBe('2 kg·m²');
    expect(inertiaText(5e-8, (v) => v.toFixed(0))).toBe('50 g·mm²');
  });

  it('10×20×30 상자를 z축으로 90° 돌려 놓으면 주 관성 모멘트는 그대로, 축은 돌아간다', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('b', [box(w, 10, 20, 30)], ctx);
    const at = w.ax2([0, 0, 0], [0, 0, 1], [0, 1, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'b1');
    const s = stepToScene(w.bytes());
    const p = physProps(s.meshes, null, { sceneMm: 1, picked: 1000 });
    const m = 1000 * 6000e-9;
    const a = 0.01, b = 0.02, c = 0.03;
    const want = [(m * (b * b + c * c)) / 12, (m * (a * a + c * c)) / 12, (m * (a * a + b * b)) / 12].sort((x, y) => x - y);
    p.inertia!.principal.forEach((v, i) => expect(v / want[i]!).toBeCloseTo(1, 9));
    // 장면 축: 상자의 x 길이(10)가 y로 갔다 — Iyy = m(a'² + c²)/12, a'(=x 방향 길이) = 20
    expect(p.inertia!.tensor[0] / ((m * (a * a + c * c)) / 12)).toBeCloseTo(1, 9);
    expect(p.inertia!.tensor[1] / ((m * (b * b + c * c)) / 12)).toBeCloseTo(1, 9);
    // 세계 크기 20(x) × 10(y) × 30(z): 가장 큰 모멘트 m(20² + 30²)/12는 y축 둘레, 가장 작은 m(20² + 10²)/12는 z축 둘레
    expect(Math.abs(p.inertia!.axes[2][1])).toBeCloseTo(1, 9);
    expect(Math.abs(p.inertia!.axes[0][2])).toBeCloseTo(1, 9);
  });

  it('원기둥(곡면 품질에 따라 ≈): Izz ≈ m r²/2, Ixx ≈ m(3r² + h²)/12', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('cyl', [cylinder(w, 5, 10)], ctx);
    const s = stepToScene(w.bytes(), { angleTolerance: 5 });
    const p = physProps(s.meshes, null, { sceneMm: 1, picked: 1000 });
    const m = p.mass!;
    const r = 0.005, h = 0.01;
    expect(p.inertia!.tensor[2] / ((m * r * r) / 2)).toBeCloseTo(1, 2);
    expect(p.inertia!.tensor[0] / ((m * (3 * r * r + h * h)) / 12)).toBeCloseTo(1, 2);
  });
});
