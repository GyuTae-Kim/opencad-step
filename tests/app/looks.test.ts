import { describe, expect, it } from 'vitest';
import type { LineSet3d, Mesh3d, Rgba } from 'opencad-viewer3d/types';
import type { ProductNode } from '../../src/app/doc';
import { DIM_ALPHA, EXPLODE_SCALE, desiredLooks, explodeOffsets, lookKey, partColor, partPlacements } from '../../src/app/looks';

/** 한 변 2인 상자 그물(가운데 c) */
const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, productId: string, meshIds: string[], children: ProductNode[] = [], lineIds?: string[]): ProductNode => ({ name, productId, meshIds, children, ...(lineIds ? { lineIds } : {}) });

describe('부품 겉모습: 불투명도·흐리게·부품 색·분해', () => {
  const meshes = [box('a', [-10, 0, 0]), box('b', [10, 0, 0]), box('c', [0, 0, 0]), box('free', [0, 10, 0])];
  const products = [N('asm', 'A', [], [N('bolt', 'B', ['a']), N('bolt', 'B', ['b']), N('plate', 'P', ['c'])])];

  it('부품 자리: 나무 마디마다(선 묶음 포함), 나무에 없는 것은 하나씩', () => {
    const line: LineSet3d = { id: 'w', positions: new Float32Array(6), color: [1, 1, 1, 1] };
    const pl = partPlacements([...meshes, line], [N('asm', 'A', [], [N('bolt', 'B', ['a'], [], ['w']), N('plate', 'P', ['c'])])]);
    expect(pl.map((p) => p.ids)).toEqual([['a', 'w'], ['c'], ['b'], ['free']]);
  });

  it('부품 색: 같은 제품은 같은 색, 다른 제품은 다른 색(골든 각)', () => {
    const looks = desiredLooks({ items: meshes, products, opacity: new Map(), dim: null, partColors: true, explode: 0 });
    expect(looks.get('a')!.color).toEqual(looks.get('b')!.color);
    expect(looks.get('a')!.color).not.toEqual(looks.get('c')!.color);
    expect(looks.get('free')!.color).not.toEqual(looks.get('c')!.color);
    expect(looks.get('a')!.alpha).toBeNull();
    expect(looks.get('a')!.matrix).toBeNull();
    for (const c of [partColor(0), partColor(1), partColor(7)]) for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
    expect(partColor(0)).not.toEqual(partColor(1));
  });

  it('분해: 자리 가운데가 조립 가운데에서 멀어지는 쪽으로 (차이 × 1.5 × 비율), 0이면 겉모습 없음', () => {
    const off = explodeOffsets(meshes, partPlacements(meshes, products), 2);
    // 조립 범위 [-11,11]×[-1,11]×[-1,1] → 가운데 (0, 5, 0)
    expect(off.get('a')).toEqual([-20, -10, 0]);
    expect(off.get('free')).toEqual([0, 10, 0]);
    const looks = desiredLooks({ items: meshes, products, opacity: new Map(), dim: null, partColors: false, explode: 0.5 });
    expect(looks.get('b')!.matrix!.slice(12, 15)).toEqual([10 * 0.5 * EXPLODE_SCALE, -5 * 0.5 * EXPLODE_SCALE, 0]);
    expect(looks.get('b')!.color).toBeNull();
    expect(desiredLooks({ items: meshes, products, opacity: new Map(), dim: null, partColors: false, explode: 0 }).size).toBe(0);
  });

  it('불투명도·흐리게: 사용자 값(1이면 없음), 흐리게 하면 초점 밖은 DIM_ALPHA·고르기 빼기, PMI는 색·분해에서 빠진다', () => {
    const looks = desiredLooks({ items: meshes, products, opacity: new Map([['a', 0.5], ['b', 1]]), dim: new Set(['a']), partColors: true, explode: 1, fixed: new Set(['free']) });
    expect(looks.get('a')).toMatchObject({ alpha: 0.5, pickable: true });
    expect(looks.get('b')).toMatchObject({ alpha: DIM_ALPHA, pickable: false });
    expect(looks.get('free')).toEqual({ alpha: DIM_ALPHA, pickable: false, color: null, matrix: null });
    expect(lookKey(looks.get('a')!)).not.toBe(lookKey(looks.get('b')!));
    const la = looks.get('a')!;
    expect(lookKey({ ...la, color: la.color ? ([...la.color] as Rgba) : null })).toBe(lookKey(la));
  });
});
