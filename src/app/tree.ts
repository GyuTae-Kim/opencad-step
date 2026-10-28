/**
 * 제품 나무 펼침·고르기 대응(순수 함수, DOM 없음).
 * 마디는 경로 열쇠("0/2/1" = 첫 뿌리의 셋째 자식의 둘째 자식)로 가리킨다.
 * 몸체(형상 항목)가 둘 이상인 부품은 펼치면 자식 마디 앞에 몸체 줄을 둔다 — 열쇠 "마디 열쇠.차례"("0/2.3" = 그 부품의 셋째 몸체).
 */
import { hasBodies, productAt, productCountKey, productKeyOf, subtreeItemIds, subtreeMeshIds, type ProductNode } from './doc';

export interface TreeRow {
  key: string;
  /** 마디(몸체 줄이면 그 몸체가 놓인 부품 마디) */
  node: ProductNode;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  /** 이 마디와 그 아래 모든 그물 id(몸체 줄은 그 몸체 하나) */
  meshIds: string[];
  /** 이 마디와 그 아래 모든 그물·선 묶음 id(보이기·강조용) */
  itemIds: string[];
  /** 이름 거르기에서 이 마디가 맞았는지(조상이라 보이는 줄은 false) */
  match?: boolean;
  /** 몸체 줄이면 그 몸체의 차례(부품 마디 meshIds의 차례, 1부터) */
  body?: number;
}

/** 펼칠 것이 있는 마디: 자식 마디나 몸체 줄 */
const expandable = (n: ProductNode): boolean => n.children.length > 0 || hasBodies(n);

/** 부품 마디의 몸체 줄(match: 이름 거르기에서 맞은 몸체만 보일 때 그 판정) */
function bodyRows(n: ProductNode, key: string, depth: number, match?: (i: number) => boolean): TreeRow[] {
  const out: TreeRow[] = [];
  n.meshIds.forEach((id, i) => {
    const m = match?.(i);
    if (m === false) return;
    out.push({ key: `${key}.${i + 1}`, node: n, depth, hasChildren: false, open: false, meshIds: [id], itemIds: [id], body: i + 1, ...(m ? { match: true } : {}) });
  });
  return out;
}

/** 펼친 마디만 따라 보이는 줄을 만든다(limit 줄까지, 넘치면 truncated, total은 제한 없이 센 줄 수) */
export function visibleRows(roots: readonly ProductNode[], expanded: ReadonlySet<string>, limit = 3000): { rows: TreeRow[]; truncated: boolean; total: number } {
  const rows: TreeRow[] = [];
  let truncated = false;
  let total = 0;
  const push = (r: TreeRow) => {
    total++;
    if (rows.length < limit) rows.push(r);
    else truncated = true;
  };
  const walk = (nodes: readonly ProductNode[], prefix: string, depth: number): void => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const key = prefix ? `${prefix}/${i}` : String(i);
      const kids = expandable(n);
      const open = kids && expanded.has(key);
      total++;
      // 넘친 뒤에는 줄 수만 센다(마디 아래 id 모으기를 하지 않게)
      if (rows.length < limit) rows.push({ key, node: n, depth, hasChildren: kids, open, meshIds: subtreeMeshIds(n), itemIds: subtreeItemIds(n) });
      else truncated = true;
      if (!open) continue;
      if (hasBodies(n)) for (const r of bodyRows(n, key, depth + 1)) push(r);
      walk(n.children, key, depth + 1);
    }
  };
  walk(roots, '', 0);
  return { rows, truncated, total };
}

/** 이름 거르기 글이 마디에 맞는지(이름·자리 이름·제품 번호, 대소문자 무시) */
export function nodeMatches(n: ProductNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return n.name.toLowerCase().includes(q) || (n.instance ?? '').toLowerCase().includes(q) || n.productId.toLowerCase().includes(q);
}

/**
 * 이름 거르기: 맞는 마디와 그 조상만(조상은 펼쳐서) 줄로 만든다. 맞는 마디의 자식은 펼친 것만 따른다.
 * matches는 맞은 마디 수(제한 없이), rows는 limit 줄까지.
 * bodyName(부품 마디, 몸체 차례 0부터)을 주면 이름 있는 몸체도 거른다(맞은 몸체 줄과 그 부품·조상을 보인다).
 */
