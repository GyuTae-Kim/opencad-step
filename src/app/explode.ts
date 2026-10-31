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
 * 방향(ExplodeAxis): 'free'(사방, 기본)는 위 이동 그대로이고, 'x'·'y'·'z'는 그 이동의 장면 축 성분만 쓴다(그 축으로만 벌린다 —
 * 볼트·와셔처럼 한 축에 꿴 부품을 그 축으로 떼어 볼 때). 'sx'·'sy'는 화면 가로(카메라 오른쪽)·화면 세로(카메라 위) 성분만,
 * 'sp'(화면 평면)는 보는 방향 성분을 뺀 나머지(화면 가로·세로 두 축)만 쓴다. 화면 방향은 계획을 세울 때 받은 카메라 각(ExplodeView —
 * 앱은 분해를 켜거나 그 방향을 고를 때의 카메라를 준다)으로 정해 두므로 돌려 보는 동안 계획이 흔들리지 않는다.
 * 그 방향으로는 부모 가운데와 같은 자리라 움직이지 않는 단위는 제자리이고, 조립 단계별에서 그 방향으로 움직이는 것이 하나도 없는 단계는
 * 건너뛴다(밀대 구간을 비워 두지 않는다). 100%에서는 사방 분해 자리의 그 성분과 같다(이동이 조상 이동의 합이고 성분만 남기기는
 * 더하기와 바꿔 써도 같다) — 아래 겹친 자리 떼기로 옮긴 단위만 빼고.
 *
 * 겹친 자리 떼기(축 하나 — x·y·z·sx·sy, opts.stack로 끌 수 있다): 같은 부모 아래 단위(조립 단계별은 같은 단계의 형제, 한꺼번에는
 * 모든 부품 자리) 가운데 그 축에 수직인 두 방향으로 범위 상자가 겹치고 그 축 위 가운데가 거의 같은 것(가운데 차가 두 단위의 그 축 반폭
 * 가운데 작은 것 이하이고 100%에서도 그 축으로 범위가 겹치는 것 — 같은 자리 볼트·와셔 묶음, 같은 축 위 겹친 원판)은 한데 남지 않게
 * 차례를 정해 그 축으로 떼어 놓는다. 겹침으로 이어진 묶음마다 수직 면 넓이가 가장 큰 단위(바깥 부품)를 제 분해 자리에 두고, 나머지는
 * 넓이 차례로 제 분해 자리에서 축을 따라 처음 비는 자리로 옮긴다 — 수직 면이 겹치는 형제(묶음 안은 이미 놓은 것, 묶음 밖은 제 분해 자리에서
 * 겹치지 않던 것)와 100%에서 범위가 겹치지 않고 두 반폭 합의 ¼만큼 띄운 자리. 묶음이 부모 가운데에서 움직이는 쪽으로만 찾고, 부모 가운데에
 * 있으면 가까운 쪽(같으면 +). 옮길 거리가 (부모 반폭 + 제 반폭) × 2 + 묶음 반폭 합 × 1.25(조립 대각선 절반까지)를 넘으면 그대로 둔다
 * (큰 하위 조립이 장면 밖으로 날아가지 않게). 떼는 양은 그 단계의 이동에 더하므로 조립 단계별 차례(하위 조립은 통째로, 그 안은 다음 단계에)와
 * 어긋나지 않는다.
 *
 * 계획(explodePlan)은 묶음마다 범위를 한 번만 재서 단계별 이동 벡터를 남기고, 밀대를 움직일 때는 explodeMoves로 곱하기만 한다.
 *
 * 손질(끌어 옮긴 부품의 덧이동 — explodetweak.ts)을 걸 수 있게 계획은 분해 단위마다 나무 자리 낱말(token)과 벌어지는 단계를 남긴다(units·owner).
 * 낱말은 마디 경로("0/2/1" — 보기 링크의 고른 것 낱말과 같은 꼴)이고, 마디에 바로 놓인 형상이 자식 마디와 함께 있으면 그 형상 덩어리는 "0/2/1.0"이다.
 * 자식이 하나뿐이라 줄인 마디는 여러 낱말이 한 단위를 가리키고, 그 단위의 낱말(token)은 가장 위 마디의 것이다(나무 모양이 같으면 늘 같다).
 * 단위의 단계(level)는 그 단위가 형제와 함께 부모 가운데에서 벌어지는 계획 단계다 — 조립 단계별은 그 단계(움직이는 것이 없어 건너뛴 단계면
 * 그다음 남은 단계, 없으면 마지막 단계), 한꺼번에는 모두 1. 덧이동은 그 단계의 진행과 함께 늘어(explodeMoves) 0%에서 0, 100%에서 다 간다.
 * 맨 위 전체와 나무에 없는 묶음은 단계가 0이라 손질하지 않는다.
 */
