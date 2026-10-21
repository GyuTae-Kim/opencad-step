import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/index';
import { createDoc, stepFaceIndex, subtreeMeshIds } from '../../src/app/doc';
import { brepArea, localProps, massText, meshNodes, physProps } from '../../src/app/physics';
import { sampleStepBytes } from '../../src/app/sample';
import { cube, StepText } from '../stepText';

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