export function filterRows(
  roots: readonly ProductNode[],
  query: string,
  expanded: ReadonlySet<string>,
  limit = 3000,
  bodyName?: (n: ProductNode, i: number) => string,
): { rows: TreeRow[]; truncated: boolean; total: number; matches: number } {
  const rows: TreeRow[] = [];
  let truncated = false;
  let total = 0;
  let matches = 0;
  const q = query.trim().toLowerCase();
  const bodyHit = (n: ProductNode, i: number) => !!q && !!bodyName?.(n, i).toLowerCase().includes(q);
  // 1) 아래에 맞는 마디가 있는지(열쇠별), 맞은 몸체가 있는 부품
  const hit = new Map<string, boolean>();
  const bodyHits = new Set<string>();
  const mark = (nodes: readonly ProductNode[], prefix: string): boolean => {
    let any = false;
    nodes.forEach((n, i) => {
      const key = prefix ? `${prefix}/${i}` : String(i);
      const self = nodeMatches(n, query);
      if (self) matches++;
      if (hasBodies(n) && bodyName)
        n.meshIds.forEach((_, j) => {
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
  // 2) 줄
  const push = (r: TreeRow) => {
    total++;
    if (rows.length < limit) rows.push(r);
    else truncated = true;
  };
  const walk = (nodes: readonly ProductNode[], prefix: string, depth: number, all: boolean): void => {
    nodes.forEach((n, i) => {
      const key = prefix ? `${prefix}/${i}` : String(i);
      if (!all && !hit.get(key)) return;
      const self = nodeMatches(n, query);
      const childHit = bodyHits.has(key) || n.children.some((_, j) => hit.get(`${key}/${j}`));
      const kids = expandable(n);
      // 맞은 마디 아래는 보통 나무처럼(펼친 것만), 조상은 맞은 쪽으로 펼친다
      const open = kids && (all || self ? expanded.has(key) || (!all && childHit) : childHit);
      push({ key, node: n, depth, hasChildren: kids, open, meshIds: subtreeMeshIds(n), itemIds: subtreeItemIds(n), match: self && !all });
      if (!open) return;
      const sub = all || (self && !childHit);
      // 몸체 줄: 보통 나무처럼이면 모두, 아니면 맞은 몸체만
      if (hasBodies(n)) for (const r of bodyRows(n, key, depth + 1, sub ? undefined : (j) => bodyHit(n, j))) push(r);
      walk(n.children, key, depth + 1, sub);
    });
  };
  walk(roots, '', 0, false);
  return { rows, truncated, total, matches };
}

/** 조상 열쇠들("0/2/1" → ["0", "0/2"]) */
export function ancestorKeys(key: string): string[] {
  const parts = key.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

/** 마디가 보이도록 조상을 펼친 새 집합 */
export function revealKey(expanded: ReadonlySet<string>, key: string): Set<string> {
  const out = new Set(expanded);
  for (const k of ancestorKeys(key)) out.add(k);
  return out;
}

/** 펼칠 수 있는 모든 마디 열쇠(limit개까지 — 몸체가 여럿인 부품도) */
export function allExpandableKeys(roots: readonly ProductNode[], limit = 20000): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: readonly ProductNode[], prefix: string): void => {
    nodes.forEach((n, i) => {
      if (out.size >= limit || !expandable(n)) return;
      const key = prefix ? `${prefix}/${i}` : String(i);
      out.add(key);
      walk(n.children, key);
    });
  };
  walk(roots, '');
  return out;
}

/** 열쇠 펼침 뒤집기 */
export function toggleKey(expanded: ReadonlySet<string>, key: string): Set<string> {
  const out = new Set(expanded);
  if (out.has(key)) out.delete(key);
  else out.add(key);
  return out;
}

/** 나무 줄 이름: "제품 · 자리 이름"(자리 이름이 제품 이름과 다를 때) */
export function nodeLabel(n: ProductNode): { name: string; instance: string } {
  const name = n.name || n.productId || '(이름 없음)';
  const instance = n.instance && n.instance !== n.name ? n.instance : '';
  return { name, instance };
}

/** 마디가 보이는지: 그물이 하나라도 보이면 보임(그물이 없으면 보임으로 친다) */
export function nodeVisible(meshIds: readonly string[], isVisible: (id: string) => boolean): boolean {
  return meshIds.length === 0 || meshIds.some((id) => isVisible(id));
}

/** 마디 제품의 인스턴스 수(제품 이름·번호로 찾는다) */
export function nodeInstances(n: ProductNode, counts: ReadonlyMap<string, number>): number {
  return counts.get(productCountKey(n.name, n.productId)) ?? 0;
}

/**
 * 3D에서 고른 그물 → 나무에서 고를 열쇠와 새 펼침(못 찾으면 null).
 * body면(몸체 단위) 몸체가 여럿인 부품 마디도 펼쳐 그 몸체 줄이 보이게 한다
 */
export function selectFromPick(roots: readonly ProductNode[], expanded: ReadonlySet<string>, meshId: string, body = false): { key: string; expanded: Set<string> } | null {
  const key = productKeyOf(roots, meshId);
  if (!key) return null;
  const out = revealKey(expanded, key);
  if (body && hasBodies(productAt(roots, key)!)) out.add(key);
  return { key, expanded: out };
}