import { basisFromAngles } from 'opencad-viewer3d/camera';
import { boxCenter, boxDiagonal, boxIsEmpty, emptyBox, itemBounds, unionBox } from 'opencad-viewer3d/bounds';
import type { Box3 } from 'opencad-viewer3d/types';
import type { ProductNode } from './doc';
import type { LookItem } from './looks';

/** 분해 방식: 조립 단계별 · 한꺼번에 */
export type ExplodeMode = 'step' | 'all';
/** 분해 방향: 사방(기본) · 장면 X·Y·Z축 하나로만 · 화면 가로·화면 세로 하나로만 · 화면 평면(보는 방향에 수직인 두 축) */
export type ExplodeAxis = 'free' | 'x' | 'y' | 'z' | 'sx' | 'sy' | 'sp';
/** 화면 방향 분해 */
export type ScreenAxis = 'sx' | 'sy' | 'sp';
/** 화면 방향을 정한 카메라 각(라디안 — 코어 카메라의 yaw·pitch, 굴림 없음) */
export interface ExplodeView {
  yaw: number;
  pitch: number;
}
/** 분해 100%에서 자리가 부모(조립) 가운데에서 떨어진 거리의 몇 배를 더 옮기는지 */
export const EXPLODE_SCALE = 1.5;
/** 겹친 자리 떼기로 옮길 수 있는 거리: (부모 반폭 + 제 반폭)의 이 배 + 묶음 반폭 합의 STACK_ALLOW배(조립 대각선 절반까지) */
const STACK_CAP = 2;
const STACK_ALLOW = 1.25;

type V3 = [number, number, number];

/** 화면 방향 분해인지(카메라 각으로 방향을 정한다) */
export const isScreenAxis = (a: ExplodeAxis | undefined): a is ScreenAxis => a === 'sx' || a === 'sy' || a === 'sp';

/**
 * 분해 단위(손질을 거는 쪽에서 보는 것): 나무 자리 낱말, 움직이는 묶음 id, 벌어지는 단계(0이면 손질하지 않는다), 부모 단위,
 * 제자리(벌리기 전) 범위 상자(39차 — 손질 파일의 부품 지문 explodefile.ts가 읽는다)
 */
export interface PlanUnit {
  readonly token?: string;
  readonly ids: readonly string[];
  readonly level?: number;
  readonly parent?: PlanUnit;
  readonly box?: Box3;
}

/** 분해 계획: 단계 수와 묶음마다 [단계(1부터), dx, dy, dz]를 이은 것(100%·배율 1 기준) */
export interface ExplodePlan {
  mode: ExplodeMode;
  axis: ExplodeAxis;
  /** 화면 방향 분해의 카메라 각 */
  view?: ExplodeView;
  /** 움직이는 단계 수(0이면 옮길 것이 없다) */
  levels: number;
  steps: Map<string, number[]>;
  /** 겹친 자리 떼기로 자리를 바꾼 단위 수(축 하나일 때 — 묶음마다 제자리에 남긴 하나는 세지 않는다) */
  stacked: number;
  /** 나무 자리 낱말 → 분해 단위(줄인 마디의 낱말도 같은 단위를 가리킨다) */
  units: Map<string, PlanUnit>;
  /** 묶음 id → 그 묶음이 든 가장 안쪽 단위 */
  owner: Map<string, PlanUnit>;
  /** 조립(움직일 묶음 전체) 범위 대각선 */
  size: number;
}

