import { describe, expect, it } from 'vitest';
import { defaultExpanded, type ProductNode } from '../../src/app/doc';
import { allExpandableKeys, ancestorKeys, filterRows, nodeInstances, nodeLabel, nodeVisible, revealKey, selectFromPick, toggleKey, visibleRows } from '../../src/app/tree';

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

describe('몸체 줄(한 부품 안에 입체가 여럿)', () => {
  // 부품 "multi"는 몸체 셋(m5·m6·m7), 부품 "one"은 몸체 하나(m8) — 하위 조립 "sub"는 자기 몸체 둘(m9·m10)과 자식 하나
  const tree: ProductNode[] = [N('asm', [], [N('multi', ['m5', 'm6', 'm7'], [], 'multi-1'), N('one', ['m8']), N('sub', ['m9', 'm10'], [N('one', ['m11'])])])];
  const names: Record<string, string> = { m5: 'bolt', m6: '', m7: 'nut', m9: '', m10: 'cover' };
  const bodyName = (n: ProductNode, i: number) => names[n.meshIds[i]!] ?? '';

  it('몸체가 둘 이상인 부품만 펼칠 수 있고, 펼치면 자식 마디 앞에 몸체 줄("마디.차례", 1부터)', () => {
    const closed = visibleRows(tree, new Set(['0']));
    expect(closed.rows.map((r) => [r.key, r.hasChildren])).toEqual([['0', true], ['0/0', true], ['0/1', false], ['0/2', true]]);
    const { rows, total } = visibleRows(tree, new Set(['0', '0/0', '0/1', '0/2']));
    expect(rows.map((r) => r.key)).toEqual(['0', '0/0', '0/0.1', '0/0.2', '0/0.3', '0/1', '0/2', '0/2.1', '0/2.2', '0/2/0']);
    expect(total).toBe(rows.length);
    const b = rows.find((r) => r.key === '0/0.2')!;
    expect(b).toMatchObject({ body: 2, depth: 2, hasChildren: false, meshIds: ['m6'], itemIds: ['m6'] });
    expect(b.node.name).toBe('multi');
    // 몸체 줄도 줄 수 제한에 든다
    const lim = visibleRows(tree, new Set(['0', '0/0']), 3);
    expect(lim.rows.map((r) => r.key)).toEqual(['0', '0/0', '0/0.1']);
    expect(lim).toMatchObject({ truncated: true, total: 7 });
  });

  it('모두 펼치기·처음 펼침·3D 고르기(몸체 단위면 그 부품까지 펼침)', () => {
    expect([...allExpandableKeys(tree)].sort()).toEqual(['0', '0/0', '0/2']);
    // 몸체가 여럿인 부품 하나짜리 파일은 처음부터 몸체 줄을 보인다
    expect([...defaultExpanded([N('part', ['a', 'b'])])]).toEqual(['0']);
    expect([...defaultExpanded([N('part', ['a'])])]).toEqual([]);
    expect([...selectFromPick(tree, new Set(), 'm6')!.expanded]).toEqual(['0']);
    expect([...selectFromPick(tree, new Set(), 'm6', true)!.expanded].sort()).toEqual(['0', '0/0']);
    // 몸체 하나인 부품은 펼칠 것이 없다
    expect([...selectFromPick(tree, new Set(), 'm8', true)!.expanded]).toEqual(['0']);
  });

  it('이름 거르기: 이름 있는 몸체가 맞으면 그 몸체 줄과 부품·조상을 펼쳐 보인다(이름 없는 몸체는 거르지 않음)', () => {
    const r = filterRows(tree, 'nut', new Set(), 3000, bodyName);
    expect(r.matches).toBe(1);
    expect(r.rows.map((x) => [x.key, !!x.match])).toEqual([['0', false], ['0/0', false], ['0/0.3', true]]);
    // 부품 이름이 맞으면 보통 나무처럼(펼쳤으면 몸체 모두)
    const p = filterRows(tree, 'multi', new Set(['0/0']), 3000, bodyName);
    expect(p.rows.map((x) => x.key)).toEqual(['0', '0/0', '0/0.1', '0/0.2', '0/0.3']);
    expect(filterRows(tree, 'cover', new Set(), 3000, bodyName).rows.map((x) => x.key)).toEqual(['0', '0/2', '0/2.2']);
    // 몸체 이름을 모르면(bodyName 없음) 마디만
    expect(filterRows(tree, 'nut', new Set(), 3000).matches).toBe(0);
  });
});

