import { describe, expect, it } from 'vitest';
import type { Scene3d } from 'opencad-viewer3d/types';
import {
  createDoc,
  defaultExpanded,
  docStatus,
  instanceCounts,
  partCount,
  productAt,
  productKeyOf,
  schemaSummary,
  selectionMeshIds,
  sceneCounts,
  stepInfo,
  stepProducts,
  stepSchemaLabel,
  subtreeMeshIds,
  unitLabel,
  type ProductNode,
} from '../../src/app/doc';
import { translate } from '../../site/i18n.mjs';
import { SAMPLE_NAME, sampleStepBytes } from '../../src/app/sample';
import { stepToScene } from '../../src/index';

const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], instance?: string): ProductNode => ({
  name,
  productId: name.toUpperCase(),
  meshIds,
  children,
  ...(instance ? { instance } : {}),
});

const tree: ProductNode[] = [N('asm', [], [N('a', ['m1']), N('b', ['m2', 'm3'], [N('c', ['m4'])]), N('d')])];

describe('제품 나무 도움', () => {
  it('subtreeMeshIds·productKeyOf·productAt', () => {
    expect(subtreeMeshIds(tree[0]!)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(productKeyOf(tree, 'm1')).toBe('0/0');
    expect(productKeyOf(tree, 'm3')).toBe('0/1');
    expect(productKeyOf(tree, 'm4')).toBe('0/1/0');
    expect(productKeyOf(tree, 'zz')).toBeNull();
    expect(productAt(tree, '0/1/0')!.name).toBe('c');
    expect(productAt(tree, '0')!.name).toBe('asm');
    expect(productAt(tree, '0/9')).toBeNull();
    expect(productAt(tree, '')).toBeNull();
    expect(productAt(tree, 'x/1')).toBeNull();
  });

  it('selectionMeshIds: 마디면 그 아래 모두, 아니면 3D에서 고른 그물', () => {
    expect(selectionMeshIds({ products: tree, selKey: '0/1', pick: null })).toEqual(['m2', 'm3', 'm4']);
    expect(selectionMeshIds({ products: tree, selKey: '0', pick: null })).toEqual(['m1', 'm2', 'm3', 'm4']);
    const pick = { kind: 'mesh' as const, id: 'm9', index: 0, point: [0, 0, 0] as [number, number, number] };
    expect(selectionMeshIds({ products: tree, selKey: null, pick })).toEqual(['m9']);
    expect(selectionMeshIds({ products: tree, selKey: '0/0', pick })).toEqual(['m1']);
    expect(selectionMeshIds({ products: tree, selKey: null, pick: { ...pick, kind: 'line' } })).toEqual([]);
    expect(selectionMeshIds({ products: tree, selKey: '0/2', pick: null })).toEqual([]);
    expect(selectionMeshIds({ products: tree, selKey: '9', pick: null })).toEqual([]);
  });

  it('partCount: 형상이 바로 놓인 마디 수', () => {
    expect(partCount(tree)).toBe(3);
    expect(partCount([])).toBe(0);
  });

  it('defaultExpanded: 뿌리 하나면 두 단계, 여럿이면 뿌리만', () => {
    expect([...defaultExpanded(tree)].sort()).toEqual(['0', '0/1']);
    const two = [N('x', [], [N('y', [], [N('z', ['m'])])]), N('w', ['n'])];
    expect([...defaultExpanded(two)]).toEqual(['0']);
  });
});

describe('meta 읽기', () => {
  it('stepProducts: 꼴이 어긋난 자료를 건너뛴다', () => {
    const scene: Scene3d = {
      name: 's',
      units: 'mm',
      meshes: [],
      lines: [],
      meta: { products: [{ name: 'r', productId: 7, meshIds: ['a', 1], children: [null, { name: 'k', instance: 'k-1' }], instance: '' }, 'bad'] },
    };
    const p = stepProducts(scene);
    expect(p).toHaveLength(1);
    expect(p[0]).toEqual({ name: 'r', productId: '7', meshIds: ['a', '1'], children: [{ name: 'k', productId: '', meshIds: [], children: [], instance: 'k-1' }] });
    expect(stepProducts({ ...scene, meta: undefined })).toEqual([]);
  });

  it('stepInfo: meta가 없어도 기본값', () => {
    const i = stepInfo({ name: 's', units: 'unknown', meshes: [], lines: [] });
    expect(i).toEqual({ schema: [], header: null, lengthUnit: '', entityCount: null, stats: null, productCounts: [] });
  });

  it('스키마 짧은 이름', () => {
    expect(stepSchemaLabel('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }')).toBe('AP214');
    expect(stepSchemaLabel('CONFIG_CONTROL_DESIGN')).toBe('AP203');
    expect(stepSchemaLabel('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }')).toBe('AP242');
    expect(stepSchemaLabel('AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_OF_MECHANICAL_PARTS_AND_ASSEMBLIES_MIM_LF')).toBe('AP203');
    expect(stepSchemaLabel('SOMETHING_ELSE { 1 2 }')).toBe('SOMETHING_ELSE');
    expect(schemaSummary(['AUTOMOTIVE_DESIGN', 'AUTOMOTIVE_DESIGN_CC2', 'CONFIG_CONTROL_DESIGN'])).toBe('AP214, AP203');
    expect(schemaSummary([])).toBe('');
  });

  it('unitLabel·sceneCounts', () => {
    expect(unitLabel('mm')).toBe('mm');
    expect(unitLabel('inch')).toBe('in');
    expect(unitLabel('m')).toBe('m');
    expect(unitLabel('unknown')).toBe('');
    const s: Scene3d = {
      name: 's',
      units: 'mm',
      lines: [],
      meshes: [
        { id: 'a', positions: new Float32Array(9), color: [1, 1, 1, 1] },
        { id: 'b', positions: new Float32Array(12), indices: new Uint32Array(6), color: [1, 1, 1, 1] },
      ],
    };
    expect(sceneCounts(s)).toEqual({ triangles: 3, meshes: 2 });
  });
});

describe('예제 문서', () => {
  const scene = stepToScene(sampleStepBytes(), { name: SAMPLE_NAME });
  const doc = createDoc(SAMPLE_NAME, 23_000, { scene, ms: 42 });

  it('createDoc: 제품 나무·정보·처음 상태', () => {
    expect(doc.products[0]!.name).toBe('OpenCAD 예제 조립');
    expect(doc.info.header!.name).toBe(SAMPLE_NAME);
    expect(doc.info.stats!.failedFaces).toBe(0);
    expect(doc.info.lengthUnit).toBe('millimetre');
    expect(doc.panelTab).toBe('tree');
    expect(doc.selKey).toBeNull();
    expect([...doc.expanded].sort()).toEqual(['0', '0/3']);
    expect(instanceCounts(doc.info).get('블록\u0000블록')).toBe(2);
    expect(instanceCounts(doc.info).get('핀\u0000핀')).toBe(1);
  });

  it('docStatus: 형식·스키마·단위·크기·삼각형·부품·시간', () => {
    const items = docStatus(doc).map((x) => x.text);
    expect(items[0]).toBe('STEP');
    expect(items[1]).toBe('AP214');
    expect(items[2]).toBe('단위 mm');
    expect(items[3]).toBe('22.5 KB');
    expect(items[4]).toMatch(/^삼각형 [\d,]+$/);
    expect(items[5]).toBe('부품 5');
    expect(items[6]).toBe('읽기 42 ms');
  });

  it('docStatus 읽기 시간 말풍선: 다른 언어에서 해석·삼각화 조각까지 그 언어로', () => {
    const title = docStatus(doc).at(-1)!.title!;
    expect(title).toMatch(/^해석 .+ · 삼각화 .+ · 워커 전체 .+ · 화면까지 /);
    const plain = docStatus({ ...doc, info: { ...doc.info, stats: null } }).at(-1)!.title!;
    expect(plain).toMatch(/^워커 전체 .+ · 화면까지 /);
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) for (const t of [title, plain]) expect(translate(t, lang), `${lang}: ${t}`).not.toMatch(/[가-힣]/);
    expect(translate(title, 'en')).toMatch(/^Parse .+ · Triangulation .+ · Worker total 42 ms · To screen /);
  });
});
