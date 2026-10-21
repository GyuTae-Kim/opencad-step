/**
 * 부품 겉모습(순수, DOM 없음): 부품별 불투명도, 격리의 "나머지 흐리게", 부품 색 구분, 분해 보기를
 * 그물마다 코어 묶음 겉모습(Viewer3d.setItemOpacity·setItemColor·setItemMatrix)으로 바꾼다.
 *
 * - 불투명도: 사용자가 정한 값(0~1). 흐리게 하는 중이면 초점 밖 항목은 DIM_ALPHA로 흐리게 하고 고르기에서 뺀다
 * - 부품 색: 같은 제품(이름·제품 번호)은 같은 색 — 골든 각으로 색상환을 돈다(조립의 같은 부품을 알아보게)
 * - 분해: 그물이 놓인 나무 마디(부품 자리)마다 그 가운데가 조립 가운데에서 멀어지는 쪽으로 옮긴다(배율 EXPLODE_SCALE × 0~1)
 * 코어는 setScene마다 겉모습을 모두 풀므로 앱이 새 장면에 다시 건다(applyLooks).
 */
import { boxCenter, boxIsEmpty, emptyBox, itemBounds, unionBox } from 'opencad-viewer3d/bounds';
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba } from 'opencad-viewer3d/types';

/** 겉모습을 거는 묶음(그물·선·점) */
export type LookItem = Mesh3d | LineSet3d | PointSet3d;
import type { ProductNode } from './doc';

/** 흐리게 할 때 불투명도 */
export const DIM_ALPHA = 0.12;
/** 분해 100%에서 부품이 조립 가운데에서 떨어진 거리의 몇 배를 더 옮기는지 */
export const EXPLODE_SCALE = 1.5;
/** 불투명도 메뉴 값 */
export const OPACITY_STEPS = [1, 0.75, 0.5, 0.25, 0.1] as const;

/** 그물 하나의 겉모습(null = 바꾸지 않음) */
export interface Look {
  alpha: number | null;
  pickable: boolean;
  color: Rgba | null;
  matrix: number[] | null;
}

export interface LookInput {
  /** 장면의 모든 묶음(그물·선·점) */
  items: readonly LookItem[];
  products: readonly ProductNode[];
  /** 사용자가 정한 불투명도(그물 id → 0~1) */
  opacity: ReadonlyMap<string, number>;
  /** 흐리게 하는 중이면 초점 항목(그 밖은 흐리게) */
  dim: ReadonlySet<string> | null;
  partColors: boolean;
  /** 분해 0~1 */
  explode: number;
  /** 부품 색·분해에서 빼는 묶음(표현 PMI — 불투명도·흐리게만 따른다) */
  fixed?: ReadonlySet<string>;
}

/** 색상환 i번째 부품 색(골든 각, 채도·밝기 고정) */
export function partColor(i: number): Rgba {
  const h = ((i * 137.508) % 360) / 360;
  const s = 0.55;
  const l = 0.58;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3), 1];
}

/** 부품 자리(그물·선이 놓인 나무 마디)마다 묶음 id와 제품 열쇠. 나무에 없는 묶음은 하나씩 */
export function partPlacements(items: readonly Pick<LookItem, 'id'>[], products: readonly ProductNode[]): { ids: string[]; product: string }[] {
  const out: { ids: string[]; product: string }[] = [];
  const seen = new Set<string>();
  const known = new Set(items.map((m) => m.id));
  const walk = (list: readonly ProductNode[]) => {
    for (const n of list) {
      const ids = [...n.meshIds, ...(n.lineIds ?? [])].filter((id) => known.has(id) && !seen.has(id));
      if (ids.length) {
        for (const id of ids) seen.add(id);
        out.push({ ids, product: `${n.productId}\u0000${n.name}` });
      }
      walk(n.children);
    }
  };
  walk(products);
  for (const m of items) if (!seen.has(m.id)) out.push({ ids: [m.id], product: `\u0001${m.id}` });
  return out;
}

/** 분해 이동량: 부품 자리마다 (자리 가운데 − 조립 가운데) × k */
export function explodeOffsets(items: readonly LookItem[], places: readonly { ids: string[] }[], k: number): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  if (!(k > 0)) return out;
  const byId = new Map(items.map((m) => [m.id, m]));
  const boxes: Box3[] = places.map((pl) => {
    let b = emptyBox();
    for (const id of pl.ids) {
      const m = byId.get(id);
      if (m) b = unionBox(b, itemBounds(m));
    }
    return b;
  });
  let all = emptyBox();
  for (const b of boxes) if (!boxIsEmpty(b)) all = unionBox(all, b);
  if (boxIsEmpty(all)) return out;
  const c = boxCenter(all);
  places.forEach((pl, i) => {
    const b = boxes[i]!;
    if (boxIsEmpty(b)) return;
    const pc = boxCenter(b);
    const d: [number, number, number] = [(pc[0] - c[0]) * k, (pc[1] - c[1]) * k, (pc[2] - c[2]) * k];
    if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
    for (const id of pl.ids) out.set(id, d);
  });
  return out;
}

/** 그물마다 겉모습(바꿀 것이 없는 그물은 빠진다) */
export function desiredLooks(inp: LookInput): Map<string, Look> {
  const out = new Map<string, Look>();
  const parts = inp.fixed?.size ? inp.items.filter((x) => !inp.fixed!.has(x.id)) : inp.items;
  const places = inp.partColors || inp.explode > 0 ? partPlacements(parts, inp.products) : [];
  const colorOf = new Map<string, Rgba>();
  if (inp.partColors) {
    const productIndex = new Map<string, number>();
    for (const pl of places) {
      let i = productIndex.get(pl.product);
      if (i === undefined) productIndex.set(pl.product, (i = productIndex.size));
      const c = partColor(i);
      for (const id of pl.ids) colorOf.set(id, c);
    }
  }
  const moves = explodeOffsets(parts, places, inp.explode * EXPLODE_SCALE);
  for (const m of inp.items) {
    const id = m.id;
    const user = inp.opacity.get(id);
    const dimmed = !!inp.dim && !inp.dim.has(id);
    const alpha = dimmed ? Math.min(DIM_ALPHA, user ?? 1) : user !== undefined && user < 1 ? user : null;
    const color = colorOf.get(id) ?? null;
    const d = moves.get(id);
    const matrix = d ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0], d[1], d[2], 1] : null;
    if (alpha === null && !color && !matrix) continue;
    out.set(id, { alpha, pickable: !dimmed, color, matrix });
  }
  return out;
}

/** 겉모습 비교 열쇠(같으면 코어에 다시 넘기지 않는다) */
export function lookKey(l: Look): string {
  return `${l.alpha ?? ''}|${l.pickable ? 1 : 0}|${l.color ? l.color.map((x) => x.toFixed(4)).join(',') : ''}|${l.matrix ? l.matrix.slice(12, 15).map((x) => x.toPrecision(9)).join(',') : ''}`;
}