/** 분해 단위: 잎(ids만 — 마디에 바로 놓인 형상)이거나 자식 단위가 둘 이상인 묶음 */
interface Unit {
  ids: string[];
  kids: Unit[];
  box: Box3;
  token?: string;
  level?: number;
  parent?: Unit;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** 상자를 단위 벡터 v에 비춘 구간의 가운데·반폭(축 나란한 v면 정확하고, 기운 v면 넉넉하게) */
function along(b: Box3, v: readonly number[]): [number, number] {
  let c = 0;
  let h = 0;
  for (let k = 0; k < 3; k++) {
    c += ((b.min[k]! + b.max[k]!) / 2) * v[k]!;
    h += ((b.max[k]! - b.min[k]!) / 2) * Math.abs(v[k]!);
  }
  return [c, h];
}

/**
 * 장면 묶음과 제품 나무로 분해 계획을 세운다. items는 움직일 묶음만(표현 PMI는 빼고) 준다.
 * 같은 묶음이 나무에 두 번 나오면 먼저 나온 자리만 쓴다(부품 색의 자리 나누기와 같다).
 * opts.view: 화면 방향 분해의 카메라 각(없으면 앞에서 본 yaw 0·pitch 0). opts.stack: 축 하나로 벌릴 때 겹친 자리 떼기(기본 켬 — 끄면 31차 계획 그대로)
 */
export function explodePlan(
  items: readonly LookItem[],
  products: readonly ProductNode[],
  mode: ExplodeMode,
  axis: ExplodeAxis = 'free',
  opts: { view?: ExplodeView; stack?: boolean } = {},
): ExplodePlan {
  const boxOf = new Map<string, Box3>();
  for (const m of items) boxOf.set(m.id, itemBounds(m));
  const seen = new Set<string>();
  const units = new Map<string, Unit>();
  const owner = new Map<string, Unit>();
  const leaf = (ids: string[]): Unit => {
    let box = emptyBox();
    for (const id of ids) {
      const b = boxOf.get(id)!;
      if (!boxIsEmpty(b)) box = unionBox(box, b);
    }
    const u: Unit = { ids, kids: [], box };
    for (const id of ids) owner.set(id, u);
    return u;
  };
  const group = (kids: Unit[]): Unit => {
    let box = emptyBox();
    for (const k of kids) if (!boxIsEmpty(k.box)) box = unionBox(box, k.box);
    const u: Unit = { ids: kids.flatMap((k) => k.ids), kids, box };
    for (const k of kids) k.parent = u;
    return u;
  };
  // 낱말 붙이기: 부모 마디가 나중에 붙여 줄인 단위의 낱말은 가장 위 마디의 것이 된다
  const name = (u: Unit, key: string): void => {
    u.token = key;
    units.set(key, u);
  };
  // 마디 → 단위: 바로 놓인 형상(잎 하나) + 자식 마디들. 단위가 하나뿐이면 그것으로 줄인다(단계로 치지 않는다)
  const unitOf = (n: ProductNode, key: string): Unit | null => {
    const kids: Unit[] = [];
    const own = [...n.meshIds, ...(n.lineIds ?? [])].filter((id) => boxOf.has(id) && !seen.has(id));
    for (const id of own) seen.add(id);
    if (own.length) {
      const l = leaf(own);
      name(l, `${key}.0`);
      kids.push(l);
    }
    n.children.forEach((c, i) => {
      const u = unitOf(c, `${key}/${i}`);
      if (u) kids.push(u);
    });
    const u = kids.length === 0 ? null : kids.length === 1 ? kids[0]! : group(kids);
    if (u) name(u, key);
    return u;
  };
  const top: Unit[] = [];
  products.forEach((r, i) => {
    const u = unitOf(r, String(i));
    if (u) top.push(u);
  });
  for (const m of items) if (!seen.has(m.id)) top.push(leaf([m.id]));
  const view = isScreenAxis(axis) ? { yaw: opts.view?.yaw ?? 0, pitch: opts.view?.pitch ?? 0 } : undefined;
  const plan: ExplodePlan = { mode, axis, ...(view ? { view } : {}), levels: 0, steps: new Map(), stacked: 0, units, owner, size: 0 };
  if (!top.length) return plan;
  const root = top.length === 1 ? top[0]! : group(top);
  if (boxIsEmpty(root.box)) return plan;
  plan.size = boxDiagonal(root.box);
  // 방향: 장면 축 하나는 그 성분만(다른 성분은 정확히 0), 화면 방향은 카메라 틀에 비춘 성분(아주 작은 성분은 0 — 같은 자리는 제자리)
  const keep = axis === 'x' ? 0 : axis === 'y' ? 1 : axis === 'z' ? 2 : -1;
  const b = view ? basisFromAngles(view.yaw, view.pitch) : null;
  const half = boxDiagonal(root.box) / 2;
  const tiny = half * 2e-9;
  const comp = (d: readonly number[], v: readonly number[]) => {
    const s = dot(d, v);
    return Math.abs(s) <= tiny ? 0 : s;
  };
  const project = (d: V3): V3 => {
    if (keep >= 0) {
      for (let k = 0; k < 3; k++) if (k !== keep) d[k] = 0;
      return d;
    }
    if (!b) return d;
    const r = axis === 'sy' ? 0 : comp(d, b.right);
    const u = axis === 'sx' ? 0 : comp(d, b.up);
    return [r * b.right[0] + u * b.up[0], r * b.right[1] + u * b.up[1], r * b.right[2] + u * b.up[2]];
  };
  // 겹친 자리 떼기를 할 축(단위 벡터)과 그에 수직인 두 방향
  const unit = (k: number): V3 => [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
  const line: V3 | null = keep >= 0 ? unit(keep) : b && axis === 'sx' ? b.right : b && axis === 'sy' ? b.up : null;
  const perp: [V3, V3] | null = keep >= 0 ? [unit((keep + 1) % 3), unit((keep + 2) % 3)] : b && axis === 'sx' ? [b.up, b.back] : b && axis === 'sy' ? [b.right, b.back] : null;
  const stack = opts.stack !== false && line && perp ? { line, perp } : null;
  const put = (u: Unit, level: number, d: V3): void => {
    if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
    for (const id of u.ids) {
      let s = plan.steps.get(id);
      if (!s) plan.steps.set(id, (s = []));
      s.push(level, d[0], d[1], d[2]);
    }
    if (level > plan.levels) plan.levels = level;
  };
  /** 형제 단위들을 부모(범위 parentBox) 가운데에서 벌리는 이동(겹친 자리 떼기 포함) */
  const spread = (kids: readonly Unit[], level: number, parentBox: Box3): void => {
    const c = boxCenter(parentBox);
    const live = kids.filter((u) => !boxIsEmpty(u.box));
    const ds = live.map((u): V3 => {
      const m = boxCenter(u.box);
      return project([m[0] - c[0], m[1] - c[1], m[2] - c[2]]);
    });
    if (stack && live.length > 1) plan.stacked += separate(live, ds, stack.line, stack.perp, tiny, along(parentBox, stack.line)[1], half);
    live.forEach((u, i) => {
      u.level = level;
      put(u, level, ds[i]!);
    });
  };
  if (mode === 'all') {
    // 잎(부품 자리)마다 조립 가운데에서
    const all: Unit[] = [];
    const leaves = (u: Unit): void => {
      if (!u.kids.length) all.push(u);
      else for (const k of u.kids) leaves(k);
    };
    leaves(root);
    spread(all, 1, root.box);
    // 손질은 한꺼번에 벌어지는 한 단계에서(하위 조립도 그 아래 부품과 함께)
    for (const u of new Set(units.values())) u.level = u === root || boxIsEmpty(u.box) ? 0 : 1;
    return plan;
  }
  // 조립 단계별: 묶음마다 자식 단위를 그 묶음 가운데에서, 자식 묶음은 다음 단계로
  const walk = (u: Unit, level: number): void => {
    spread(u.kids, level, u.box);
    for (const k of u.kids) if (k.kids.length && !boxIsEmpty(k.box)) walk(k, level + 1);
  };
  walk(root, 1);
  const rank = axis !== 'free' ? compactLevels(plan) : null;
  // 손질 단계: 그 단위가 벌어지는 단계(움직이는 것이 없어 건너뛰었거나 빈 단계면 그다음 남은 단계, 없으면 마지막 단계)
  const used = rank ? [...rank.keys()].sort((a, b) => a - b) : [...new Set([...plan.steps.values()].flatMap((st) => st.filter((_, i) => i % 4 === 0)))].sort((a, b) => a - b);
  root.level = 0;
  for (const u of new Set(units.values())) {
    if (u === root || !u.level) continue;
    const raw = used.find((l) => l >= u.level!) ?? used[used.length - 1];
    u.level = raw === undefined ? 1 : rank ? rank.get(raw)! : raw;
  }
  return plan;
}

/** 단위 손질의 진행(0~1): 밀대 t에서 그 단위가 벌어지는 단계의 진행(계획에 단계가 없으면 t 그대로) */
export function unitFraction(plan: Pick<ExplodePlan, 'levels'>, level: number, t: number): number {
  if (!(t > 0) || !(level > 0)) return 0;
  return stageFraction(Math.min(1, t) * Math.max(1, plan.levels), level);
}

/**
 * 겹친 자리 떼기: 형제 단위(live)와 그 이동(ds — 축 a 방향 성분만 있는 벡터)에서, 축에 수직인 두 방향(p)으로 범위가 겹치고
 * 축 위 가운데가 거의 같은 단위끼리(겹침으로 이어진 것끼리) 묶어 하나만 제 자리에 두고 나머지를 축을 따라 비는 자리로 옮긴다.
 * ds를 고치고, 자리를 바꾼 단위 수를 돌려준다. tiny = 같은 자리로 칠 길이(장면 크기의 1e-9), H = 부모의 그 축 반폭, R = 조립 대각선 절반
 */
function separate(live: readonly Unit[], ds: V3[], a: V3, p: [V3, V3], tiny: number, H: number, R: number): number {
  const n = live.length;
  const s = new Float64Array(n);
  const h = new Float64Array(n);
  const pc = [new Float64Array(n), new Float64Array(n)] as const;
  const ph = [new Float64Array(n), new Float64Array(n)] as const;
  for (let i = 0; i < n; i++) {
    [s[i], h[i]] = along(live[i]!.box, a);
    for (let q = 0; q < 2; q++) [pc[q][i], ph[q][i]] = along(live[i]!.box, p[q]);
  }
  // 수직 면 겹침: 두 방향 모두 겹친 길이가 좁은 쪽 폭의 1/1000보다 길다(맞닿기만 한 것은 겹침이 아니다)
  const crossOverlap = (i: number, j: number): boolean => {
    for (let q = 0; q < 2; q++) {
      const lo = Math.max(pc[q][i]! - ph[q][i]!, pc[q][j]! - ph[q][j]!);
      const hi = Math.min(pc[q][i]! + ph[q][i]!, pc[q][j]! + ph[q][j]!);
      if (!(hi - lo > 2e-3 * Math.min(ph[q][i]!, ph[q][j]!))) return false;
    }
    return true;
  };
  // 같은 자리: 축 위 가운데 차가 두 반폭 가운데 작은 것 이하이고, 100%에서도(가운데 차가 1 + EXPLODE_SCALE배) 축으로 범위가 겹친다
  const sameSpot = (i: number, j: number): boolean => {
    const gap = Math.abs(s[i]! - s[j]!);
    return gap <= Math.min(h[i]!, h[j]!) + tiny && (1 + EXPLODE_SCALE) * gap <= (h[i]! + h[j]!) * (1 - 1e-9) + tiny;
  };
  // 축 위 가운데 차례로 쓸어 나가며(가운데 차는 앞 단위의 반폭까지만 본다) 겹침으로 이어진 묶음(합집합 찾기)
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const ord = [...Array(n).keys()].sort((i, j) => s[i]! - s[j]! || i - j);
  let joined = false;
  for (let x = 0; x < n; x++) {
    const i = ord[x]!;
    for (let y = x + 1; y < n; y++) {
      const j = ord[y]!;
      if (s[j]! - s[i]! > h[i]! + tiny) break;
      if (!sameSpot(i, j) || !crossOverlap(i, j)) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) {
        parent[Math.max(ri, rj)] = Math.min(ri, rj);
        joined = true;
      }
    }
  }
  if (!joined) return 0;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  }
  // 100%에서 축 위 가운데(처음은 제 분해 자리 — 떼면 바뀐다)
  const d = Float64Array.from(ds, (v) => dot(v, a));
  const natural = Float64Array.from(s, (x, i) => x + EXPLODE_SCALE * d[i]!);
  const cur = natural.slice();
  const inGroup = new Int32Array(n).fill(-1);
  const placed = new Uint8Array(n);
  let moved = 0;
  const area = (i: number) => ph[0][i]! * ph[1][i]!;
  for (const [r, g] of groups) {
    if (g.length < 2) continue;
    for (const i of g) inGroup[i] = r;
    // 수직 면 넓이가 큰 차례(같으면 축 반폭이 긴 것, 그다음 나무 차례) — 첫째는 제 분해 자리에 남는다
    g.sort((i, j) => area(j) - area(i) || h[j]! - h[i]! || i - j);
    placed[g[0]!] = 1;
    const mean = g.reduce((x, i) => x + d[i]!, 0) / g.length;
    const size = Math.max(...g.map((i) => Math.max(h[i]!, ph[0][i]!, ph[1][i]!)));
    const stackLen = g.reduce((x, i) => x + h[i]!, 0);
    // 묶음이 부모 가운데에서 움직이는 쪽(그 축으로 부모 가운데에 있으면 0 — 가까운 쪽, 같으면 +)
    const side = Math.abs(mean) <= tiny ? 0 : Math.sign(mean);
    for (let k = 1; k < g.length; k++) {
      const m = g[k]!;
      // 막는 구간: 수직 면이 겹치는 형제의 100% 자리(묶음 안은 이미 놓은 것만, 묶음 밖은 제 분해 자리에서 이미 겹친 것은 빼고 —
      // 같은 자리가 아닌 겹침은 풀지 않는다) — 가운데가 이 안이면 겹친다. 틈은 두 반폭 합의 ¼(둘 다 납작하면 묶음 크기의 1/20)
      const block: [number, number][] = [];
      for (let j = 0; j < n; j++) {
        if (j === m || !crossOverlap(m, j)) continue;
        if (inGroup[j] === r ? !placed[j] : Math.abs(natural[m]! - cur[j]!) < h[m]! + h[j]!) continue;
        const w = h[j]! + h[m]! + ((h[j]! + h[m]!) / 4 || size / 20);
        block.push([cur[j]! - w, cur[j]! + w]);
      }
      // 제 분해 자리에서 축을 따라 막는 구간을 건너 처음 비는 자리(쪽이 정해지지 않았으면 가까운 쪽)
      const free = (dir: number): number => {
        let c = natural[m]!;
        for (let guard = 0; guard <= block.length; guard++) {
          const hit = block.find(([lo, hi]) => c > lo + tiny && c < hi - tiny);
          if (!hit) break;
          c = dir > 0 ? hit[1] : hit[0];
        }
        return c;
      };
      let c = side !== 0 ? free(side) : free(1);
      if (side === 0) {
        const down = free(-1);
        if (Math.abs(down - natural[m]!) < Math.abs(c - natural[m]!)) c = down;
      }
      placed[m] = 1;
      if (Math.abs(c - natural[m]!) <= tiny) continue;
      // 너무 멀면((부모 반폭 + 제 반폭) × 2 + 묶음 반폭 합 × 1.25(조립 대각선 절반까지)를 넘으면) 떼지 않는다 — 큰 하위 조립이 장면 밖으로 날아가지 않게
      if (Math.abs(c - natural[m]!) > STACK_CAP * (H + h[m]!) + Math.min(STACK_ALLOW * stackLen, R)) continue;
      cur[m] = c;
      // 100%에서 가운데가 c에 오도록 그 단계의 축 이동을 바꾼다
      const extra = (c - s[m]!) / EXPLODE_SCALE - d[m]!;
      const v = ds[m]!;
      for (let q = 0; q < 3; q++) v[q] = v[q] + extra * a[q];
      moved++;
    }
  }
  return moved;
}

