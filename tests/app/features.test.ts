import { describe, expect, it } from 'vitest';
import type { Scene3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { createDoc, productKeyOf, selectionItemIds, stepFaceIndex, stepLayers, stepPmi, stepProducts, subtreeItemIds, type ProductNode } from '../../src/app/doc';
import { faceAt, faceDetails, faceKindLabel } from '../../src/app/faces';
import { clampPanelWidth, clampSheetHeight } from '../../src/app/resize';
import { sampleStepBytes } from '../../src/app/sample';
import { filterRows, nodeMatches, visibleRows } from '../../src/app/tree';
import { NO_LAYER, Visibility } from '../../src/app/visibility';
import { cube, cylinder, StepText } from '../stepText';

const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], instance?: string): ProductNode => ({
  name,
  productId: `P-${name}`,
  meshIds,
  children,
  ...(instance ? { instance } : {}),
});

describe('제품 나무 이름 거르기·줄 수', () => {
  const roots: ProductNode[] = [
    N('asm', [], [N('bolt', ['m1'], [], 'bolt-1'), N('sub', [], [N('nut', ['m2'], [], 'nut-1'), N('bolt', ['m3'], [], 'bolt-2')]), N('plate', ['m4'], [N('rib', ['m5'])])]),
  ];

  it('nodeMatches: 이름·자리 이름·제품 번호, 대소문자 무시, 빈 글은 모두', () => {
    expect(nodeMatches(roots[0]!.children[0]!, 'BOLT')).toBe(true);
    expect(nodeMatches(roots[0]!.children[0]!, 'bolt-1')).toBe(true);
    expect(nodeMatches(roots[0]!.children[0]!, 'p-bolt')).toBe(true);
    expect(nodeMatches(roots[0]!.children[0]!, 'nut')).toBe(false);
    expect(nodeMatches(roots[0]!, '  ')).toBe(true);
  });

  it('맞는 마디와 조상만(조상은 펼침), 맞은 수', () => {
    const r = filterRows(roots, 'bolt', new Set());
    expect(r.rows.map((x) => [x.key, x.match])).toEqual([
      ['0', false],
      ['0/0', true],
      ['0/1', false],
      ['0/1/1', true],
    ]);
    expect(r.matches).toBe(2);
    expect(r.rows[2]!.open).toBe(true);
    expect(filterRows(roots, 'zzz', new Set()).rows).toEqual([]);
  });

  it('맞은 마디 아래는 펼친 것만 보통 나무처럼', () => {
    const closed = filterRows(roots, 'plate', new Set());
    expect(closed.rows.map((x) => x.key)).toEqual(['0', '0/2']);
    expect(closed.rows[1]!.open).toBe(false);
    const open = filterRows(roots, 'plate', new Set(['0/2']));
    expect(open.rows.map((x) => [x.key, x.match])).toEqual([
      ['0', false],
      ['0/2', true],
      ['0/2/0', false],
    ]);
  });

  it('visibleRows·filterRows의 total은 제한 없이 센다, itemIds는 선 묶음도', () => {
    const all = new Set(['0', '0/1', '0/2']);
    const r = visibleRows(roots, all, 3);
    expect(r.rows).toHaveLength(3);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(7);
    const withLines: ProductNode[] = [{ ...N('w', ['m1']), lineIds: ['l1'] }];
    expect(visibleRows(withLines, new Set()).rows[0]!.itemIds).toEqual(['m1', 'l1']);
    expect(visibleRows(withLines, new Set()).rows[0]!.meshIds).toEqual(['m1']);
  });
});

describe('보이기 상태', () => {
  it('눈 단추·레이어(레이어 없음 포함)·PMI를 함께 따진다', () => {
    const v = new Visibility(new Map([['m1', 0], ['p1', 1]]), new Set(['p1', 'p2']), true);
    expect(['m1', 'm2', 'p1', 'p2'].map((id) => v.visible(id))).toEqual([true, true, true, true]);
    v.setLayer(0, false);
    expect(v.visible('m1')).toBe(false);
    expect(v.hiddenBy('m1')).toBe('layer');
    v.setLayer(NO_LAYER, false);
    expect(v.visible('m2')).toBe(false);
    expect(v.visible('p2')).toBe(false); // 레이어 없는 PMI
    v.setLayer(NO_LAYER, true);
    v.pmiOff = true;
    expect(v.visible('p2')).toBe(false);
    expect(v.hiddenBy('p2')).toBe('pmi');
    v.pmiOff = false;
    v.setPmi('p2', false);
    expect(v.visible('p2')).toBe(false);
    v.setUser(['m2'], false);
    expect(v.hiddenBy('m2')).toBe('user');
    v.setUser(['m2'], true);
    expect(v.visible('m2')).toBe(true);
    // 레이어가 없는 문서는 레이어를 따지지 않는다
    const nl = new Visibility(new Map(), new Set(), false);
    nl.setLayer(NO_LAYER, false);
    expect(nl.visible('x')).toBe(true);
  });
});

