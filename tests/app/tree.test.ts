import { describe, expect, it } from 'vitest';
import type { ProductNode } from '../../src/app/doc';
import { allExpandableKeys, ancestorKeys, nodeInstances, nodeLabel, nodeVisible, revealKey, selectFromPick, toggleKey, visibleRows } from '../../src/app/tree';

const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], instance?: string): ProductNode => ({
  name,
  productId: `P-${name}`,
  meshIds,
  children,
  ...(instance ? { instance } : {}),
});

const roots: ProductNode[] = [N('asm', [], [N('a', ['m1'], [], 'a-1'), N('sub', [], [N('c', ['m2']), N('c', ['m3'], [], 'c-2')], 'sub-1'), N('a', ['m4'], [], 'a-2')])];

describe('visibleRows', () => {
  it('펼친 마디만 따라 줄을 만든다', () => {
    const { rows, truncated } = visibleRows(roots, new Set(['0']));
    expect(truncated).toBe(false);
    expect(rows.map((r) => r.key)).toEqual(['0', '0/0', '0/1', '0/2']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 1]);
    expect(rows[0]!.open).toBe(true);
    expect(rows[2]!.hasChildren).toBe(true);
    expect(rows[2]!.open).toBe(false);
    expect(rows[2]!.meshIds).toEqual(['m2', 'm3']);
    expect(rows[0]!.meshIds).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('하위까지 펼치기와 줄 수 제한', () => {
    const all = allExpandableKeys(roots);
    expect([...all].sort()).toEqual(['0', '0/1']);
    expect(visibleRows(roots, all).rows.map((r) => r.key)).toEqual(['0', '0/0', '0/1', '0/1/0', '0/1/1', '0/2']);
    const lim = visibleRows(roots, all, 3);
    expect(lim.rows).toHaveLength(3);
    expect(lim.truncated).toBe(true);
    expect(visibleRows([], new Set()).rows).toEqual([]);
  });

  it('잎에 펼침 열쇠가 있어도 열린 것으로 보지 않는다', () => {
    const { rows } = visibleRows(roots, new Set(['0', '0/0']));
    expect(rows.find((r) => r.key === '0/0')!.open).toBe(false);
  });
});

describe('고르기 대응', () => {
  it('ancestorKeys·revealKey·toggleKey', () => {
    expect(ancestorKeys('0/1/1')).toEqual(['0', '0/1']);
    expect(ancestorKeys('3')).toEqual([]);
    const e = new Set<string>();
    expect([...revealKey(e, '0/1/1')].sort()).toEqual(['0', '0/1']);
    expect(e.size).toBe(0); // 원본은 그대로
    expect([...toggleKey(new Set(['0']), '0')]).toEqual([]);
    expect([...toggleKey(new Set(['0']), '0/1')].sort()).toEqual(['0', '0/1']);
  });

  it('3D에서 고른 그물 → 나무 열쇠와 조상 펼침', () => {
    const s = selectFromPick(roots, new Set(), 'm3');
    expect(s!.key).toBe('0/1/1');
    expect([...s!.expanded].sort()).toEqual(['0', '0/1']);
    expect(selectFromPick(roots, new Set(), 'nope')).toBeNull();
  });
});

describe('줄 글·보이기·인스턴스', () => {
  it('nodeLabel: 자리 이름이 제품 이름과 같거나 없으면 뺀다', () => {
    expect(nodeLabel(N('a', [], [], 'a-1'))).toEqual({ name: 'a', instance: 'a-1' });
    expect(nodeLabel(N('a', [], [], 'a'))).toEqual({ name: 'a', instance: '' });
    expect(nodeLabel({ name: '', productId: 'PID', meshIds: [], children: [] })).toEqual({ name: 'PID', instance: '' });
    expect(nodeLabel({ name: '', productId: '', meshIds: [], children: [] }).name).toBe('(이름 없음)');
  });

  it('nodeVisible: 하나라도 보이면 보임, 그물 없으면 보임', () => {
    const hidden = new Set(['m1', 'm2']);
    const vis = (id: string) => !hidden.has(id);
    expect(nodeVisible(['m1', 'm2'], vis)).toBe(false);
    expect(nodeVisible(['m1', 'm3'], vis)).toBe(true);
    expect(nodeVisible([], vis)).toBe(true);
  });

  it('nodeInstances: 제품 이름·번호로 센다', () => {
    const counts = new Map([[`P-a\u0000a`, 2]]);
    expect(nodeInstances(N('a'), counts)).toBe(2);
    expect(nodeInstances(N('c'), counts)).toBe(0);
  });
});