/** 방향을 고른 분해에서 그 방향으로 움직이는 것이 없는 단계를 빼고 단계 번호를 1부터 다시 매긴다(남은 단계 → 새 번호를 돌려준다) */
function compactLevels(plan: ExplodePlan): Map<number, number> {
  const used = new Set<number>();
  for (const st of plan.steps.values()) for (let i = 0; i < st.length; i += 4) used.add(st[i]!);
  const rank = new Map([...used].sort((a, b) => a - b).map((l, i) => [l, i + 1]));
  for (const st of plan.steps.values()) for (let i = 0; i < st.length; i += 4) st[i] = rank.get(st[i]!)!;
  plan.levels = rank.size;
  return rank;
}

/** 단계 하나의 진행(0~1): 밀대 t(0~1)를 단계 수로 고르게 나눈 구간에서 */
const stageFraction = (s: number, level: number): number => Math.max(0, Math.min(1, s - (level - 1)));

/** 손질 하나(계획에 더할 덧이동): 움직일 묶음, 그 단위가 벌어지는 단계, 100%에서의 세계 이동 */
export interface PlanTweak {
  ids: readonly string[];
  level: number;
  d: readonly number[];
}

/** 밀대 t(0~1)에서 묶음마다 옮길 양(옮기지 않는 묶음은 빠진다). tweaks는 그 단위의 단계 진행만큼 더한다(배율 없이) */
export function explodeMoves(plan: ExplodePlan, t: number, scale = EXPLODE_SCALE, tweaks?: readonly PlanTweak[]): Map<string, V3> {
  const out = new Map<string, V3>();
  if (!(t > 0)) return out;
  if (plan.levels) {
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
  }
  for (const tw of tweaks ?? []) {
    const f = unitFraction(plan, tw.level, t);
    if (!f) continue;
    const [dx, dy, dz] = [tw.d[0]! * f, tw.d[1]! * f, tw.d[2]! * f];
    for (const id of tw.ids) {
      const v = out.get(id);
      if (v) {
        v[0] += dx;
        v[1] += dy;
        v[2] += dz;
      } else out.set(id, [dx, dy, dz]);
    }
  }
  return out;
}

/** 밀대 t(0~1)가 지금 벌리는 단계(1부터, 분해 전이면 0) */
export function explodeStage(plan: Pick<ExplodePlan, 'levels'>, t: number): number {
  if (!(t > 0) || !plan.levels) return 0;
  return Math.min(plan.levels, Math.max(1, Math.ceil(Math.min(1, t) * plan.levels - 1e-9)));
}
