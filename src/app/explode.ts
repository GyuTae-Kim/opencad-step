/**
 * 분해 보기의 이동량(순수, DOM 없음 — 첫 화면 JS 밖: 문서를 열 때 미리 받아 둔다).
 *
 * 두 방식:
 * - 'step'(조립 단계별, 기본): 제품 나무를 따라 바깥 조립부터 한 단계씩 벌린다(Autodesk 뷰어의 계층 분해처럼).
 *   밀대 0~100%를 단계 수로 고르게 나눠, 첫 구간에는 맨 위 조립 바로 아래의 하위 조립·부품이(하위 조립은 통째로)
 *   그 조립 가운데에서 멀어지고, 다음 구간에는 하위 조립마다 그 안의 하위 조립·부품이 그 하위 조립 가운데에서 멀어진다.
 *   자리마다 옮기는 양은 조상들이 옮긴 양을 더한 것이다(하위 조립 안의 부품은 그 하위 조립과 함께 간다).
 *   자식이 하나뿐인(다른 형상이 없는) 마디는 단계로 치지 않는다. 단계가 하나뿐인 평평한 조립은 'all'과 같다.
 * - 'all'(한꺼번에): 부품 자리(형상이 놓인 나무 마디)마다 그 가운데가 조립 가운데에서 멀어진다(예전 분해 그대로).
 * 100%에서 한 단계의 이동은 (자리 가운데 − 부모 가운데) × EXPLODE_SCALE이다. 마디에 바로 놓인 형상(부품의 몸체·선 형상)은
 * 한 덩어리로 움직이고, 나무에 없는 묶음은 하나씩 맨 위 단계에서 움직인다.
 *
 * 계획(explodePlan)은 묶음마다 범위를 한 번만 재서 단계별 이동 벡터를 남기고, 밀대를 움직일 때는 explodeMoves로 곱하기만 한다.
 */
import { boxCenter, boxIsEmpty, emptyBox, itemBounds, unionBox } from 'opencad-viewer3d/bounds';
import type { Box3 } from 'opencad-viewer3d/types';
import type { ProductNode } from './doc';
import type { LookItem } from './looks';

/** 분해 방식: 조립 단계별 · 한꺼번에 */
export type ExplodeMode = 'step' | 'all';
/** 분해 100%에서 자리가 부모(조립) 가운데에서 떨어진 거리의 몇 배를 더 옮기는지 */
export const EXPLODE_SCALE = 1.5;

type V3 = [number, number, number];

/** 분해 계획: 단계 수와 묶음마다 [단계(1부터), dx, dy, dz]를 이은 것(100%·배율 1 기준) */
export interface ExplodePlan {
  mode: ExplodeMode;
  /** 움직이는 단계 수(0이면 옮길 것이 없다) */
  levels: number;
  steps: Map<string, number[]>;
}

/** 분해 단위: 잎(ids만 — 마디에 바로 놓인 형상)이거나 자식 단위가 둘 이상인 묶음 */
interface Unit {
  ids: string[];
  kids: Unit[];
  box: Box3;
}

/**
 * 장면 묶음과 제품 나무로 분해 계획을 세운다. items는 움직일 묶음만(표현 PMI는 빼고) 준다.
 * 같은 묶음이 나무에 두 번 나오면 먼저 나온 자리만 쓴다(부품 색의 자리 나누기와 같다)
 */
