import { describe, expect, it } from 'vitest';
import { stepToScene, type StepMeta } from '../src/index';
import { createDoc, productAt } from '../src/app/doc';
import { Fmt } from '../src/app/display';
import { nodePath, partRows, pathText, placementOf } from '../src/app/partinfo';
import { sampleStepBytes } from '../src/app/sample';
import { StepFile } from '../src/part21';
import { densityKgM3, readProductProps } from '../src/props';
import { cube, StepText } from './stepText';

describe('제품 속성(설명·재질·밀도·사용자 속성)', () => {
  it('PROPERTY_DEFINITION → 표현 항목, 밀도는 단위를 따라 kg/m³', () => {
    const w = new StepText();
    const ctx = w.context();
    const p = w.product('part', [cube(w, 1).solid], ctx, undefined, 'a test part');
    w.textProperty(p.pd, 'material property', 'material name', 'Steel', ctx);
    w.density(p.pd, 7850, ctx);
    w.textProperty(p.pd, 'user defined attribute', 'Supplier', 'ACME', ctx);
    const props = readProductProps(new StepFile(w.bytes()));
    expect(props.get(p.pd)).toEqual({ description: 'a test part', material: 'Steel', density: 7850, densityText: '7850 kg·m^-3', items: [['Supplier', 'ACME']] });
  });

  it('밀도 단위: g/cm³(밀리·센티), 단위 없는 값은 크기로 짐작', () => {
    const w = new StepText();
    const g = w.raw(`(MASS_UNIT() NAMED_UNIT(*) SI_UNIT($,.GRAM.))`);
    const cm = w.raw(`(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.CENTI.,.METRE.))`);
    const du = w.add('DERIVED_UNIT', `(#${w.add('DERIVED_UNIT_ELEMENT', `#${g},1.`)},#${w.add('DERIVED_UNIT_ELEMENT', `#${cm},-3.`)})`);
    const f = new StepFile(w.bytes());
    expect(densityKgM3(f, 7.85, du)).toBeCloseTo(7850, 6);
    expect(densityKgM3(f, 2.7, 0)).toBeCloseTo(2700, 9);
    expect(densityKgM3(f, 7850, 0)).toBe(7850);
    expect(densityKgM3(f, -1, 0)).toBeNull();
  });

  it('예제: 나무 마디에 속성과 자리 변환, 속성 줄(경로·재질·밀도·놓인 위치·회전)', () => {
    const s = stepToScene(sampleStepBytes());
    const doc = createDoc('s.stp', 1, { scene: s, ms: 0 });
    const root = doc.products[0]!;
    const plate = root.children[0]!;
    expect(plate.props).toMatchObject({ material: 'Aluminium 6061', density: 2700, items: [['Finish', 'Anodized']] });
    expect(plate.props!.description).toContain('20 × 10 × 2');
    // 블록-2는 45° 돌려 놓았다
    const block2 = root.children[2]!;
    const pl = placementOf(block2.matrix);
    expect(pl.angleDeg).toBeCloseTo(45, 6);
    expect(pl.axis).toEqual([0, 0, 1]);
    expect(pl.origin).toEqual([15.5, 3, 2]);
    const path = nodePath(doc.products, '0/2');
    expect(path.map((n) => n.name)).toEqual(['OpenCAD 예제 조립', '블록']);
    expect(pathText(path)).toBe('OpenCAD 예제 조립 › 블록 · 블록-2');
    const rows = partRows(path, new Fmt('mm'), 2);
    const get = (k: string) => rows.find((r) => r.k === k)?.v;
    expect(get('재질')).toBe('Steel S45C');
    expect(get('밀도')).toBe('7.85 g/cm³ (7850 kg·m^-3)');
    expect(get('놓인 수')).toBe('×2');
    expect(get('놓인 위치')).toBe('15.5, 3, 2 mm');
    expect(get('회전')).toBe('45° · 축 0, 0, 1');
    expect(productAt(doc.products, '0/2')).toBe(block2);
    // 단위 행렬 자리는 위치·회전 줄이 없다
    expect(partRows(nodePath(doc.products, '0'), new Fmt('mm')).some((r) => r.k === '놓인 위치')).toBe(false);
    expect((s.meta as unknown as StepMeta).products[0]!.children[0]!.props?.material).toBe('Aluminium 6061');
  });

  it('placementOf: 180° 회전과 배율', () => {
    const m = [-2, 0, 0, 0, 0, -2, 0, 0, 0, 0, 2, 0, 1, 2, 3, 1];
    const p = placementOf(m);
    expect(p.angleDeg).toBeCloseTo(180, 6);
    expect(p.axis![2]).toBeCloseTo(1, 6);
    expect(p.scale).toBeCloseTo(2, 9);
    expect(placementOf(undefined)).toEqual({ origin: [0, 0, 0], axis: null, angleDeg: 0, scale: 1 });
  });

  it('placementOf: 축의 x가 0인 180° 회전도 축 부호가 맞고, 180° 가까운 각·여러 축에서 축·각을 되살린다', () => {
    // 로드리게스: R = cosθ·I + sinθ·[n]× + (1 − cosθ)·n nᵀ (열 우선 4×4)
    const rot = (n: [number, number, number], deg: number, s = 1): number[] => {
      const l = Math.hypot(...n);
      const [x, y, z] = n.map((q) => q / l) as [number, number, number];
      const t = (deg * Math.PI) / 180;
      const c = Math.cos(t);
      const si = Math.sin(t);
      const C = 1 - c;
      const R = [
        [c + x * x * C, x * y * C - z * si, x * z * C + y * si],
        [y * x * C + z * si, c + y * y * C, y * z * C - x * si],
        [z * x * C - y * si, z * y * C + x * si, c + z * z * C],
      ];
      const m = new Array<number>(16).fill(0);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[j * 4 + i] = R[i]![j]! * s;
      m[15] = 1;
      return m;
    };
    // 리뷰에서 본 경우: (0, 1, −1)/√2 둘레 180°가 "0, 0.707, 0.707"로 나왔다
    const p = placementOf(rot([0, 1, -1], 180));
    expect(p.angleDeg).toBeCloseTo(180, 9);
    const k = Math.SQRT1_2;
    // 180°는 축 n과 −n이 같은 회전: 두 성분의 부호가 서로 달라야 한다
    expect(Math.abs(p.axis![0])).toBeLessThan(1e-12);
    expect(Math.abs(p.axis![1])).toBeCloseTo(k, 12);
    expect(p.axis![1] * p.axis![2]).toBeCloseTo(-0.5, 12);
    for (const n of [
      [0, 1, -1],
      [1, -2, 3],
      [-3, 1, 0.5],
      [0, 0, 1],
      [1, 0, 0],
    ] as [number, number, number][])
      for (const deg of [30, 135, 170, 179.9, 179.9999]) {
        const q = placementOf(rot(n, deg, 2));
        const l = Math.hypot(...n);
        expect(q.angleDeg).toBeCloseTo(deg, 6);
        expect(q.scale).toBeCloseTo(2, 9);
        for (let i = 0; i < 3; i++) expect(q.axis![i]).toBeCloseTo(n[i]! / l, 6);
      }
  });
});