describe('패널 크기 자르기', () => {
  it('폭 240~720, 창의 70% 이하 · 시트 높이 120 이상, 보기 120 남김', () => {
    expect(clampPanelWidth(100, 1400)).toBe(240);
    expect(clampPanelWidth(500.4, 1400)).toBe(500);
    expect(clampPanelWidth(900, 1400)).toBe(720);
    expect(clampPanelWidth(900, 800)).toBe(560);
    expect(clampSheetHeight(50, 700)).toBe(120);
    expect(clampSheetHeight(650, 700)).toBe(580);
    expect(clampSheetHeight(300, 700)).toBe(300);
  });
});

describe('문서 meta 읽기(레이어·PMI·면 표·선 묶음)', () => {
  const scene = stepToScene(sampleStepBytes());
  // 워커가 넘기는 것처럼 구조적 복제를 거친다
  const copy = structuredClone(scene) as Scene3d;

  it('예제: 레이어 셋, PMI(표현 2·의미 4), 면 표', () => {
    const layers = stepLayers(copy);
    expect(layers.map((l) => [l.name, l.itemIds.length, l.visible])).toEqual([
      ['본체', 3, true],
      ['체결 부품', 2, true],
      ['PMI 주석', 2, true],
    ]);
    const pmi = stepPmi(copy);
    expect(pmi.presentations.map((p) => p.plane)).toEqual(['바닥 평면', '윗면']);
    expect(pmi.semantic.map((x) => x.value)).toEqual(['20 mm ±0.1', '4 mm +0.05/0', '0.02 mm', 'A']);
    const fx = stepFaceIndex(copy)!;
    expect(fx.tableOf.size).toBe(5);
    expect(fx.tableOf.get(copy.meshes[1]!.id)).toBe(fx.tableOf.get(copy.meshes[2]!.id));
    const d = createDoc('s.stp', 10, { scene: copy, ms: 1 });
    expect(d.layers).toHaveLength(3);
    expect(d.vis.pmiIds.size).toBe(2);
    expect(d.faces).not.toBeNull();
  });

  it('꼴이 틀리면 빈 값', () => {
    const bad: Scene3d = { name: 'x', units: 'mm', meshes: [], lines: [], meta: { layers: 3, pmi: 'no', faceTables: [{}], faceKinds: [], meshFaceTable: new Int32Array(0) } };
    expect(stepLayers(bad)).toEqual([]);
    expect(stepPmi(bad)).toEqual({ presentations: [], semantic: [] });
    expect(stepFaceIndex(bad)).toBeNull();
  });

  it('파일이 숨긴 레이어는 처음부터 꺼진다', () => {
    const w = new StepText();
    const ctx = w.context();
    const a = cube(w, 1).solid;
    w.product('p', [a], ctx);
    const l = w.add('PRESENTATION_LAYER_ASSIGNMENT', `'off','',(#${a})`);
    w.add('INVISIBILITY', `(#${l})`);
    const s = stepToScene(w.bytes());
    const d = createDoc('p.stp', 1, { scene: s, ms: 1 });
    expect(d.vis.visible(s.meshes[0]!.id)).toBe(false);
    expect(d.vis.hiddenBy(s.meshes[0]!.id)).toBe('layer');
  });

  it('선 묶음 id: stepProducts가 읽고, 나무·고르기가 쓴다', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('wire', [w.circle([0, 0, 0], 2)], ctx, 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION');
    const s = structuredClone(stepToScene(w.bytes())) as Scene3d;
    const roots = stepProducts(s);
    const lid = s.lines[0]!.id;
    expect(roots[0]!.lineIds).toEqual([lid]);
    expect(subtreeItemIds(roots[0]!)).toEqual([lid]);
    expect(productKeyOf(roots, lid)).toBe('0');
    expect(selectionItemIds({ products: roots, selKey: '0', pick: null, items: null })).toEqual([lid]);
    expect(selectionItemIds({ products: roots, selKey: null, pick: null, items: { ids: ['a', 'b'], label: 'x' } })).toEqual(['a', 'b']);
    expect(selectionItemIds({ products: roots, selKey: null, pick: { kind: 'line', id: lid, index: 0, point: [0, 0, 0] }, items: null })).toEqual([lid]);
  });
});