/** 57차까지의 이름 거르기(경로 열쇠 글로 표를 적던 판) — 58차 판과 같은 줄을 내는지 견준다 */
function filterRowsOld(roots: readonly ProductNode[], query: string, expanded: ReadonlySet<string>, limit: number, bodyName?: (n: ProductNode, i: number) => string) {
  const nodeMatches = (n: ProductNode) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return n.name.toLowerCase().includes(q) || (n.instance ?? '').toLowerCase().includes(q) || n.productId.toLowerCase().includes(q);
  };
  const items = (n: ProductNode) => (n.lineIds?.length ? [...n.meshIds, ...n.lineIds] : n.meshIds);
  const bodies = (n: ProductNode) => n.meshIds.length + (n.lineIds?.length ?? 0) > 1;
  const expandable = (n: ProductNode) => n.children.length > 0 || bodies(n);
  const sub = (n: ProductNode, out: string[] = []): string[] => {
    out.push(...n.meshIds);
    for (const c of n.children) sub(c, out);
    return out;
  };
  const rows: { key: string; open: boolean; match: boolean; depth: number; meshIds: string[] }[] = [];
  let truncated = false;
  let total = 0;
  let matches = 0;
  const q = query.trim().toLowerCase();
  const bodyHit = (n: ProductNode, i: number) => !!q && !!bodyName?.(n, i).toLowerCase().includes(q);
  const hit = new Map<string, boolean>();
  const bodyHits = new Set<string>();
  const mark = (nodes: readonly ProductNode[], prefix: string): boolean => {
    let any = false;
    nodes.forEach((n, i) => {
      const key = prefix ? `${prefix}/${i}` : String(i);
      const self = nodeMatches(n);
      if (self) matches++;
      if (bodies(n) && bodyName)
        items(n).forEach((_, j) => {
          if (!bodyHit(n, j)) return;
          matches++;
          bodyHits.add(key);
        });
      const below = mark(n.children, key) || bodyHits.has(key);
      hit.set(key, self || below);
      if (self || below) any = true;
    });
    return any;
  };
  mark(roots, '');
  const push = (r: (typeof rows)[number]) => {
    total++;
    if (rows.length < limit) rows.push(r);
    else truncated = true;
  };
  const walk = (nodes: readonly ProductNode[], prefix: string, depth: number, all: boolean): void => {
    nodes.forEach((n, i) => {
      const key = prefix ? `${prefix}/${i}` : String(i);
      if (!all && !hit.get(key)) return;
      const self = nodeMatches(n);
      const childHit = bodyHits.has(key) || n.children.some((_, j) => hit.get(`${key}/${j}`));
      const kids = expandable(n);
      const open = kids && (all || self ? expanded.has(key) || (!all && childHit) : childHit);
      push({ key, open, match: self && !all, depth, meshIds: sub(n) });
      if (!open) return;
      const s = all || (self && !childHit);
      if (bodies(n))
        items(n).forEach((id, j) => {
          const m = s ? undefined : bodyHit(n, j);
          if (m === false) return;
          push({ key: `${key}.${j + 1}`, open: false, match: !!m, depth: depth + 1, meshIds: j < n.meshIds.length ? [id] : [] });
        });
      walk(n.children, key, depth + 1, s);
    });
  };
  walk(roots, '', 0, false);
  return { rows, truncated, total, matches };
}

describe('이름 거르기: 마디 객체 표(58차)', () => {
  it('무작위 나무·거르기 글·펼침·몸체 이름에서 예전 열쇠 글 판과 같은 줄·수', () => {
    let seed = 58;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const words = ['plate', 'Bolt', 'nut', 'asm', 'p7', 'p77', 'Frame'];
    let mid = 0;
    const make = (depth: number): ProductNode => {
      const kids = depth < 4 && rnd() < 0.6 ? Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => make(depth + 1)) : [];
      const meshes = Array.from({ length: Math.floor(rnd() * 3) }, () => `m${++mid}`);
      const n: ProductNode = { name: words[Math.floor(rnd() * words.length)]!, productId: `P${Math.floor(rnd() * 100)}`, meshIds: meshes, children: kids };
      if (rnd() < 0.5) n.instance = `p${Math.floor(rnd() * 100)}`;
      if (rnd() < 0.2) n.lineIds = [`l${++mid}`];
      return n;
    };
    for (let t = 0; t < 60; t++) {
      const shared = make(2);
      const roots = [make(0), make(1)];
      // 같은 마디 객체가 두 자리에 있어도(아래만 보는 값이라) 같아야 한다
      roots[0]!.children.push(shared);
      roots[1]!.children.push(shared);
      const expanded = new Set<string>();
      const walk = (ns: readonly ProductNode[], prefix: string) =>
        ns.forEach((n, i) => {
          const key = prefix ? `${prefix}/${i}` : String(i);
          if (rnd() < 0.5) expanded.add(key);
          walk(n.children, key);
        });
      walk(roots, '');
      const q = [...words, 'P1', 'x', ' ', 'BOLT', 'body'][t % 12]!;
      const body = t % 3 ? (n: ProductNode, i: number) => (i % 2 ? `body ${n.name}` : '') : undefined;
      const limit = t % 5 ? 3000 : 7;
      const a = filterRows(roots, q, expanded, limit, body);
      const b = filterRowsOld(roots, q, expanded, limit, body);
      expect(a.rows.map((r) => [r.key, r.open, !!r.match, r.depth, r.meshIds.join(',')])).toEqual(b.rows.map((r) => [r.key, r.open, r.match, r.depth, r.meshIds.join(',')]));
      expect([a.truncated, a.total, a.matches]).toEqual([b.truncated, b.total, b.matches]);
    }
  });
});