export function explodePlan(items: readonly LookItem[], products: readonly ProductNode[], mode: ExplodeMode): ExplodePlan {
  const boxOf = new Map<string, Box3>();
  for (const m of items) boxOf.set(m.id, itemBounds(m));
  const seen = new Set<string>();
  const leaf = (ids: string[]): Unit => {
    let box = emptyBox();
    for (const id of ids) {
      const b = boxOf.get(id)!;
      if (!boxIsEmpty(b)) box = unionBox(box, b);
    }
    return { ids, kids: [], box };
  };
  const group = (kids: Unit[]): Unit => {
    let box = emptyBox();
    for (const k of kids) if (!boxIsEmpty(k.box)) box = unionBox(box, k.box);
    return { ids: kids.flatMap((k) => k.ids), kids, box };
  };
  // 마디 → 단위: 바로 놓인 형상(잎 하나) + 자식 마디들. 단위가 하나뿐이면 그것으로 줄인다(단계로 치지 않는다)
  const unitOf = (n: ProductNode): Unit | null => {
    const kids: Unit[] = [];
    const own = [...n.meshIds, ...(n.lineIds ?? [])].filter((id) => boxOf.has(id) && !seen.has(id));
    for (const id of own) seen.add(id);
    if (own.length) kids.push(leaf(own));
    for (const c of n.children) {
      const u = unitOf(c);
      if (u) kids.push(u);
    }
    return kids.length === 0 ? null : kids.length === 1 ? kids[0]! : group(kids);
  };
  const top: Unit[] = [];
  for (const r of products) {
    const u = unitOf(r);
    if (u) top.push(u);
  }
  for (const m of items) if (!seen.has(m.id)) top.push(leaf([m.id]));
  const plan: ExplodePlan = { mode, levels: 0, steps: new Map() };
  if (!top.length) return plan;
  const root = top.length === 1 ? top[0]! : group(top);
  if (boxIsEmpty(root.box)) return plan;
  const add = (u: Unit, level: number, from: V3): void => {
    if (boxIsEmpty(u.box)) return;
    const c = boxCenter(u.box);
    const d = [c[0] - from[0], c[1] - from[1], c[2] - from[2]];
    if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
    for (const id of u.ids) {
      let s = plan.steps.get(id);
      if (!s) plan.steps.set(id, (s = []));
      s.push(level, d[0]!, d[1]!, d[2]!);
    }
    if (level > plan.levels) plan.levels = level;
  };
  if (mode === 'all') {
    // 잎(부품 자리)마다 조립 가운데에서
    const c = boxCenter(root.box);
    const leaves = (u: Unit): void => {
      if (!u.kids.length) add(u, 1, c);
      else for (const k of u.kids) leaves(k);
    };
    leaves(root);
    return plan;
  }
  // 조립 단계별: 묶음마다 자식 단위를 그 묶음 가운데에서, 자식 묶음은 다음 단계로
  const walk = (u: Unit, level: number): void => {
    const c = boxCenter(u.box);
    for (const k of u.kids) {
      add(k, level, c);
      if (k.kids.length && !boxIsEmpty(k.box)) walk(k, level + 1);
    }
  };
  walk(root, 1);
  return plan;
}

/** 단계 하나의 진행(0~1): 밀대 t(0~1)를 단계 수로 고르게 나눈 구간에서 */
const stageFraction = (s: number, level: number): number => Math.max(0, Math.min(1, s - (level - 1)));

/** 밀대 t(0~1)에서 묶음마다 옮길 양(옮기지 않는 묶음은 빠진다) */
export function explodeMoves(plan: ExplodePlan, t: number, scale = EXPLODE_SCALE): Map<string, V3> {
  const out = new Map<string, V3>();
  if (!(t > 0) || !plan.levels) return out;
  const s = Math.min(1, t) * plan.levels;
  for (const [id, st] of plan.steps) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < st.length; i += 4) {
      const f = stageFraction(s, st[i]!) * scale;
      if (!f) continue;
      x += st[i + 1]! * f;
      y += st[i + 2]! * f;
      z += st[i + 3]! * f;
    }
    if (x || y || z) out.set(id, [x, y, z]);
  }
  return out;
}

/** 밀대 t(0~1)가 지금 벌리는 단계(1부터, 분해 전이면 0) */
export function explodeStage(plan: Pick<ExplodePlan, 'levels'>, t: number): number {
  if (!(t > 0) || !plan.levels) return 0;
  return Math.min(plan.levels, Math.max(1, Math.ceil(Math.min(1, t) * plan.levels - 1e-9)));
}