describe('면 고르기', () => {
  it('faceAt: 이분 탐색, 삼각형 없는 면은 건너뛰고 범위 밖은 -1', () => {
    const t = { triStart: Uint32Array.from([0, 2, 2, 5, 9]) };
    expect([0, 1, 2, 4, 5, 8].map((tri) => faceAt(t, tri))).toEqual([0, 0, 2, 2, 3, 3]);
    expect(faceAt(t, 9)).toBe(-1);
    expect(faceAt(t, -1)).toBe(-1);
    expect(faceAt({ triStart: new Uint32Array([0]) }, 0)).toBe(-1);
  });

  it('정육면체 윗면: 평면·넓이 100·둘레 40·경계 4변·바깥 법선(+자리 변환)', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cube(w, 10).solid], ctx);
    const at = w.ax2([100, 0, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    const s = stepToScene(w.bytes());
    const fx = stepFaceIndex(s)!;
    const mesh = s.meshes[0]!;
    const table = fx.tables[fx.tableOf.get(mesh.id)!]!;
    // 둘째 면 = 윗면(+Z)
    const fp = faceDetails(mesh, table, 1, fx.kinds)!;
    expect(fp.kind).toBe('plane');
    expect(faceKindLabel(fp.kind)).toBe('평면');
    expect(fp.area).toBeCloseTo(100, 6);
    expect(fp.perimeter).toBeCloseTo(40, 6);
    expect(fp.boundary.length / 6).toBe(4);
    expect(fp.normal).toEqual([0, 0, 1]);
    expect(fp.center[0]).toBeCloseTo(105, 6);
    expect(fp.center[2]).toBeCloseTo(10, 6);
    for (let i = 0; i < fp.boundary.length; i += 3) expect(fp.boundary[i]!).toBeGreaterThanOrEqual(100);
    expect(faceAt(table, 3)).toBe(1);
  });

  it('큰 좌표(묶음 원점) 그물: 세계 좌표로 넓이·가운데, 경계는 면 가운데 기준', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('far', [cube(w, 10, [3e6, 0, 0]).solid], ctx);
    const s = stepToScene(w.bytes());
    const fx = stepFaceIndex(s)!;
    const mesh = s.meshes[0]!;
    expect(mesh.origin).toBeDefined();
    const fp = faceDetails(mesh, fx.tables[0]!, 1, fx.kinds)!;
    expect(fp.area).toBeCloseTo(100, 4);
    expect(fp.center[0]).toBeCloseTo(3e6 + 5, 4);
    expect(fp.boundaryOrigin).toEqual(fp.center);
    for (const v of fp.boundary) expect(Math.abs(v)).toBeLessThanOrEqual(5 + 1e-6);
    expect(fp.normal).toEqual([0, 0, 1]);
  });

  it('원기둥 옆면: 반지름·축, 이음선은 경계가 아니다(위아래 원만)', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('cyl', [cylinder(w, 2, 5)], ctx);
    const s = stepToScene(w.bytes());
    const fx = stepFaceIndex(s)!;
    const mesh = s.meshes[0]!;
    const table = fx.tables[0]!;
    const fp = faceDetails(mesh, table, 2, fx.kinds)!;
    expect(fp.kind).toBe('cylinder');
    expect(fp.radius).toBeCloseTo(2, 6);
    expect(fp.axis).toEqual([0, 0, 1]);
    expect(fp.area).toBeCloseTo(2 * Math.PI * 2 * 5, 0);
    // 경계 점은 모두 z=0 또는 z=5(이음선 x=2,y=0 세로 변 없음)
    for (let i = 0; i < fp.boundary.length; i += 6) {
      const z1 = fp.boundary[i + 2]!;
      const z2 = fp.boundary[i + 5]!;
      expect(Math.abs(z1 - z2)).toBeLessThan(1e-6);
    }
    expect(fp.perimeter).toBeCloseTo(2 * 2 * Math.PI * 2, 0);
    // 원기둥 윗면 뚜껑: 평면, 둘레 = 원주
    const top = faceDetails(mesh, table, 1, fx.kinds)!;
    expect(top.normal).toEqual([0, 0, 1]);
    expect(top.perimeter).toBeCloseTo(2 * Math.PI * 2, 1);
  });
});
