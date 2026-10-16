/**
 * 제품 나무 펼침·고르기 대응(순수 함수, DOM 없음).
 * 마디는 경로 열쇠("0/2/1" = 첫 뿌리의 셋째 자식의 둘째 자식)로 가리킨다.
 */
import { productCountKey, productKeyOf, subtreeMeshIds, type ProductNode } from './doc';

export interface TreeRow {
  key: string;
  node: ProductNode;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  /** 이 마디와 그 아래 모든 그물 id */
  meshIds: string[];
}

/** 펼친 마디만 따라 보이는 줄을 만든다(limit 줄까지, 넘치면 truncated) */
export function visibleRows(roots: readonly ProductNode[], expanded: ReadonlySet<string>, limit = 3000): { rows: TreeRow[]; truncated: boolean } {
  const rows: TreeRow[] = [];
  let truncated = false;
  const walk = (nodes: readonly ProductNode[], prefix: string, depth: number): void => {
    for (let i = 0; i < nodes.length; i++) {
      if (rows.length >= limit) {
        truncated = true;
        return;
      }
      const n = nodes[i]!;
      const key = prefix ? `${prefix}/${i}` : String(i);
      const open = n.children.length > 0 && expanded.has(key);
      rows.push({ key, node: n, depth, hasChildren: n.children.length > 0, open, meshIds: subtreeMeshIds(n) });
      if (open) walk(n.children, key, depth + 1);
    }
  };
  walk(roots, '', 0);
  return { rows, truncated };
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

/** 펼칠 수 있는 모든 마디 열쇠(limit개까지) */
export function allExpandableKeys(roots: readonly ProductNode[], limit = 20000): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: readonly ProductNode[], prefix: string): void => {
    nodes.forEach((n, i) => {
      if (out.size >= limit || !n.children.length) return;
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

/** 3D에서 고른 그물 → 나무에서 고를 열쇠와 새 펼침(못 찾으면 null) */
export function selectFromPick(roots: readonly ProductNode[], expanded: ReadonlySet<string>, meshId: string): { key: string; expanded: Set<string> } | null {
  const key = productKeyOf(roots, meshId);
  if (!key) return null;
  return { key, expanded: revealKey(expanded, key) };
}
